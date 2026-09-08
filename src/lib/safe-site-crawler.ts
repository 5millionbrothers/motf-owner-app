import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import https from "node:https";
import * as cheerio from "cheerio";

const MAX_PAGES = 36;
const MAX_IMAGES = 300;
const MAX_HTML_BYTES = 3_000_000;
const PAGE_TIMEOUT_MS = 15_000;
const LINK_HINT = /(객실|방|room|시설|부대|facility|수영|pool|요금|가격|price|예약|calendar|소개|about|오시는|위치|location|special|preview|detail)/i;
const IMAGE_SKIP = /(logo|icon|favicon|sprite|button|loading|arrow|blank|pixel|tracking|spacer)/i;
const IMAGE_LIKE = /\.(?:jpe?g|png|webp|gif)(?:$|[?#])/i;

export type CrawledSite = {
  canonicalUrl: string;
  pages: Array<{ url: string; title: string; text: string; structuredData: string[]; imageUrls?: string[] }>;
  imageUrls: string[];
  visualEvidenceUrls?: string[];
};

type FetchOptions = { method?: "GET" | "POST"; headers?: Record<string, string>; body?: string };

function isPrivateAddress(address: string) {
  const normalized = address.toLowerCase().split("%")[0];
  if (normalized === "::1" || normalized === "::" || normalized.startsWith("fe80:") || normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  const target = mapped || normalized;
  if (isIP(target) !== 4) return false;
  const [a, b] = target.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}

async function assertPublicUrl(value: string, base?: string) {
  const url = new URL(value, base);
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw new Error("http 또는 https 공개 웹사이트만 사용할 수 있습니다.");
  if (url.port && !["80", "443"].includes(url.port)) throw new Error("일반 웹 포트(80/443)만 사용할 수 있습니다.");
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((item) => isPrivateAddress(item.address))) throw new Error("내부 네트워크 주소는 가져올 수 없습니다.");
  return url;
}

async function safeFetch(input: string, accept: string, options: FetchOptions = {}) {
  let url = await assertPublicUrl(input);
  let method = options.method || "GET";
  let body = options.body;
  for (let redirect = 0; redirect <= 4; redirect += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(url, {
        method, body, redirect: "manual", cache: "no-store", signal: controller.signal,
        headers: {
          Accept: accept,
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36 moTFStayImporter/2.0",
          ...options.headers,
        },
      });
    } finally { clearTimeout(timer); }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("웹사이트 이동 주소가 비어 있습니다.");
      url = await assertPublicUrl(location, url.toString());
      if (response.status === 303) { method = "GET"; body = undefined; }
      continue;
    }
    if (!response.ok) throw new Error(`웹사이트 응답 오류 (${response.status})`);
    return { response, url };
  }
  throw new Error("웹사이트 이동 횟수가 너무 많습니다.");
}

function absoluteUrl(value: string | undefined, base: string) {
  if (!value || /^(data|blob|javascript|mailto|tel):/i.test(value.trim())) return null;
  try {
    const url = new URL(value.trim().replace(/^['"]|['"]$/g, ""), base);
    return /^https?:$/.test(url.protocol) ? url.toString().split("#")[0] : null;
  } catch { return null; }
}

const IMAGE_VARIANT_PARAMS = new Set([
  "w", "width", "h", "height", "size", "resize", "quality", "q", "format", "fm",
  "fit", "crop", "thumbnail", "thumb", "dpr", "auto", "cache", "cb", "v", "ver", "version",
]);

function imageIdentity(value: string) {
  const url = new URL(value);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (IMAGE_VARIANT_PARAMS.has(key.toLowerCase())) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  return url.toString();
}

function compactText(value: string, max = 22_000) {
  return value.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim().slice(0, max);
}

function normalizedCharset(value?: string | null) {
  const charset = (value || "utf-8").trim().toLowerCase().replace(/["']/g, "");
  if (/^(euc-kr|ks_c_5601-1987|ks_c_5601|cp949|windows-949)$/.test(charset)) return "euc-kr";
  if (/^(utf8|utf-8)$/.test(charset)) return "utf-8";
  return charset;
}

function decodeHtml(bytes: Uint8Array, contentType: string) {
  const headerCharset = contentType.match(/charset\s*=\s*["']?([^;"'\s]+)/i)?.[1];
  const head = new TextDecoder("latin1").decode(bytes.slice(0, 24_000));
  const metaCharset = head.match(/<meta[^>]+charset\s*=\s*["']?\s*([^\s"'/>;]+)/i)?.[1]
    || head.match(/<meta[^>]+content\s*=\s*["'][^"']*charset\s*=\s*([^\s"';>]+)/i)?.[1];
  for (const charset of [headerCharset, metaCharset, "utf-8"].filter(Boolean).map(normalizedCharset)) {
    try { return new TextDecoder(charset).decode(bytes); } catch { /* try next encoding */ }
  }
  return new TextDecoder("utf-8").decode(bytes);
}

async function readHtml(url: string, options: FetchOptions = {}) {
  const { response, url: finalUrl } = await safeFetch(url, "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1", options);
  const type = response.headers.get("content-type") || "";
  if (!type.includes("text/html") && !type.includes("application/xhtml+xml") && !type.includes("text/plain")) throw new Error("HTML 웹페이지만 가져올 수 있습니다.");
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > MAX_HTML_BYTES) throw new Error("웹페이지 용량이 너무 큽니다.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_HTML_BYTES) throw new Error("웹페이지 용량이 너무 큽니다.");
  return { html: decodeHtml(bytes, type), finalUrl: finalUrl.toString() };
}

function addImage(images: Map<string, number>, value: string | undefined, base: string, score: number, context = "") {
  const absolute = absoluteUrl(value, base);
  if (!absolute) return;
  const pathname = new URL(absolute).pathname;
  if (!IMAGE_LIKE.test(absolute) && !/(image|photo|img|phinf|cdn)/i.test(absolute)) return;
  if (IMAGE_SKIP.test(`${pathname} ${context}`)) return;
  const identity = imageIdentity(absolute);
  for (const [existingUrl, existingScore] of images) {
    if (imageIdentity(existingUrl) !== identity) continue;
    if (score > existingScore) {
      images.delete(existingUrl);
      images.set(absolute, score);
    }
    return;
  }
  images.set(absolute, Math.max(images.get(absolute) || 0, score));
}

function collectImages($: cheerio.CheerioAPI, html: string, base: string, images: Map<string, number>) {
  addImage(images, $("meta[property='og:image']").attr("content"), base, 70, "og");
  $("img,source").each((_, element) => {
    const node = $(element);
    const context = `${node.attr("class") || ""} ${node.attr("id") || ""} ${node.attr("alt") || ""}`;
    const values = ["data-src", "data-lazy-src", "data-original", "data-url", "data-image", "src"].map((key) => node.attr(key)).filter(Boolean) as string[];
    for (const srcset of [node.attr("srcset"), node.attr("data-srcset")].filter(Boolean) as string[]) values.push(...srcset.split(",").map((item) => item.trim().split(/\s+/)[0]));
    values.forEach((value) => addImage(images, value, base, /gallery|room|photo|view/i.test(context) ? 100 : 80, context));
  });
  $("[style]").each((_, element) => {
    const node = $(element);
    const context = `${node.attr("class") || ""} ${node.attr("id") || ""}`;
    for (const match of node.attr("style")?.matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/gi) || []) addImage(images, match[1], base, 90, context);
  });
  $("a[href]").each((_, element) => addImage(images, $(element).attr("href"), base, 85, $(element).attr("class") || ""));
  for (const match of html.matchAll(/(?:background(?:-image)?\s*:|url\()\s*(?:url\()?\s*['"]?([^)'"\s]+\.(?:jpe?g|png|webp|gif)(?:\?[^)'"\s]*)?)/gi)) addImage(images, match[1], base, 75, "css-background");
}

function contactText($: cheerio.CheerioAPI) {
  return compactText([
    $("meta[name='description']").attr("content") || "",
    $("meta[property='og:description']").attr("content") || "",
    $("a[href^='tel:']").map((_, element) => `${$(element).text()} ${$(element).attr("href")}`).get().join(" "),
    $("footer,address,.footer,.contact,.address,#footer,#contact").map((_, element) => $(element).text()).get().join(" "),
  ].join("\n"), 5_000);
}

function queueCandidates($: cheerio.CheerioAPI, finalUrl: string, origin: string, seedSection: string, visited: Set<string>, candidates: Map<string, number>) {
  $("a[href]").each((_, element) => {
    const anchor = $(element);
    const absolute = absoluteUrl(anchor.attr("href"), finalUrl);
    if (!absolute) return;
    const url = new URL(absolute);
    if (url.origin !== origin || visited.has(absolute)) return;
    const label = compactText(`${anchor.text()} ${anchor.attr("title") || ""}`, 180);
    const hint = `${label} ${url.pathname} ${url.search}`;
    const opaqueDetail = Boolean(seedSection) && url.pathname.startsWith(`/${seedSection}/`) && /\/[a-f0-9]{20,}\/?$/i.test(url.pathname);
    if (!LINK_HINT.test(hint) && !opaqueDetail) return;
    const score = (LINK_HINT.test(label) ? 6 : 0) + (LINK_HINT.test(`${url.pathname} ${url.search}`) ? 4 : 0) + (opaqueDetail ? 3 : 0);
    candidates.set(absolute, Math.max(candidates.get(absolute) || 0, score));
  });
}

function pushPage(pages: CrawledSite["pages"], page: CrawledSite["pages"][number]) {
  if (!pages.some((item) => item.url === page.url)) pages.push(page);
}

function upcomingMonths(count = 12) {
  const now = new Date();
  return Array.from({ length: count }, (_, offset) => {
    const date = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    return { year: date.getFullYear(), month: date.getMonth() + 1, key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}` };
  });
}

async function addLetsNowGoPrices(htmlDocuments: string[], baseUrl: string, pages: CrawledSite["pages"]) {
  const combined = htmlDocuments.join("\n");
  const corpCode = combined.match(/corp_code\s*[:=]\s*["']([a-z0-9]+)["']/i)?.[1] || combined.match(/[?&]corp_code=([a-z0-9]+)/i)?.[1];
  if (!corpCode) return;
  const endpoint = new URL("/direct/get_calendar_price", baseUrl).toString();
  const results = await Promise.all(upcomingMonths().map(async (month) => {
    try {
      const { response } = await safeFetch(endpoint, "application/json", {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", Referer: baseUrl },
        body: new URLSearchParams({ month: month.key, corp_code: corpCode }).toString(),
      });
      const data = await response.json() as { prices?: Record<string, Record<string, number>> };
      const lines = Object.entries(data.prices || {}).flatMap(([roomId, dates]) => Object.entries(dates || {}).map(([date, price]) => `객실 ID ${roomId} | ${date} | 1박 ${Number(price).toLocaleString("ko-KR")}원`));
      return { month, lines };
    } catch { return { month, lines: [] as string[] }; }
  }));
  results.forEach(({ month, lines }) => {
    if (lines.length) pushPage(pages, { url: `${endpoint}?month=${month.key}#advertised-prices`, title: `${month.key} 공식 예약 달력 요금`, text: lines.join("\n"), structuredData: [] });
  });
}

async function readLegacyRsvt(url: string) {
  return new Promise<string>((resolve, reject) => {
    const request = https.get(url, {
      ciphers: "DEFAULT@SECLEVEL=0", minVersion: "TLSv1",
      headers: { Accept: "text/html", Referer: "http://rsvt.co.kr/", "User-Agent": "Mozilla/5.0 moTFStayImporter/2.0" },
    }, (response) => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_HTML_BYTES) request.destroy(new Error("예약표 용량이 너무 큽니다.")); else chunks.push(chunk);
      });
      response.on("end", () => resolve(new TextDecoder("euc-kr").decode(Buffer.concat(chunks))));
    });
    request.setTimeout(PAGE_TIMEOUT_MS, () => request.destroy(new Error("예약표 응답 시간이 초과됐습니다.")));
    request.on("error", reject);
  });
}

async function addRsvtPrices(htmlDocuments: string[], pages: CrawledSite["pages"]) {
  const combined = htmlDocuments.join("\n");
  const pId = combined.match(/[?&]p_id=([a-z0-9_-]+)/i)?.[1];
  if (!pId) return;
  const results = await Promise.all(upcomingMonths().map(async (month) => {
    const url = `https://rsvt.co.kr:1447/rsvt_web_jw/index3.html?p_id=${encodeURIComponent(pId)}&year=${month.year}&month=${month.month}`;
    try {
      const $ = cheerio.load(await readLegacyRsvt(url));
      const datePrices = new Map<string, string[]>();
      const roomPrices = new Map<string, Set<number>>();
      $("[rdata]").each((_, element) => {
        const node = $(element);
        const href = node.closest("a").attr("href") || "";
        const rawDate = href.match(/[?&]useStartDate=(\d{8})/)?.[1] || "";
        const date = rawDate ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}` : month.key;
        const text = compactText(node.attr("rdata") || node.text(), 500).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
        const room = text.match(/객실\s*:?\s*(.+?)\s*요금/)?.[1]?.trim();
        const price = Number(text.match(/요금\s*:?\s*([\d,]+)/)?.[1]?.replace(/,/g, ""));
        if (!room || !Number.isFinite(price) || price < 10_000) return;
        const values = roomPrices.get(room) || new Set<number>();
        values.add(price); roomPrices.set(room, values);
        const daily = datePrices.get(date) || [];
        const item = `${room} ${price.toLocaleString("ko-KR")}원`;
        if (!daily.includes(item)) daily.push(item);
        datePrices.set(date, daily);
      });
      const records = [
        ...[...roomPrices.entries()].map(([room, prices]) => `${room} 표시 요금 종류: ${[...prices].sort((a, b) => a - b).map((price) => `${price.toLocaleString("ko-KR")}원`).join(" / ")}`),
        ...[...datePrices.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, prices]) => `${date} | ${prices.join("; ")}`),
      ];
      return { month, url, records };
    } catch { return { month, url, records: [] as string[] }; }
  }));
  results.forEach(({ month, url, records }) => {
    if (records.length) pushPage(pages, { url: `${url}#advertised-prices`, title: `${month.key} 공식 예약 달력 요금`, text: records.join("\n"), structuredData: [] });
  });
}

function naverPlaceId(url: URL) {
  if (!/(?:^|\.)naver\.com$/i.test(url.hostname)) return null;
  return url.pathname.match(/(?:place|entry\/place|accommodation)\/(\d+)/)?.[1] || url.searchParams.get("id");
}

async function crawlNaverPlace(seed: URL): Promise<CrawledSite | null> {
  const placeId = naverPlaceId(seed);
  if (!placeId) return null;
  const apiUrl = `https://map.naver.com/p/api/place/summary/${placeId}?lang=ko`;
  const { response } = await safeFetch(apiUrl, "application/json", { headers: { Referer: seed.toString() } });
  const payload = await response.json() as Record<string, unknown>;
  const data = (payload.data || payload) as Record<string, unknown>;
  const result = (data.result || data) as Record<string, unknown>;
  const place = (result.placeDetail || result.place || result) as Record<string, unknown>;
  const imageBlock = (place.images || {}) as Record<string, unknown>;
  const imageItems = (Array.isArray(imageBlock.images) ? imageBlock.images : Array.isArray(place.images) ? place.images : []) as Array<Record<string, unknown>>;
  const imageUrls = imageItems.map((item) => String(item.origin || item.url || "")).filter(Boolean).slice(0, MAX_IMAGES);
  let supplementalPhone = "";
  try {
    const homeUrl = `https://pcmap.place.naver.com/accommodation/${placeId}/home`;
    const { html } = await readHtml(homeUrl, { headers: { Referer: seed.toString() } });
    supplementalPhone = html.match(/"(?:virtualPhone|phone)"\s*:\s*"([^"]+)"/)?.[1] || "";
  } catch { /* Summary data remains useful when the rendered place page changes. */ }
  const categoryBlock = (place.category || {}) as Record<string, unknown>;
  const addressBlock = (place.address || {}) as Record<string, unknown>;
  const priceBlock = (place.reprPrice || {}) as Record<string, unknown>;
  const coordinate = (place.coordinate || {}) as Record<string, unknown>;
  const category = Array.isArray(place.category) ? place.category.join(", ") : String(categoryBlock.category || place.businessType || "");
  const facts = [
    `업체명: ${String(place.name || "")}`, `업종: ${category}`,
    `도로명주소: ${String(addressBlock.roadAddress || place.roadAddress || "")}`, `지번주소: ${String(addressBlock.address || "")}`,
    `대표 전화: ${String(place.virtualPhone || place.phone || supplementalPhone)}`, `표시 가격: ${String(priceBlock.displayText || priceBlock.price || place.price || "")}`,
    coordinate.longitude && coordinate.latitude ? `좌표: ${String(coordinate.longitude)}, ${String(coordinate.latitude)}` : "",
    "네이버 플레이스 공식 업체 요약 정보이며 방문자 리뷰와 방문자 사진은 수집하지 않았습니다.",
  ].filter((line) => !/: $/.test(line));
  return { canonicalUrl: seed.toString(), pages: [{ url: apiUrl, title: String(place.name || "네이버 플레이스 숙소"), text: facts.join("\n"), structuredData: [], imageUrls }], imageUrls };
}

export async function crawlStaySite(rawUrl: string): Promise<CrawledSite> {
  const normalizedInput = /^https?:\/\//i.test(rawUrl.trim()) ? rawUrl.trim() : `https://${rawUrl.trim()}`;
  let seed = await assertPublicUrl(normalizedInput);
  if (/(?:^|\.)naver\.me$/i.test(seed.hostname)) {
    const { finalUrl } = await readHtml(seed.toString());
    seed = await assertPublicUrl(finalUrl);
  }
  const naver = await crawlNaverPlace(seed);
  if (naver) return naver;
  const seedSection = seed.pathname.split("/").filter(Boolean)[0] || "";
  let origin = seed.origin;
  const queue = [seed.toString()];
  const visited = new Set<string>();
  const candidates = new Map<string, number>();
  const pages: CrawledSite["pages"] = [];
  const images = new Map<string, number>();
  const visualEvidence = new Set<string>();
  const htmlDocuments: string[] = [];
  let canonicalUrl = seed.toString();
  while (queue.length && pages.length < MAX_PAGES) {
    const next = queue.shift()!;
    if (visited.has(next)) continue;
    visited.add(next);
    let html: string;
    let finalUrl: string;
    try { ({ html, finalUrl } = await readHtml(next)); }
    catch (error) { if (!pages.length) throw error; continue; }
    htmlDocuments.push(html);
    if (!pages.length) { canonicalUrl = finalUrl; origin = new URL(finalUrl).origin; }
    const $ = cheerio.load(html);
    const pageImages = new Map<string, number>();
    collectImages($, html, finalUrl, pageImages);
    pageImages.forEach((score, url) => addImage(images, url, finalUrl, score));
    $(".pop_layer img,[id^='pop'] img,.popup img").each((_, element) => {
      const url = absoluteUrl($(element).attr("src") || $(element).attr("data-src"), finalUrl);
      if (url) visualEvidence.add(url);
    });
    queueCandidates($, finalUrl, origin, seedSection, visited, candidates);
    const structuredData = $("script[type='application/ld+json']").map((_, element) => compactText($(element).text(), 10_000)).get().filter(Boolean).slice(0, 10);
    const contacts = contactText($);
    $("script:not([type='application/ld+json']),style,noscript,iframe,svg,nav,footer").remove();
    $("script").remove();
    pushPage(pages, {
      url: finalUrl, title: compactText($("title").first().text() || $("h1").first().text(), 200),
      text: compactText(`${$("body").text()}\n${contacts ? `CONTACT AND SITE METADATA:\n${contacts}` : ""}`), structuredData,
      imageUrls: [...pageImages.entries()].sort((a, b) => b[1] - a[1]).map(([url]) => url).slice(0, 40),
    });
    for (const [url] of [...candidates.entries()].sort((a, b) => b[1] - a[1])) if (!visited.has(url) && !queue.includes(url)) queue.push(url);
  }
  if (!pages.length) throw new Error("웹사이트에서 읽을 수 있는 페이지를 찾지 못했습니다.");
  await Promise.all([addLetsNowGoPrices(htmlDocuments, canonicalUrl, pages), addRsvtPrices(htmlDocuments, pages)]);
  const imageUrls = [...images.entries()].sort((a, b) => b[1] - a[1]).map(([url]) => url).slice(0, MAX_IMAGES);
  return { canonicalUrl, pages, imageUrls, visualEvidenceUrls: [...visualEvidence].slice(0, 3) };
}

function sniffImageType(bytes: Uint8Array) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45) return "image/webp";
  return null;
}

export async function downloadPublicImage(url: string) {
  const { response, url: finalUrl } = await safeFetch(url, "image/jpeg,image/png,image/webp,image/gif;q=0.8,*/*;q=0.1", { headers: { Referer: new URL(url).origin } });
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > 8_000_000) throw new Error("이미지 한 장은 8MB 이하여야 합니다.");
  const data = await response.arrayBuffer();
  if (data.byteLength > 8_000_000) throw new Error("이미지 한 장은 8MB 이하여야 합니다.");
  const headerType = (response.headers.get("content-type") || "").split(";")[0].toLowerCase();
  const contentType = /^image\/(jpeg|png|webp|gif)$/.test(headerType) ? headerType : sniffImageType(new Uint8Array(data));
  if (!contentType) throw new Error("지원하지 않는 이미지 형식입니다.");
  return { data, contentType, finalUrl: finalUrl.toString() };
}
