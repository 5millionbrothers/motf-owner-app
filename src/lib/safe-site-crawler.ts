import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import * as cheerio from "cheerio";

const MAX_PAGES = 14;
const MAX_HTML_BYTES = 2_000_000;
const PAGE_TIMEOUT_MS = 12_000;
const LINK_HINT = /(객실|방|room|시설|부대|facility|요금|가격|price|예약|소개|about|오시는|위치|location)/i;
const IMAGE_SKIP = /(logo|icon|favicon|sprite|button|banner|loading|arrow|blank|pixel|tracking)/i;

export type CrawledSite = {
  canonicalUrl: string;
  pages: Array<{ url: string; title: string; text: string; structuredData: string[] }>;
  imageUrls: string[];
};

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

async function safeFetch(input: string, accept: string) {
  let url = await assertPublicUrl(input);
  for (let redirect = 0; redirect <= 4; redirect += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(url, {
        redirect: "manual",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          Accept: accept,
          "User-Agent": "Mozilla/5.0 (compatible; moTFStayImporter/1.0; +https://motf.co.kr)",
        },
      });
    } finally {
      clearTimeout(timer);
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("웹사이트 이동 주소가 비어 있습니다.");
      url = await assertPublicUrl(location, url.toString());
      continue;
    }
    if (!response.ok) throw new Error(`웹사이트 응답 오류 (${response.status})`);
    return { response, url };
  }
  throw new Error("웹사이트 이동 횟수가 너무 많습니다.");
}

function absoluteUrl(value: string | undefined, base: string) {
  if (!value || /^(data|blob|javascript):/i.test(value)) return null;
  try {
    const url = new URL(value, base);
    return /^https?:$/.test(url.protocol) ? url.toString().split("#")[0] : null;
  } catch {
    return null;
  }
}

function compactText(value: string, max = 18_000) {
  return value.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim().slice(0, max);
}

async function readHtml(url: string) {
  const { response, url: finalUrl } = await safeFetch(url, "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1");
  const type = response.headers.get("content-type") || "";
  if (!type.includes("text/html") && !type.includes("application/xhtml+xml")) throw new Error("HTML 웹페이지만 가져올 수 있습니다.");
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > MAX_HTML_BYTES) throw new Error("웹페이지 용량이 너무 큽니다.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_HTML_BYTES) throw new Error("웹페이지 용량이 너무 큽니다.");
  const charset = type.match(/charset\s*=\s*["']?([^;"'\s]+)/i)?.[1] || "utf-8";
  let html: string;
  try { html = new TextDecoder(charset).decode(bytes); }
  catch { html = new TextDecoder("utf-8").decode(bytes); }
  return { html, finalUrl: finalUrl.toString() };
}

export async function crawlStaySite(rawUrl: string): Promise<CrawledSite> {
  const normalizedInput = /^https?:\/\//i.test(rawUrl.trim()) ? rawUrl.trim() : `https://${rawUrl.trim()}`;
  const seed = await assertPublicUrl(normalizedInput);
  const seedSection = seed.pathname.split("/").filter(Boolean)[0] || "";
  let origin = seed.origin;
  const queue = [seed.toString()];
  const visited = new Set<string>();
  const candidates = new Map<string, number>();
  const pages: CrawledSite["pages"] = [];
  const images = new Set<string>();
  let canonicalUrl = seed.toString();

  while (queue.length && pages.length < MAX_PAGES) {
    const next = queue.shift()!;
    if (visited.has(next)) continue;
    visited.add(next);
    let html: string;
    let finalUrl: string;
    try {
      ({ html, finalUrl } = await readHtml(next));
    } catch (error) {
      if (!pages.length) throw error;
      continue;
    }
    if (!pages.length) {
      canonicalUrl = finalUrl;
      origin = new URL(finalUrl).origin;
    }
    const $ = cheerio.load(html);
    const navigationLinks = $("a[href]").map((_, element) => ({
      href: $(element).attr("href"),
      label: compactText($(element).text(), 160),
    })).get();
    $("script:not([type='application/ld+json']),style,noscript,iframe,svg,nav,footer").remove();
    const structuredData = $("script[type='application/ld+json']").map((_, element) => compactText($(element).text(), 8_000)).get().filter(Boolean).slice(0, 8);
    $("script").remove();
    pages.push({
      url: finalUrl,
      title: compactText($("title").first().text() || $("h1").first().text(), 200),
      text: compactText($("body").text()),
      structuredData,
    });

    const ogImage = $("meta[property='og:image']").attr("content");
    const imageValues = [ogImage, ...$("img").map((_, element) => {
      const node = $(element);
      return node.attr("data-src") || node.attr("data-lazy-src") || node.attr("src") || node.attr("srcset")?.split(",").pop()?.trim().split(/\s+/)[0];
    }).get()];
    imageValues.forEach((value) => {
      const absolute = absoluteUrl(value, finalUrl);
      if (absolute && !IMAGE_SKIP.test(new URL(absolute).pathname)) images.add(absolute);
    });

    navigationLinks.forEach((anchor) => {
      const absolute = absoluteUrl(anchor.href, finalUrl);
      if (!absolute) return;
      const url = new URL(absolute);
      if (url.origin !== origin || visited.has(absolute)) return;
      const hint = `${anchor.label} ${url.pathname}`;
      const hinted = LINK_HINT.test(hint);
      const opaqueDetail = Boolean(seedSection) && url.pathname.startsWith(`/${seedSection}/`) && /\/[a-f0-9]{20,}\/?$/i.test(url.pathname);
      if (!hinted && !opaqueDetail) return;
      candidates.set(absolute, (candidates.get(absolute) || 0) + (hinted ? (LINK_HINT.test(anchor.label) ? 3 : 2) : 1));
    });
    [...candidates.entries()]
      .sort((a, b) => b[1] - a[1])
      .forEach(([url]) => { if (!visited.has(url) && !queue.includes(url)) queue.push(url); });
  }

  if (!pages.length) throw new Error("웹사이트에서 읽을 수 있는 페이지를 찾지 못했습니다.");
  return { canonicalUrl, pages, imageUrls: [...images].slice(0, 60) };
}

export async function downloadPublicImage(url: string) {
  const { response, url: finalUrl } = await safeFetch(url, "image/jpeg,image/png,image/webp,image/gif;q=0.8");
  const type = (response.headers.get("content-type") || "").split(";")[0].toLowerCase();
  if (!/^image\/(jpeg|png|webp|gif)$/.test(type)) throw new Error("지원하지 않는 이미지 형식입니다.");
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > 8_000_000) throw new Error("이미지 한 장은 8MB 이하여야 합니다.");
  const data = await response.arrayBuffer();
  if (data.byteLength > 8_000_000) throw new Error("이미지 한 장은 8MB 이하여야 합니다.");
  return { data, contentType: type, finalUrl: finalUrl.toString() };
}
