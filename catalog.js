(function loadPublicCatalog() {
  const client = window.motfSupabase;
  if (!client || typeof window.motfApplyCatalog !== "function") return;

  const stayFallback = "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=1200&q=82";
  const marketFallback = "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1200&q=82";
  const roomFallback = "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=82";
  const productFallback = "https://images.unsplash.com/photo-1606787366850-de6330128bfc?auto=format&fit=crop&w=1200&q=82";
  const facilityLabels = {
    barbecue: "야외바베큐",
    outdoor: "야외바베큐",
    pool: "수영장",
    parking: "주차장",
    karaoke: "노래방/마이크",
    mic: "노래방/마이크",
    screen: "TV/화면",
    field: "야외운동장",
    kitchen: "취사시설",
  };
  const text = (value) => window.motfEscapeHtml?.(value) ?? String(value ?? "");
  const imageUrl = (value, fallback) => {
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) ? url.href : fallback;
    } catch {
      return fallback;
    }
  };

  function regionOf(business) {
    const rawRegion = business.region || business.address?.split(/[ ,]/).filter(Boolean)[0] || "지역 미정";
    return text(window.motfNormalizeStayRegion?.(rawRegion, business.address) || rawRegion);
  }

  function locationOf(business) {
    if (business.latitude == null || business.longitude == null || business.latitude === "" || business.longitude === "") return null;
    const lat = Number(business.latitude);
    const lng = Number(business.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return { lat, lng };
  }

  function buildStay(business, offerings) {
    const rooms = offerings.map((item) => ({
      id: item.id,
      name: text(item.name),
      capacity: item.max_people ? `최대 ${item.max_people}명` : "인원 문의",
      basePeople: Number(item.base_people ?? item.min_people) || 0,
      maxPeople: Number(item.max_people) || 0,
      extraPersonFee: Number(item.extra_person_fee) || 0,
      seasonalPrices: {
        offseasonWeekday: Number(item.offseason_weekday_price ?? item.price) || 0,
        offseasonWeekend: Number(item.offseason_weekend_price ?? item.price) || 0,
        shoulderWeekday: Number(item.shoulder_weekday_price ?? item.price) || 0,
        shoulderWeekend: Number(item.shoulder_weekend_price ?? item.price) || 0,
        peakWeekday: Number(item.peak_weekday_price ?? item.price) || 0,
        peakWeekend: Number(item.peak_weekend_price ?? item.price) || 0,
      },
      bathroomCount: Number(item.bathroom_count) || 0,
      bathroomGenderSeparated: Boolean(item.bathroom_gender_separated),
      bathroomNote: text(item.bathroom_note || ""),
      price: Number(item.price) || 0,
      image: imageUrl(item.image_url || business.cover_image_url, roomFallback),
      images: (item.image_urls || []).map((url) => imageUrl(url, roomFallback)),
      features: item.feature_summary?.length ? item.feature_summary.slice(0, 3).map(text) : [],
      amenityDetails: Array.isArray(item.amenity_details) ? item.amenity_details : [],
      detailSections: item.detail_sections && typeof item.detail_sections === "object" ? item.detail_sections : {},
    }));
    const image = business.cover_image_url || business.gallery_image_urls?.[0] || rooms[0]?.image || stayFallback;
    const amenities = (business.facilities || []).map((key) => facilityLabels[key] || text(key));
    const fullIntro = text(business.description || "단체 행사 이용이 가능한 제휴 숙소입니다.");
    const shortIntro = text(business.short_description || String(business.description || "").slice(0, 140) || "단체 행사 이용이 가능한 제휴 숙소입니다.");
    return {
      id: business.id,
      displayOrder: Number(business.display_order) || 100,
      discoveryWeight: Math.max(0, Number(business.discovery_weight) || 100),
      isFeatured: Boolean(business.is_featured),
      name: text(business.business_name),
      region: regionOf(business),
      price: Math.min(...rooms.map((room) => room.price)),
      maxPeople: Math.max(...rooms.map((room) => Number(room.capacity.match(/\d+/)?.[0] || 40))),
      rating: 0,
      reviews: 0,
      distance: text(business.address || "주소 문의"),
      location: locationOf(business),
      detailTags: [...new Set([
        ...(business.nearby_tags || []),
        ...(business.facilities || []),
        ...(business.station_distance_m != null && Number(business.station_distance_m) <= 500 ? ["station"] : []),
        ...(business.convenience_distance_m != null && Number(business.convenience_distance_m) <= 500 ? ["convenience"] : []),
      ])],
      stationDistanceM: business.station_distance_m == null ? null : Number(business.station_distance_m),
      convenienceDistanceM: business.convenience_distance_m == null ? null : Number(business.convenience_distance_m),
      roomCount: Number(business.room_count) || rooms.length,
      bathCount: Number(business.bath_count) || 0,
      image,
      images: [...new Set([image, ...(business.gallery_image_urls || []), ...rooms.flatMap((room) => room.images || [room.image])])],
      intro: shortIntro,
      fullIntro,
      highlights: Array.isArray(business.highlight_summary) ? business.highlight_summary.slice(0, 3).map(text) : amenities.slice(0, 3),
      amenities: amenities.length ? amenities : ["상세 시설은 사장님에게 문의해주세요."],
      amenityDetails: Array.isArray(business.amenity_details) ? business.amenity_details : [],
      shoulderSeasonRanges: Array.isArray(business.shoulder_season_ranges) ? business.shoulder_season_ranges : [],
      peakSeasonRanges: Array.isArray(business.peak_season_ranges) ? business.peak_season_ranges : [],
      sharedBathroomCount: Number(business.shared_bathroom_count) || 0,
      sharedBathroomGenderSeparated: Boolean(business.shared_bathroom_gender_separated),
      sharedBathroomNote: text(business.shared_bathroom_note || ""),
      extraFees: Array.isArray(business.extra_fees) ? business.extra_fees : [],
      fees: Array.isArray(business.extra_fees) && business.extra_fees.length
        ? business.extra_fees.map((fee) => text(`${fee.label || "추가요금"}${fee.amount ? ` ${Number(fee.amount).toLocaleString("ko-KR")}원` : ""}${fee.detail ? ` · ${fee.detail}` : ""}`))
        : ["추가요금은 예약 전 사장님에게 확인해주세요."],
      policy: ["이용 14일 전까지 전액 환불", "이용 7일 전까지 50% 환불", "이용 3일 전까지 20% 환불", "이후 및 당일 취소는 환불 불가"],
      rooms,
    };
  }

  function buildStore(business, offerings) {
    const products = offerings.map((item) => ({
      id: item.id,
      category: text(item.category || "기타"),
      name: text(item.name),
      unit: text(item.unit || "1개"),
      price: Number(item.price) || 0,
      origin: text(item.origin || "업체 제공 상품"),
      image: imageUrl(item.image_url || business.cover_image_url, productFallback),
      images: (item.image_urls || []).map((url) => imageUrl(url, productFallback)),
      detail: text(item.description || "상세 내용은 마트에 문의해주세요."),
      detailSections: item.detail_sections && typeof item.detail_sections === "object" ? item.detail_sections : {},
      nutritionInfo: item.nutrition_info && typeof item.nutrition_info === "object" ? item.nutrition_info : {},
      isAlcohol: Boolean(item.is_alcohol),
      stockQuantity: item.stock_quantity == null ? null : Number(item.stock_quantity),
    }));
    return {
      id: business.id,
      displayOrder: Number(business.display_order) || 100,
      discoveryWeight: Math.max(0, Number(business.discovery_weight) || 100),
      isFeatured: Boolean(business.is_featured),
      name: text(business.business_name),
      region: regionOf(business),
      type: "moTF 제휴 마트",
      rating: 0,
      location: locationOf(business),
      image: imageUrl(business.cover_image_url, products[0]?.image || marketFallback),
      intro: text(business.description || "단체 행사 물품을 준비할 수 있는 제휴 마트입니다."),
      recommendedSets: Array.isArray(business.recommended_sets) ? business.recommended_sets : [],
      products,
    };
  }

  function stableDailyScore(id, weight) {
    const seed = `${new Date().toISOString().slice(0, 10)}:${id}`;
    let hash = 2166136261;
    for (let index = 0; index < seed.length; index += 1) {
      hash ^= seed.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    const random = ((hash >>> 0) + 1) / 4294967297;
    return Math.pow(random, 1 / Math.max(1, Number(weight) || 1));
  }

  function rankCatalog(items) {
    return [...items].sort((left, right) => {
      if (left.isFeatured !== right.isFeatured) return left.isFeatured ? -1 : 1;
      if (left.displayOrder !== right.displayOrder) return left.displayOrder - right.displayOrder;
      return stableDailyScore(right.id, right.discoveryWeight) - stableDailyScore(left.id, left.discoveryWeight);
    });
  }

  (async () => {
    let [businessResult, offeringResult] = await Promise.all([
      client.from("businesses")
        .select("id, business_type, business_name, address, description, short_description, highlight_summary, highlight_keys, region, cover_image_url, gallery_image_urls, facilities, approval_status, latitude, longitude, location_verified_at, station_distance_m, convenience_distance_m, nearby_tags, room_count, bath_count, shared_bathroom_count, shared_bathroom_gender_separated, shared_bathroom_note, shoulder_season_ranges, peak_season_ranges, amenity_details, extra_fees, refund_policy, recommended_sets, is_featured, display_order, discovery_weight")
        .eq("approval_status", "approved"),
      client.from("offerings")
        .select("id, business_id, name, description, price, is_active, max_people, min_people, base_people, extra_person_fee, unit, category, image_url, image_urls, sort_order, feature_summary, amenity_details, detail_sections, origin, nutrition_info, is_alcohol, stock_quantity, offseason_weekday_price, offseason_weekend_price, shoulder_weekday_price, shoulder_weekend_price, peak_weekday_price, peak_weekend_price, bathroom_count, bathroom_gender_separated, bathroom_note")
        .eq("is_active", true)
        .order("sort_order"),
    ]);

    // 새 DB 열과 프론트 배포 순서가 잠시 엇갈려도 전체 카탈로그가 사라지지 않도록
    // 직전 스키마로 한 번만 폴백한다. 새 기능은 migration 50 적용 후 자동 활성화된다.
    if (businessResult.error) {
      businessResult = await client.from("businesses")
        .select("id, business_type, business_name, address, description, region, cover_image_url, gallery_image_urls, facilities, approval_status, latitude, longitude, location_verified_at, station_distance_m, convenience_distance_m, nearby_tags, room_count, bath_count, amenity_details, extra_fees, refund_policy, recommended_sets")
        .eq("approval_status", "approved");
    }
    if (offeringResult.error) {
      offeringResult = await client.from("offerings")
        .select("id, business_id, name, description, price, is_active, max_people, min_people, unit, category, image_url, image_urls, sort_order, feature_summary, amenity_details, detail_sections, origin, nutrition_info, is_alcohol, stock_quantity")
        .eq("is_active", true)
        .order("sort_order");
    }

    if (businessResult.error || offeringResult.error) {
      console.warn("실제 제휴처 목록을 불러오지 못했습니다.", businessResult.error || offeringResult.error);
      window.motfApplyCatalog([], [], { error: true });
      return;
    }

    const businesses = businessResult.data || [];
    const offerings = offeringResult.data || [];
    const stays = rankCatalog(businesses
      .filter((business) => business.business_type === "stay")
      .map((business) => buildStay(business, offerings.filter((item) => item.business_id === business.id)))
      .filter((business) => business.rooms.length));
    const stores = rankCatalog(businesses
      .filter((business) => business.business_type === "market")
      .map((business) => buildStore(business, offerings.filter((item) => item.business_id === business.id))));

    window.motfApplyCatalog(stays, stores);
  })();
})();
