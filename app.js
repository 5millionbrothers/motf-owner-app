const money = (value) => `${Number(value).toLocaleString("ko-KR")}원`;
const formatPhone = (value = "") => {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 11);
  if (digits.startsWith("02")) {
    if (digits.length <= 2) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
    if (digits.length <= 10) return `${digits.slice(0, 2)}-${digits.slice(2, digits.length - 4)}-${digits.slice(-4)}`;
  }
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
};
const parseMoneyInput = (value = "") => Number(String(value || "").replace(/[^0-9]/g, "")) || 0;
const formatMoneyInput = (value = "") => {
  const amount = parseMoneyInput(value);
  return amount ? amount.toLocaleString("ko-KR") : "";
};
const formatDateTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "'": "&#39;",
  '"': "&quot;",
}[character]));
window.motfEscapeHtml = escapeHtml;

let TOSS_CLIENT_KEY = window.MOTF_CONFIG?.TOSS_CLIENT_KEY?.trim() || "";
let TOSS_ENABLED_METHODS = ["CARD", "TRANSFER"];
const PENDING_PAYMENT_STORAGE_KEY = "motf.pendingPayment";
const DEFAULT_STAY_REGION = "가평";
const DEFAULT_STAY_PEOPLE = 10;
const LAUNCH_STAY_REGION = "가평";
const STANDARD_REFUND_POLICY = ["이용 14일 전까지 전액 환불", "이용 7일 전까지 50% 환불", "이용 3일 전까지 20% 환불", "이후 및 당일 취소는 환불 불가"];

function normalizeStayRegion(value = "", address = "") {
  const region = String(value || "").trim();
  const locationText = `${region} ${String(address || "")}`.replace(/\s+/g, " ").trim();
  if (/가평|대성리/.test(locationText)) return LAUNCH_STAY_REGION;
  return region || "지역 미정";
}
window.motfNormalizeStayRegion = normalizeStayRegion;

let NAVER_MAP_KEY_ID = window.MOTF_CONFIG?.NAVER_MAP_KEY_ID?.trim() || "";
const NAVER_MAP_SCRIPT_ID = "motf-naver-map-sdk";
let naverMapPromise = null;

const mapState = {
  stays: { map: null, markers: [], infoWindow: null, version: 0 },
  market: { map: null, markers: [], infoWindow: null, version: 0 },
};

const photo = (id, params = "auto=format&fit=crop&w=1200&q=82") =>
  `https://images.unsplash.com/${id}?${params}`;

let stays = [
  {
    id: "river",
    name: "가평 리버사이드 펜션",
    region: "가평",
    price: 720000,
    maxPeople: 40,
    rating: 4.8,
    reviews: 128,
    distance: "가평역 차량 12분",
    location: { lat: 37.8314, lng: 127.5098 },
    detailTags: ["seaside", "convenience", "barbecue", "screen", "karaoke", "pool"],
    roomCount: 5,
    bathCount: 4,
    image: photo("photo-1564013799919-ab600027ffc6"),
    images: [
      photo("photo-1564013799919-ab600027ffc6"),
      photo("photo-1510798831971-661eb04b3739"),
      photo("photo-1505693416388-ac5ce068fe85"),
    ],
    intro: "강변 데크와 넓은 바베큐장을 갖춘 30명대 MT 팀용 단체 펜션입니다.",
    amenities: ["대형 바베큐장", "노래방", "세미나실", "주차 8대", "빔프로젝터", "취사 가능"],
    fees: ["바베큐 숯/그릴 120,000원", "기준 32명 초과 시 1인 20,000원", "얼리 체크인 시간당 50,000원"],
    policy: ["숙박 7일 전 100% 환불", "3일 전 50% 환불", "당일 취소 환불 불가", "시설 파손 시 실비 정산"],
    rooms: [
      {
        name: "단체동 A",
        capacity: "24~32명",
        price: 720000,
        image: photo("photo-1505693416388-ac5ce068fe85"),
        features: ["온돌방 3", "화장실 3", "거실형"],
      },
      {
        name: "별채 B",
        capacity: "12~18명",
        price: 430000,
        image: photo("photo-1613490493576-7fde63acd811"),
        features: ["복층", "개별 바베큐", "조용한 위치"],
      },
      {
        name: "전체 대관",
        capacity: "35~40명",
        price: 980000,
        image: photo("photo-1600585154340-be6161a56a0c"),
        features: ["독채", "운동장", "세미나실 포함"],
      },
    ],
  },
  {
    id: "pine",
    name: "양평 숲속 스테이",
    region: "양평",
    price: 930000,
    maxPeople: 48,
    rating: 4.7,
    reviews: 94,
    distance: "양평역 차량 18분",
    location: { lat: 37.4918, lng: 127.4877 },
    detailTags: ["valley", "barbecue", "screen", "karaoke", "field", "convenience"],
    roomCount: 6,
    bathCount: 4,
    image: photo("photo-1449158743715-0a90ebb6d2d8"),
    images: [
      photo("photo-1449158743715-0a90ebb6d2d8"),
      photo("photo-1600607687939-ce8a6c25118c"),
      photo("photo-1523217582562-09d0def993a6"),
    ],
    intro: "넓은 잔디 마당과 독립 강당이 있어 신입생 OT와 학과 MT에 잘 맞습니다.",
    amenities: ["독립 강당", "잔디 마당", "족구장", "주방 2개", "방송 장비", "버스 진입 가능"],
    fees: ["강당 이용 150,000원", "침구 추가 1세트 8,000원", "기준 40명 초과 시 1인 18,000원"],
    policy: ["숙박 10일 전 100% 환불", "5일 전 70% 환불", "2일 전 30% 환불", "소음 민원 발생 시 이용 제한"],
    rooms: [
      {
        name: "메인 하우스",
        capacity: "30~40명",
        price: 930000,
        image: photo("photo-1600607687920-4e2a09cf159d"),
        features: ["방 6", "화장실 4", "강당 인접"],
      },
      {
        name: "숲동",
        capacity: "15~22명",
        price: 560000,
        image: photo("photo-1500530855697-b586d89ba3ee"),
        features: ["테라스", "개별 주방", "조용한 위치"],
      },
      {
        name: "전체 대관",
        capacity: "42~48명",
        price: 1250000,
        image: photo("photo-1600607688969-a5bfcd646154"),
        features: ["단독 행사", "강당 포함", "버스 주차"],
      },
    ],
  },
  {
    id: "campus",
    name: "강촌 캠퍼스 리조트",
    region: "강촌",
    price: 1450000,
    maxPeople: 70,
    rating: 4.6,
    reviews: 211,
    distance: "강촌역 도보 9분",
    location: { lat: 37.8056, lng: 127.6341 },
    detailTags: ["station", "convenience", "screen", "mic", "field"],
    roomCount: 10,
    bathCount: 8,
    image: photo("photo-1601918774946-25832a4be0d6"),
    images: [
      photo("photo-1601918774946-25832a4be0d6"),
      photo("photo-1600566753190-17f0baa2a6c3"),
      photo("photo-1596394516093-501ba68a0ba6"),
    ],
    intro: "역에서 가까운 대형 리조트형 숙소로 50명 이상 대규모 행사에 적합합니다.",
    amenities: ["대강당", "음향 장비", "편의점 인접", "엘리베이터", "객실 분리", "관리자 상주"],
    fees: ["대강당 250,000원", "음향 장비 80,000원", "기준 60명 초과 시 1인 15,000원"],
    policy: ["숙박 14일 전 100% 환불", "7일 전 50% 환불", "3일 전 20% 환불", "분리수거 미준수 시 청소비 발생"],
    rooms: [
      {
        name: "캠퍼스홀 패키지",
        capacity: "45~60명",
        price: 1450000,
        image: photo("photo-1596394516093-501ba68a0ba6"),
        features: ["객실 10", "대강당", "조식 선택"],
      },
      {
        name: "스탠다드 단체",
        capacity: "30~44명",
        price: 1030000,
        image: photo("photo-1560448204-e02f11c3d0e2"),
        features: ["객실 7", "소강당", "역 인접"],
      },
      {
        name: "전체 플로어",
        capacity: "61~70명",
        price: 1720000,
        image: photo("photo-1566073771259-6a8506099945"),
        features: ["층 단독", "운영실", "야간 담당자"],
      },
    ],
  },
  {
    id: "station",
    name: "대성리 스테이션 하우스",
    region: "대성리",
    price: 580000,
    maxPeople: 30,
    rating: 4.5,
    reviews: 57,
    distance: "대성리역 도보 6분",
    location: { lat: 37.6842, lng: 127.3794 },
    detailTags: ["station", "convenience", "barbecue", "screen", "outdoor"],
    roomCount: 3,
    bathCount: 2,
    image: photo("photo-1522708323590-d24dbb6b0267"),
    images: [
      photo("photo-1522708323590-d24dbb6b0267"),
      photo("photo-1493809842364-78817add7ffb"),
      photo("photo-1507089947368-19c1da9775ae"),
    ],
    intro: "작은 학생회와 동아리 MT가 쓰기 좋은 역세권 숙소입니다.",
    amenities: ["역 도보권", "루프탑", "개별 바베큐", "보드게임", "주차 4대", "편의점 3분"],
    fees: ["루프탑 바베큐 90,000원", "침구 추가 1세트 7,000원", "기준 24명 초과 시 1인 16,000원"],
    policy: ["숙박 7일 전 100% 환불", "4일 전 60% 환불", "1일 전 20% 환불", "야외 소음 22시 이후 제한"],
    rooms: [
      {
        name: "루프탑 단체룸",
        capacity: "20~24명",
        price: 580000,
        image: photo("photo-1493809842364-78817add7ffb"),
        features: ["방 3", "루프탑", "역 인접"],
      },
      {
        name: "복층룸",
        capacity: "14~18명",
        price: 390000,
        image: photo("photo-1507089947368-19c1da9775ae"),
        features: ["복층", "개별 취사", "소규모"],
      },
      {
        name: "전체 대관",
        capacity: "25~30명",
        price: 720000,
        image: photo("photo-1600585152220-90363fe7e115"),
        features: ["독채", "루프탑 포함", "주차 4대"],
      },
    ],
  },
];

const legacyDemoStores = [
  {
    id: "daesung-market",
    name: "대성 공판장",
    region: "가평",
    type: "숙소 배송·매장 픽업 가능",
    rating: 4.9,
    location: { lat: 37.6844, lng: 127.3797 },
    image: photo("photo-1542838132-92c53300491e"),
    intro: "MT에 필요한 식자재와 일회용품을 일정에 맞춰 한 번에 준비하는 공판장입니다.",
    products: [
      {
        id: "daesung-water-500",
        category: "주류/음료",
        name: "생수 500ml",
        unit: "20병 묶음",
        price: 9000,
        origin: "국내 유통",
        image: photo("photo-1523362628745-0c100150b504"),
        detail: "단체 MT 식사용과 이동 중 음용으로 준비하기 좋은 기본 생수 묶음입니다.",
      },
      {
        id: "daesung-pork-belly",
        category: "식재료",
        name: "국내산 삼겹살",
        unit: "1kg",
        price: 18900,
        origin: "돼지고기 국내산",
        image: photo("photo-1602470520998-f4a52199a3d6"),
        detail: "바비큐용으로 손질된 냉장 삼겹살입니다. 인원수에 맞춰 수량을 조절해 주문할 수 있습니다.",
      },
      {
        id: "daesung-pork-neck",
        category: "식재료",
        name: "목살 바비큐용",
        unit: "1kg",
        price: 17900,
        origin: "돼지고기 국내산",
        image: photo("photo-1551028150-64b9f398f678"),
        detail: "삼겹살과 함께 구성하기 좋은 바비큐용 목살 상품입니다.",
      },
      {
        id: "daesung-vegetables",
        category: "식재료",
        name: "쌈채소 세트",
        unit: "10인분",
        price: 12000,
        origin: "국내산",
        image: photo("photo-1540420773420-3366772f4999"),
        detail: "상추, 깻잎 등 바비큐 식사에 필요한 기본 쌈채소 구성입니다.",
      },
      {
        id: "daesung-paper-plate",
        category: "일회용품",
        name: "일회용 접시",
        unit: "50개입",
        price: 3500,
        origin: "국내 유통",
        image: photo("photo-1589365278144-c9e705f843ba"),
        detail: "단체 식사 준비에 필요한 기본 일회용 접시입니다.",
      },
      {
        id: "daesung-cup-chopstick",
        category: "일회용품",
        name: "일회용 컵·젓가락 세트",
        unit: "50인 세트",
        price: 6000,
        origin: "국내 유통",
        image: photo("photo-1627989580309-bfaf3e58af6f"),
        detail: "컵과 젓가락을 함께 준비할 수 있는 MT 단체용 기본 세트입니다.",
      },
    ],
  },
];

const activities = [
  { id: "bingo", title: "학과 빙고", people: "20~60명", peopleGroup: "medium", space: "indoor", mood: "icebreak", time: "25분", note: "첫 만남 아이스브레이킹", media: "진행지 PDF · 예시 이미지", image: photo("photo-1529156069898-49953e39b3ac"), likes: 42, comments: ["빙고 칸에 교수님 별명 넣으면 반응 좋아요.", "새터 첫날에도 잘 먹혔습니다."], detail: "학과, 동아리, 과잠, 취미 같은 키워드를 빙고판에 넣고 서로 질문하며 칸을 채우는 게임입니다." },
  { id: "auction", title: "팀별 미션 경매", people: "30~80명", peopleGroup: "large", space: "indoor", mood: "team", time: "45분", note: "예산 게임과 장기자랑 조합", media: "룰 설명 영상", image: photo("photo-1517048676732-d65bc937f952"), likes: 58, comments: ["진행자가 가격 조절을 잘해야 재밌어요.", "장기자랑 부담을 줄이기 좋았습니다."], detail: "팀마다 가상 예산을 주고 미션을 경매로 가져가게 한 뒤, 획득한 미션을 수행해 점수를 얻는 방식입니다." },
  { id: "court", title: "MT 재판소", people: "15~40명", peopleGroup: "medium", space: "indoor", mood: "solo", time: "30분", note: "익명 사연으로 진행", media: "대본 템플릿", image: photo("photo-1556761175-b413da4baf72"), likes: 35, comments: ["익명 사연 검수는 꼭 필요합니다.", "분위기 풀기 좋았어요."], detail: "익명 사연을 받아 판사, 변호인, 증인 역할을 나누고 가볍게 상황극을 하는 레크레이션입니다." },
  { id: "random-quiz", title: "랜덤 조 편성 퀴즈", people: "20~70명", peopleGroup: "large", space: "any", mood: "icebreak", time: "35분", note: "선후배 섞임 유도", media: "문제 예시", image: photo("photo-1523580846011-d3a5bc25702b"), likes: 49, comments: ["조 편성 뒤 바로 하기 좋습니다."], detail: "랜덤으로 섞인 조가 학교, 학과, MT 장소 관련 퀴즈를 풀며 자연스럽게 대화하도록 만드는 게임입니다." },
  { id: "body-relay", title: "몸으로 말해요 릴레이", people: "20~50명", peopleGroup: "medium", space: "outdoor", mood: "team", time: "20분", note: "장비 없이 빠르게 시작", media: "제시어 카드", image: photo("photo-1517457373958-b7bdd4587205"), likes: 31, comments: ["야외에서 하면 사진도 잘 나와요."], detail: "팀원이 차례로 제시어를 몸짓으로 전달하고 마지막 사람이 정답을 맞히는 빠른 팀 대항 게임입니다." },
  { id: "ban-word", title: "술자리 금지어 게임", people: "10~40명", peopleGroup: "small", space: "indoor", mood: "solo", time: "30분", note: "소규모 뒤풀이용", media: "카드 이미지", image: photo("photo-1543269865-cbf427effbad"), likes: 27, comments: ["술 없이 음료 벌칙으로 해도 됩니다."], detail: "각자 모르는 금지어를 머리 위에 붙이고 대화하면서 상대가 금지어를 말하게 유도하는 게임입니다." },
];

const communityBoards = [
  {
    id: "market-share",
    title: "나눔장터",
    description: "남는 고기, 술, 일회용품을 같은 지역 MT 팀에게 나눔하거나 양도해요.",
    posts: [
      { id: "share-soju", title: "대성리 소주 8병 남아요", body: "오늘 밤 10시 이후 대성리역 근처에서 드릴 수 있어요.", likes: 18, comments: ["혹시 11시도 가능할까요?", "저희 팀 필요해요."], media: "사진 1" },
      { id: "share-cups", title: "가평역 근처 종이컵 나눔", body: "50개 정도 남았습니다. 숙소 픽업 전 가져가세요.", likes: 9, comments: ["위치 어디쯤인가요?", "감사합니다!"], media: "사진 2" },
      { id: "share-charcoal", title: "숯 3kg 필요하신 팀?", body: "바베큐 취소돼서 그대로 남았어요.", likes: 12, comments: ["저희 받을 수 있을까요?"], media: "" },
    ],
  },
  {
    id: "match",
    title: "대결신청",
    description: "족구, 피구, 장기자랑, 레크레이션 대결을 같은 지역 MT 팀에게 신청해요.",
    posts: [
      { id: "match-footvolley", title: "강촌 족구 5:5 붙을 팀", body: "오늘 20시 이후 가능. 실력은 재미 위주입니다.", likes: 23, comments: ["저희 6명 있어요.", "장소 어디인가요?"], media: "영상 1" },
      { id: "match-talent", title: "가평 장기자랑 교류전 구해요", body: "서로 2팀씩 나와서 가볍게 해요.", likes: 15, comments: ["재밌겠다", "시간 맞으면 갈게요"], media: "" },
      { id: "match-dodgeball", title: "대성리 피구 대결 신청", body: "인원 12명 정도, 운동장 있는 팀이면 좋아요.", likes: 20, comments: ["여기 숙소 운동장 있어요."], media: "사진 1" },
    ],
  },
  {
    id: "field-info",
    title: "현장 정보",
    description: "픽업, 택시, 편의점, 날씨, 소음 규칙처럼 현장에서 필요한 정보를 공유해요.",
    posts: [
      { id: "info-taxi", title: "가평역 택시 줄 현재 20분", body: "단체면 미리 콜 부르는 게 나아 보여요.", likes: 34, comments: ["정보 감사합니다.", "지금은 10분 정도예요."], media: "사진 1" },
      { id: "info-ice", title: "근처 편의점 얼음 재고 있음", body: "큰 봉투 얼음 아직 넉넉합니다.", likes: 16, comments: ["어느 편의점인가요?"], media: "" },
      { id: "info-rain", title: "대성리 비 와서 운동장 젖었어요", body: "야외 게임이면 실내 대안 준비하세요.", likes: 19, comments: ["저희도 실내로 바꿨어요."], media: "사진 2" },
    ],
  },
];

// 실제 승인된 공판장과 공개 상품은 catalog.js에서 채우고, 없을 때는 데모 공판장을 보여줍니다.
let stores = legacyDemoStores.map((store) => ({ ...store, products: store.products.map((product) => ({ ...product })) }));

const state = {
  selectedStay: stays[0],
  selectedRoom: stays[0].rooms[0],
  selectedStore: null,
  selectedProduct: null,
  activeCategory: "전체",
  cart: [],
  reservations: [],
  orders: [],
  reviews: [],
  reviewScope: "all",
  reviewTargets: [],
  stayPage: 1,
  staysPerPage: 5,
  mtProjects: [],
  mtProjectMode: "list",
  mtDirectoryFilter: "mine",
  mtCandidates: ["station", "river", "pine"],
  mtCandidateRecords: stays.filter((stay) => ["station", "river", "pine"].includes(String(stay.id))),
  mtProject: {
    id: null,
    title: "고려대학교 국제학부 2026 여름 MT",
    organization_name: "고려대학교 국제학부",
    region: "대성리",
    starts_on: "2026-08-14",
    ends_on: "2026-08-15",
    guest_count: 32,
    status: "planning",
    estimated_budget: 2500000,
    items: [
      { id: "demo-stay-plan", item_kind: "stay", reference_id: "station", title: "대성리 스테이션 하우스", quantity: 1, amount: 1083000, status: "planned" },
      { id: "demo-shopping-plan", item_kind: "shopping", reference_id: "pork-set", title: "바베큐 세트", quantity: 1, amount: 189000, status: "planned" },
    ],
    itinerary: [
      { starts_at: "2026-08-14T13:00:00+09:00", title: "대성리역 집합", place: "2번 출구" },
      { starts_at: "2026-08-14T15:00:00+09:00", title: "숙소 체크인", note: "대표자 신분증 지참" },
      { starts_at: "2026-08-14T16:30:00+09:00", title: "장보기 배송", place: "숙소 주차장" },
    ],
    notices: [{ body: "개인 세면도구와 수건을 꼭 챙겨주세요. 방 배정은 출발 전날 공개합니다.", is_pinned: true }],
  },
  publicCandidateStays: [],
  catalogError: "",
  catalogLoading: true,
  chats: [
    {
      id: "river-chat",
      title: "가평 리버사이드 펜션",
      subtitle: "바베큐장, 체크인 문의",
      messages: [
        { from: "admin", text: "moTF가 예약 규칙과 결제 내역을 함께 확인하는 중개 채팅입니다.", read: true },
        { from: "user", text: "6월 12일 32명인데 바베큐장 18시부터 이용 가능할까요?", read: true },
        { from: "owner", text: "가능합니다. 숯과 그릴 포함이면 120,000원이 추가됩니다.", read: false },
      ],
    },
    {
      id: "market-chat",
      title: "대성 공판장",
      subtitle: "수령 시간, 상품 문의",
      messages: [
        { from: "admin", text: "공판장 주문은 수령 시간과 품목을 함께 확인해 주세요.", read: true },
        { from: "owner", text: "대성리 인근 숙소는 사전 협의 후 배송 가능합니다.", read: false },
      ],
    },
  ],
  activeChatId: "river-chat",
  rating: 10,
  activeBoardId: "market-share",
  activeActivityId: "bingo",
  activePostId: "share-soju",
  pendingPayment: null,
  paymentResult: null,
  stayAvailability: {
    key: "",
    loadingKey: "",
    unavailableOfferingIds: new Set(),
  },
  publicStayCalendar: { businessId: "", blocks: [], loading: false },
  platformEvents: [],
  homepageCards: [],
  eventFilter: "all",
  selectedEvent: null,
  gallery: { images: [], index: 0, alt: "" },
  pendingMtCandidateId: "",
  selectedUsageIds: new Set(),
};

window.motfApplyCatalog = function applyCatalog(nextStays, nextStores, options = {}) {
  if (Array.isArray(nextStays)) {
    stays = nextStays.map((stay) => ({
      ...stay,
      region: normalizeStayRegion(stay.region, stay.distance),
    }));
    const regionSelect = qs("#stayRegion");
    if (regionSelect) {
      const regions = [...new Set([DEFAULT_STAY_REGION, ...stays.map((stay) => stay.region).filter(Boolean)])];
      regionSelect.innerHTML = regions.map((region) => `<option value="${escapeHtml(region)}">${escapeHtml(region)}</option>`).join("");
      regionSelect.value = regions.includes(DEFAULT_STAY_REGION) ? DEFAULT_STAY_REGION : (regions[0] || "");
    }
    state.selectedStay = stays[0] || null;
    state.selectedRoom = stays[0]?.rooms?.[0] || null;
  }
  if (Array.isArray(nextStores)) {
    stores = nextStores.length
      ? nextStores
      : legacyDemoStores.map((store) => ({ ...store, products: store.products.map((product) => ({ ...product })) }));
    state.selectedStore = stores[0] || null;
    state.selectedProduct = stores[0]?.products?.[0] || null;
    state.cart = [];
  }
  state.catalogLoading = false;
  state.catalogError = options.error ? "catalog_load_failed" : "";
  const route = currentRoute();
  if (route === "home") renderHome();
  if (route === "stays") renderStays();
  if (route === "stayDetail") renderStayDetail();
  if (route === "market") renderStores();
  if (route === "storeDetail") renderStoreDetail();
};

window.motfGetReservationDraft = function getReservationDraft() {
  const requestDetails = [
    stayDateRangeLabel(),
    `체크인 ${qs("#bookingCheckIn").value}`,
    `체크아웃 ${qs("#bookingCheckOut").value}`,
    `시설 이용 ${qs("#bookingFacility").value}`,
    qs("#bookingMemo").value.trim(),
  ].filter(Boolean).join(" / ");
  return {
    business_id: state.selectedStay.id,
    offering_id: state.selectedRoom.id,
    customer_name: qs("#bookingName").value.trim(),
    group_name: qs("#bookingOrg").value.trim() || null,
    contact_phone: formatPhone(qs("#bookingPhone").value) || null,
    event_date: qs("#stayCheckInDate").value,
    check_out_date: qs("#stayCheckOutDate").value,
    guest_count: Number(qs("#bookingPeople").value),
    request_memo: requestDetails || null,
  };
};

window.motfApplyLaunchContent = function applyLaunchContent(events = [], cards = [], social = {}) {
  state.platformEvents = Array.isArray(events) ? events : [];
  state.homepageCards = Array.isArray(cards) ? cards : [];
  const instagram = qs("[data-social-instagram]");
  if (instagram) instagram.dataset.url = social.instagram_url || "";
  if (currentRoute() === "home") renderHome();
  if (currentRoute() === "events") renderEvents();
};

window.motfGetRefundAccountDraft = function getRefundAccountDraft() {
  return {
    bank: qs("#bookingRefundBank")?.value || "",
    account_number: String(qs("#bookingRefundAccount")?.value || "").replace(/\D/g, ""),
    holder_name: qs("#bookingRefundHolder")?.value.trim() || "",
    phone: formatPhone(qs("#bookingPhone")?.value || window.motfCurrentUserProfile?.phone || "") || null,
    consent_at: new Date().toISOString(),
  };
};

window.motfApplyRefundAccount = function applyRefundAccount(account) {
  if (!account) return;
  if (qs("#bookingRefundBank")) qs("#bookingRefundBank").value = account.bank || "";
  if (qs("#bookingRefundAccount")) qs("#bookingRefundAccount").value = account.account_number || "";
  if (qs("#bookingRefundHolder")) qs("#bookingRefundHolder").value = account.holder_name || "";
};

window.motfGetMarketOrderDraft = function getMarketOrderDraft() {
  const items = state.cart.map((cartItem) => {
    const found = findProduct(cartItem.productId);
    return {
      offering_id: found.product.id,
      quantity: cartItem.qty,
    };
  });
  return {
    business_id: state.selectedStore.id,
    customer_name: window.motfCurrentUserProfile?.full_name || "이용자",
    contact_phone: window.motfCurrentUserProfile?.phone || null,
    pickup_place: qs("#pickupPlace").value.trim(),
    pickup_time: qs("#pickupTime").value,
    request_memo: qs("#pickupMemo").value.trim() || null,
    items,
  };
};

window.motfStartPreparedPayment = function startPreparedPayment(intent, draft) {
  const type = intent.kind;
  const isStay = type === "stay";
  const isExtraCharge = type === "extra_charge";
  const amount = Number(intent.amount);
  const originalAmount = Number(intent.original_amount || intent.amount);
  const pointsUsed = Number(intent.points_used || 0);
  const couponDiscount = Number(intent.coupon_discount || 0);
  state.pendingPayment = {
    type,
    title: isStay ? "숙소 예약" : isExtraCharge ? "숙소 추가 이용금" : "MT 장보기 주문",
    itemName: intent.order_name,
    amount,
    originalAmount,
    pointsUsed,
    couponDiscount,
    orderId: intent.order_id,
    userId: window.motfCurrentUserId || "",
    customerName: draft.customer_name || window.motfCurrentUserProfile?.full_name || "이용자",
    customerPhone: draft.contact_phone || window.motfCurrentUserProfile?.phone || "",
    customerEmail: window.motfCurrentUserEmail || "",
    stayName: isStay ? state.selectedStay.name : isExtraCharge ? draft.stay_name : undefined,
    roomName: isStay ? state.selectedRoom.name : isExtraCharge ? draft.offering_name : undefined,
    storeName: isStay || isExtraCharge ? undefined : state.selectedStore.name,
    location: isStay ? state.selectedStay.distance : isExtraCharge ? undefined : "마트 수령 장소는 주문 정보 기준",
    date: isStay ? draft.event_date : isExtraCharge ? draft.event_date : undefined,
    checkOutDate: isStay ? draft.check_out_date : isExtraCharge ? draft.check_out_date : undefined,
    people: isStay ? draft.guest_count : isExtraCharge ? draft.guest_count : undefined,
    pickupTime: isStay || isExtraCharge ? undefined : draft.pickup_time,
    lines: [
      ...(isStay ? [["숙박일", `${draft.event_date} ~ ${draft.check_out_date}`]] : []),
      ...(isExtraCharge ? [["연결 예약", draft.offering_name || "숙소 예약"], ["추가 이용 항목", draft.items_label || "추가 이용금"]] : []),
      [isStay ? "객실 기본금" : isExtraCharge ? "추가 이용금" : "상품 금액", originalAmount],
      ...(couponDiscount ? [["할인코드", -couponDiscount]] : []),
      ...(pointsUsed ? [["포인트 사용", -pointsUsed]] : []),
    ],
  };
  savePendingPayment(state.pendingPayment);
  routeParents.payment = isStay ? "stays" : isExtraCharge ? "myUsage" : "market";
  navigate("payment");
};

window.motfApplyMyTransactions = function applyMyTransactions(reservations, orders) {
  state.reservations = reservations;
  state.orders = orders;
  renderMypage();
};

window.motfAddCommunityPost = function addCommunityPost(post) {
  const board = communityBoards.find((item) => item.id === post.boardId) || communityBoards[0];
  board.posts.unshift({ id: post.id, title: post.title, body: post.body, likes: 0, comments: [], media: post.media || "", authorId: post.authorId, createdAt: post.createdAt });
  state.activeBoardId = board.id;
  state.activePostId = post.id;
  renderBoardDetail();
};

window.motfApplyCommunityData = function applyCommunityData(posts, likes, comments) {
  if (!Array.isArray(posts) || !posts.length) return;
  const likeCounts = (likes || []).reduce((map, item) => map.set(item.post_id, (map.get(item.post_id) || 0) + 1), new Map());
  const commentsByPost = (comments || []).reduce((map, item) => {
    const list = map.get(item.post_id) || [];
    list.push({ body: item.body, userId: item.user_id, replyTo: item.parent_user_id || null, createdAt: item.created_at });
    map.set(item.post_id, list); return map;
  }, new Map());
  communityBoards.forEach((board) => {
    const remote = posts.filter((post) => post.board_key === board.id).map((post) => ({
      id: post.id, title: post.title, body: post.body, authorId: post.author_id,
      createdAt: post.created_at, media: post.media_urls?.length ? `첨부 ${post.media_urls.length}` : "",
      likes: likeCounts.get(post.id) || 0, comments: commentsByPost.get(post.id) || [],
    }));
    if (remote.length) board.posts = remote;
  });
  if (currentRoute() === "community") renderCommunity();
  if (currentRoute() === "boardDetail") renderBoardDetail();
};

window.motfClearUserScopedState = function clearUserScopedState() {
  state.reservations = [];
  state.orders = [];
  state.mtProjects = [];
  state.mtProjectMode = "list";
  state.mtCandidates = [];
  state.mtCandidateRecords = [];
  state.mtProject = {
    id: null,
    title: "",
    organization_name: "",
    region: "가평",
    starts_on: "",
    ends_on: "",
    guest_count: 10,
    status: "planning",
    estimated_budget: 0,
    items: [],
    itinerary: [],
    notices: [],
  };
  state.selectedUsageIds.clear();
  state.pendingPayment = null;
  clearPendingPayment();
  if (currentRoute() === "myMt") renderMyMt();
  if (currentRoute() === "myUsage" || currentRoute() === "mypage") renderMypage();
};

const routeParents = {
  home: "home",
  eventDetail: "events",
  stayDetail: "stays",
  roomDetail: "stays",
  booking: "stays",
  storeDetail: "market",
  productDetail: "market",
  cart: "market",
  payment: "",
  paymentResult: "",
  recreation: "community",
  activityDetail: "community",
  boardDetail: "community",
  postDetail: "community",
  myUsage: "mypage",
  myAccount: "mypage",
  myGuide: "mypage",
  budgetPreview: "myUsage",
  review: "mypage",
  businessInfo: "home",
  terms: "home",
  privacy: "home",
  refundPolicy: "home",
  complete: "",
};

const appRoutes = new Set([
  "home",
  "events",
  "eventDetail",
  "myMt",
  "stays",
  "stayDetail",
  "roomDetail",
  "booking",
  "market",
  "storeDetail",
  "productDetail",
  "cart",
  "payment",
  "paymentResult",
  "community",
  "recreation",
  "activityDetail",
  "boardDetail",
  "postDetail",
  "chat",
  "mypage",
  "myUsage",
  "myAccount",
  "myGuide",
  "budgetPreview",
  "review",
  "businessInfo",
  "terms",
  "privacy",
  "refundPolicy",
  "complete",
]);

const routePaths = {
  home: "/",
  events: "/events",
  eventDetail: "/events/detail",
  myMt: "/my-mt",
  stays: "/stays",
  stayDetail: "/stays/detail",
  roomDetail: "/stays/room",
  booking: "/stays/booking",
  market: "/market",
  storeDetail: "/market/store",
  productDetail: "/market/product",
  cart: "/market/cart",
  payment: "/payment",
  paymentResult: "/payment/result",
  community: "/community",
  recreation: "/community/recreation",
  activityDetail: "/community/recreation/detail",
  boardDetail: "/community/board",
  postDetail: "/community/post",
  chat: "/chat",
  mypage: "/mypage",
  myUsage: "/mypage/usage",
  myAccount: "/mypage/account",
  myGuide: "/mypage/guide",
  budgetPreview: "/mypage/budget",
  review: "/mypage/review",
  businessInfo: "/business-info",
  terms: "/terms",
  privacy: "/privacy",
  refundPolicy: "/refund-policy",
  complete: "/complete",
};

const pathRoutes = Object.entries(routePaths).reduce((routes, [route, path]) => {
  routes[path] = route;
  return routes;
}, { "/index.html": "home" });

const legacyRouteAliases = {
  mySupport: "mypage",
};

const routeHistory = [];
let appHistoryDepth = 0;
const qs = (selector) => document.querySelector(selector);
const qsa = (selector) => [...document.querySelectorAll(selector)];

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

window.__motfRefreshIcons = refreshIcons;

function toast(message) {
  const el = qs("#toast");
  el.textContent = message;
  el.classList.add("show");
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => el.classList.remove("show"), 2200);
}

function currentRoute() {
  return qs(".view.active")?.id || "home";
}

function routeFromLocation() {
  const hashRoute = window.location.hash.replace(/^#!/, "").replace("#", "");
  if (appRoutes.has(hashRoute)) return hashRoute;
  const queryRoute = new URLSearchParams(window.location.search).get("route");
  const resolvedQueryRoute = legacyRouteAliases[queryRoute] || queryRoute;
  if (appRoutes.has(resolvedQueryRoute)) return resolvedQueryRoute;
  const normalizedPath = window.location.pathname.replace(/\/+$/, "") || "/";
  return pathRoutes[normalizedPath] || "home";
}

function routeUrl(route) {
  const path = routePaths[route] || "/";
  return `${window.location.origin}${path}`;
}

function preservePendingMtInvite() {
  const inviteCode = new URLSearchParams(window.location.search).get("invite");
  if (inviteCode) window.sessionStorage.setItem("motf.pendingMtInvite", inviteCode.trim().toUpperCase());
}

function updateBrowserRoute(route, options = {}) {
  if (options.updateHistory === false) return;
  const method = options.replace ? "replaceState" : "pushState";
  window.history[method]({ route }, "", routeUrl(route));
  if (!options.replace) appHistoryDepth += 1;
}

function replaceBrowserRoute(route) {
  window.history.replaceState({ route }, "", routeUrl(route));
}

function navigate(route, options = {}) {
  if (!appRoutes.has(route)) route = "home";
  const previousRoute = currentRoute();
  if (options.record !== false && previousRoute && previousRoute !== route) {
    routeHistory.push(previousRoute);
    if (routeHistory.length > 30) routeHistory.shift();
  }
  if (route === "myMt" && options.keepMtWorkspace !== true) state.mtProjectMode = "list";
  qsa(".view").forEach((view) => view.classList.toggle("active", view.id === route));
  document.body.dataset.currentRoute = route;
  const activeNav = routeParents[route] ?? route;
  qsa(".nav-link").forEach((link) => link.classList.toggle("active", link.dataset.route === activeNav));
  renderRoute(route);
  updateBrowserRoute(route, options);
  window.dispatchEvent(new CustomEvent("motf:routechange", {
    detail: { route, previousRoute },
  }));
  if (options.scroll !== false) {
    window.scrollTo({ top: 0, behavior: "auto" });
  }
  refreshIcons();
}

function goBack(fallbackRoute = "home") {
  if (appHistoryDepth > 0) {
    window.history.back();
    return;
  }
  const previousRoute = routeHistory.pop() || fallbackRoute || "home";
  navigate(previousRoute, { record: false, replace: true });
}

function renderRoute(route) {
  if (route === "home") renderHome();
  if (route === "events") renderEvents();
  if (route === "eventDetail") renderEventDetail();
  if (route === "myMt") renderMyMt();
  if (route === "stays") renderStays();
  if (route === "stayDetail") renderStayDetail();
  if (route === "roomDetail") renderRoomDetail();
  if (route === "booking") renderBooking();
  if (route === "market") renderStores();
  if (route === "storeDetail") renderStoreDetail();
  if (route === "productDetail") renderProductDetail();
  if (route === "cart") renderCart();
  if (route === "payment") renderPayment();
  if (route === "paymentResult") renderPaymentResult();
  if (route === "community") renderCommunity();
  if (route === "recreation") {
    qs("#recreation")?.classList.remove("compose-mode");
    const recreationForm = qs("#activitySubmitForm");
    if (recreationForm) { recreationForm.hidden = true; recreationForm.classList.remove("full-page-compose"); }
    renderRecreation();
  }
  if (route === "activityDetail") renderActivityDetail();
  if (route === "boardDetail") renderBoardDetail();
  if (route === "postDetail") renderPostDetail();
  if (route === "chat") renderChat();
  if (route === "mypage") renderMypage();
  if (route === "myUsage") renderMypage();
  if (route === "budgetPreview") window.motfRenderBudgetPreview?.();
  if (route === "review") renderReviews();
}

const homeStories = [
  {
    category: "moTF PICK",
    title: "MT에서 미친 텐션 끌어올리는 게임을 원한다면?",
    summary: "moTF 엄선 뜨거워지는 게임들",
    image: photo("photo-1529156069898-49953e39b3ac", "auto=format&fit=crop&w=1200&q=84"),
    route: "recreation",
    featured: true,
  },
  {
    category: "장보기 가이드",
    title: "50명 MT, 얼마나 사야 되지?",
    summary: "moTF 데이터로 보는 평균 주문량",
    image: photo("photo-1529193591184-b1d58069ecdd", "auto=format&fit=crop&w=900&q=82"),
    route: "community",
    section: "orderRecommend",
  },
  {
    category: "게시판 모음",
    title: "새로운 경험을 하고 싶다면?",
    summary: "교통 정보부터 현장 나눔까지",
    image: photo("photo-1527529482837-4698179dc6ce", "auto=format&fit=crop&w=900&q=82"),
    route: "community",
    section: "boards",
  },
];

const launchCommunityBoards = () => communityBoards;

const marketBundleImages = [
  photo("photo-1544025162-d76694265947", "auto=format&fit=crop&w=1000&q=84"),
  photo("photo-1510812431401-41d2bd2722f3", "auto=format&fit=crop&w=1000&q=84"),
  photo("photo-1612929633738-8fe44f7ec841", "auto=format&fit=crop&w=1000&q=84"),
];

function renderHome() {
  renderHomePicks();
  renderHomeEvents();
  renderHomeCardNews();
  renderHomeMarketPicks();
  renderHomeStories();
  syncStaySearchPanel(qs("#home") || document);
}

function effectiveEventStatus(event) {
  const now = Date.now();
  const starts = new Date(event.starts_at).getTime();
  const opens = new Date(event.application_opens_at).getTime();
  const closes = new Date(event.application_closes_at).getTime();
  if (["draft", "cancelled", "completed"].includes(event.status)) return event.status;
  if (Number.isFinite(starts) && now >= new Date(event.ends_at).getTime()) return "completed";
  if (event.status === "closed" || now >= closes || Number(event.application_count) >= Number(event.capacity)) return "closed";
  if (now >= opens) return "open";
  return "scheduled";
}

function eventStatusLabel(status) {
  return { open: "신청 중", scheduled: "곧 신청", closed: "신청 마감", completed: "진행 종료", cancelled: "취소" }[status] || "준비 중";
}

function formatEventDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "일정 확인 중";
  return new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

function eventCard(event, featured = false) {
  const status = effectiveEventStatus(event);
  return `<button class="platform-event-card ${featured ? "featured" : ""}" type="button" data-event-id="${event.id}">
    <span class="platform-event-media"><img src="${event.poster_url}" alt="${escapeHtml(event.title)} 포스터" /><b class="event-status ${status}">${eventStatusLabel(status)}</b></span>
    <span class="platform-event-body"><small>${formatEventDate(event.starts_at)} · ${escapeHtml(event.venue_name || "장소 공개 예정")}</small><strong>${escapeHtml(event.title)}</strong><span>${escapeHtml(event.short_description)}</span><span class="event-meta"><b>${money(event.price_per_person)} / 1인</b><b>${Number(event.application_count || 0).toLocaleString()} / ${Number(event.capacity).toLocaleString()}명</b></span></span>
  </button>`;
}

function renderHomeEvents() {
  const container = qs("#homeEventPicks");
  if (!container) return;
  const visible = state.platformEvents.filter((event) => !["draft", "cancelled"].includes(event.status)).slice(0, 3);
  container.innerHTML = visible.length
    ? visible.map((event, index) => eventCard(event, index === 0)).join("")
    : `<div class="empty-state compact"><strong>첫 모티프 MT를 준비하고 있어요.</strong><span>신청 일정이 정해지면 가장 먼저 공개할게요.</span></div>`;
  refreshIcons();
}

function renderHomeCardNews() {
  const section = qs(".home-card-news");
  const container = qs("#homeCardNews");
  if (!section || !container) return;
  section.hidden = !state.homepageCards.length;
  container.innerHTML = state.homepageCards.map((card) => `<a class="home-news-card" href="${escapeHtml(card.link_url || "#")}" ${card.link_url ? 'target="_blank" rel="noopener noreferrer"' : ""}><img src="${card.image_url}" alt="" /><span><small>${escapeHtml(card.placement === "promotion" ? "프로모션" : "CARD NEWS")}</small><strong>${escapeHtml(card.title)}</strong><b>${escapeHtml(card.subtitle || card.link_label || "자세히 보기")}</b></span></a>`).join("");
}

function renderEvents() {
  const container = qs("#eventDirectory");
  if (!container) return;
  const filtered = state.platformEvents.filter((event) => {
    const status = effectiveEventStatus(event);
    return !["draft", "cancelled"].includes(status) && (state.eventFilter === "all" || status === state.eventFilter);
  });
  container.innerHTML = filtered.length ? filtered.map((event) => eventCard(event, event.is_featured)).join("") : `<div class="empty-state"><strong>해당 상태의 이벤트가 없습니다.</strong><span>새 일정은 운영팀이 확정하는 즉시 공개됩니다.</span></div>`;
  refreshIcons();
}

function renderEventDetail() {
  const event = state.selectedEvent;
  const container = qs("#eventDetailContent");
  if (!container) return;
  if (!event) { container.innerHTML = '<div class="empty-state">이벤트를 찾을 수 없습니다.</div>'; return; }
  const status = effectiveEventStatus(event);
  const canApply = status === "open" && event.google_form_url;
  const timeline = Array.isArray(event.timeline) ? event.timeline : [];
  const highlights = Array.isArray(event.highlights) ? event.highlights : [];
  container.innerHTML = `<article class="event-detail-hero"><img src="${event.poster_url}" alt="${escapeHtml(event.title)} 포스터" /><div><span class="event-status ${status}">${eventStatusLabel(status)}</span><p class="eyebrow">moTF ORIGINAL</p><h1>${escapeHtml(event.title)}</h1><p>${escapeHtml(event.description || event.short_description)}</p><dl><div><dt>일정</dt><dd>${formatEventDate(event.starts_at)}</dd></div><div><dt>장소</dt><dd>${escapeHtml(event.venue_name || "공개 예정")}</dd></div><div><dt>참가비</dt><dd>${money(event.price_per_person)} / 1인</dd></div><div><dt>정원</dt><dd>${event.application_count || 0} / ${event.capacity}명</dd></div></dl>${canApply ? `<a class="primary-btn event-apply-button" href="${escapeHtml(event.google_form_url)}" target="_blank" rel="noopener noreferrer"><i data-lucide="external-link"></i>신청서 작성</a>` : `<button class="primary-btn event-apply-button" disabled>${status === "scheduled" ? `${formatEventDate(event.application_opens_at)} 오픈` : eventStatusLabel(status)}</button>`}</div></article>
    ${highlights.length ? `<section class="event-detail-section"><p class="eyebrow">HIGHLIGHT</p><h2>이번 MT에서 만날 것들</h2><div class="event-highlight-list">${highlights.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div></section>` : ""}
    ${timeline.length ? `<section class="event-detail-section"><p class="eyebrow">TIMELINE</p><h2>진행 일정</h2><ol class="event-timeline">${timeline.map((item) => `<li><time>${escapeHtml(item.time || "")}</time><div><strong>${escapeHtml(item.title || "")}</strong><span>${escapeHtml(item.description || "")}</span></div></li>`).join("")}</ol></section>` : ""}`;
  refreshIcons();
}

function renderHomePicks() {
  const container = qs("#homeStayPicks");
  if (!container) return;
  if (state.catalogLoading) {
    container.innerHTML = Array.from({ length: 3 }, () => `<article class="home-stay-pick catalog-skeleton" aria-hidden="true"><span></span><div><i></i><i></i><i></i></div></article>`).join("");
    return;
  }
  if (state.catalogError) {
    container.innerHTML = `<div class="empty-state catalog-error"><i data-lucide="cloud-off"></i><strong>숙소 정보를 불러오지 못했습니다.</strong><span>잠시 후 다시 시도해주세요.</span></div>`;
    refreshIcons();
    return;
  }
  container.innerHTML = stays.map((stay) => {
    const estimate = estimateMtStayCost(stay);
    const highlights = (stay.highlights?.length ? stay.highlights : stay.amenities || []).slice(0, 3);
    return `
    <button class="home-stay-pick" type="button" data-stay-id="${stay.id}">
      <img src="${stay.image}" alt="${escapeHtml(stay.name)}" />
      <span class="home-stay-pick-body">
        <small>${escapeHtml(stay.region)} · 최대 ${stay.maxPeople}명</small>
        <strong>${escapeHtml(stay.name)}</strong>
        <span class="home-stay-features">${Array.from({ length: 3 }, (_, index) => highlights[index]
          ? `<b>${escapeHtml(highlights[index])}</b>`
          : '<b class="feature-placeholder" aria-hidden="true">&nbsp;</b>').join("")}</span>
        <span>${estimate.people}명 예상 총액 ${money(estimate.total)}</span>
      </span>
    </button>
  `}).join("");
  window.requestAnimationFrame(() => {
    const canScroll = container.scrollWidth > container.clientWidth + 2;
    qsa("[data-home-stay-scroll]").forEach((button) => { button.hidden = !canScroll; });
  });
  refreshIcons();
}

function renderHomeStories() {
  const container = qs("#homeStoryGrid");
  if (!container) return;
  container.innerHTML = homeStories.map((story) => `
    <button class="home-story-card ${story.featured ? "featured" : ""}" type="button" data-route="${story.route}" ${story.section ? `data-community-section="${story.section}"` : ""}>
      <img src="${story.image}" alt="" />
      <span class="home-story-copy">
        <small>${escapeHtml(story.category)}</small>
        <strong>${escapeHtml(story.title)}</strong>
        <span>${escapeHtml(story.summary)}</span>
      </span>
    </button>
  `).join("");
  refreshIcons();
}

function renderHomeMarketPicks() {
  const container = qs("#homeMarketPicks");
  if (!container) return;
  const picks = stores.flatMap((store) => {
    ensureMarketBundleProducts(store);
    return store.products.map((product) => ({ product, store }));
  }).slice(0, 8);
  if (!picks.length) {
    container.innerHTML = `<div class="empty-state compact catalog-error"><strong>제휴 마트 상품을 준비하고 있어요.</strong><span>상품이 공개되면 이곳에서 바로 확인할 수 있습니다.</span></div>`;
    return;
  }
  container.innerHTML = picks.map(({ product, store }) => `
    <button class="home-stay-pick home-market-pick" type="button" data-product-id="${product.id}">
      <img src="${product.image}" alt="${escapeHtml(product.name)}" />
      <span class="home-stay-pick-body home-market-pick-body">
        <small>${escapeHtml(store.name)} · ${escapeHtml(product.unit || "상품")}</small>
        <strong>${escapeHtml(product.name)}</strong>
        <span class="home-stay-features">
          <b>${escapeHtml(product.category || "기타")}</b>
          <b>${product.isBundle ? `${product.bundleProductIds?.length || 1}종 구성` : escapeHtml(product.origin || "원산지 상세 확인")}</b>
          <b>${product.isAlcohol ? "성인 인증 필요" : "장바구니 주문"}</b>
        </span>
        <span>${money(product.price)}</span>
      </span>
    </button>
  `).join("");
  window.requestAnimationFrame(() => {
    const canScroll = container.scrollWidth > container.clientWidth + 2;
    qsa("[data-home-market-scroll]").forEach((button) => {
      button.disabled = !canScroll;
      button.setAttribute("aria-disabled", String(!canScroll));
    });
  });
}

function scrollToCommunitySection(section = "") {
  const target = section === "boards"
    ? qs("#communityBoardSection")
    : section === "orderRecommend"
      ? qs("#communityOrderRecommend")
      : null;
  if (!target) return;
  [80, 220].forEach((delay) => {
    window.setTimeout(() => {
      target.scrollIntoView({ behavior: delay > 100 ? "auto" : "smooth", block: "start" });
    }, delay);
  });
}

function hasNaverMapKey() {
  return Boolean(NAVER_MAP_KEY_ID);
}

function loadNaverMaps() {
  if (window.naver?.maps) return Promise.resolve(window.naver.maps);
  if (!hasNaverMapKey()) {
    return Promise.reject(new Error("네이버 지도 Client ID가 아직 비어 있습니다."));
  }
  if (naverMapPromise) return naverMapPromise;

  naverMapPromise = new Promise((resolve, reject) => {
    const existingScript = document.getElementById(NAVER_MAP_SCRIPT_ID);
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(window.naver.maps), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("네이버 지도 스크립트를 불러오지 못했습니다.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = NAVER_MAP_SCRIPT_ID;
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(NAVER_MAP_KEY_ID)}`;
    script.async = true;
    script.onload = () => {
      if (window.naver?.maps) {
        resolve(window.naver.maps);
      } else {
        reject(new Error("네이버 지도 SDK가 준비되지 않았습니다."));
      }
    };
    script.onerror = () => reject(new Error("네이버 지도 스크립트를 불러오지 못했습니다."));
    document.head.appendChild(script);
  });

  return naverMapPromise;
}

function mapPanel(kind) {
  return qs(`[data-map-kind="${kind}"]`);
}

function setMapStatus(kind, message) {
  const status = mapPanel(kind)?.querySelector("[data-map-status]");
  if (status) {
    status.textContent = message;
    status.hidden = !message;
  }
}

function mapItems(kind, matches) {
  return matches.map((item) => ({
    id: item.id,
    name: item.name,
    region: item.region,
    line: kind === "stays" ? `최대 ${item.maxPeople}명` : item.type,
    amount: kind === "stays" ? `예상 총액 ${money(estimateMtStayCost(item).total)}` : `상품 ${item.products.length}개`,
    markerLabel: kind === "stays" ? money(estimateMtStayCost(item).total) : item.name,
    markerSubLabel: kind === "stays" ? item.name : item.type,
    location: item.location,
  }));
}

function fallbackMarker(item, kind, index) {
  const markerClass = ["marker-a", "marker-b", "marker-c", "marker-d"][index % 4];
  const dataAttr = kind === "stays" ? `data-stay-id="${item.id}"` : `data-store-id="${item.id}"`;
  return `<button class="map-marker ${markerClass}" ${dataAttr}>${escapeHtml(item.markerLabel)}<br /><span>${escapeHtml(item.markerSubLabel)}</span></button>`;
}

function renderFallbackMap(kind, matches, statusMessage) {
  const panel = mapPanel(kind);
  if (!panel) return;
  const fallback = panel.querySelector("[data-map-fallback]");
  const items = mapItems(kind, matches);

  panel.classList.remove("map-ready");
  fallback.innerHTML = `
    <div class="map-grid"></div>
    ${
      items.length
        ? items.map((item, index) => fallbackMarker(item, kind, index)).join("")
        : `<div class="map-empty">조건에 맞는 ${kind === "stays" ? "숙소" : "장보기 제휴처"}가 없습니다.</div>`
    }
  `;
  setMapStatus(kind, statusMessage);
}

function clearNaverMarkers(kind) {
  mapState[kind].markers.forEach((marker) => marker.setMap(null));
  mapState[kind].markers = [];
  mapState[kind].infoWindow?.close();
}

function openListingFromMap(kind, itemId) {
  if (kind === "stays") {
    state.selectedStay = stays.find((stay) => stay.id === itemId) || stays[0];
    state.selectedRoom = state.selectedStay.rooms[0];
    navigate("stayDetail");
    return;
  }

  state.selectedStore = stores.find((store) => store.id === itemId) || stores[0];
  state.activeCategory = "전체";
  navigate("storeDetail");
}

function markerContent(item, kind) {
  return `
    <div class="naver-map-marker ${kind === "market" ? "market" : ""}">
      ${escapeHtml(item.markerLabel)}
      <span>${escapeHtml(item.markerSubLabel)}</span>
    </div>
  `;
}

function infoContent(item, kind) {
  const action = kind === "stays" ? "숙소 상세로 이동" : "장보기 상품 보기";
  return `
    <div class="naver-map-info">
      <strong>${item.name}</strong>
      <div>${item.line} · ${item.amount}</div>
      <div>${action}</div>
    </div>
  `;
}

function drawNaverMap(kind, matches, maps) {
  const panel = mapPanel(kind);
  const canvas = panel?.querySelector(".naver-map-canvas");
  if (!panel || !canvas) return;

  const items = mapItems(kind, matches).filter((item) => item.location);
  const fallbackCenter = kind === "stays" ? { lat: 37.7465, lng: 127.5065 } : { lat: 37.7108, lng: 127.5452 };
  const firstLocation = items[0]?.location || fallbackCenter;
  const center = new maps.LatLng(firstLocation.lat, firstLocation.lng);

  if (!mapState[kind].map) {
    mapState[kind].map = new maps.Map(canvas, {
      center,
      zoom: items.length <= 1 ? 11 : 10,
      mapDataControl: false,
      scaleControl: false,
    });
    mapState[kind].infoWindow = new maps.InfoWindow({ borderWidth: 0, disableAnchor: true });
  }

  const map = mapState[kind].map;
  clearNaverMarkers(kind);
  panel.classList.add("map-ready");
  setMapStatus(kind, "");

  if (!items.length) {
    map.setCenter(center);
    map.setZoom(10);
    return;
  }

  const bounds = new maps.LatLngBounds();
  items.forEach((item) => {
    const position = new maps.LatLng(item.location.lat, item.location.lng);
    bounds.extend(position);
    const marker = new maps.Marker({
      position,
      map,
      title: item.name,
      icon: {
        content: markerContent(item, kind),
        size: new maps.Size(122, 58),
        anchor: new maps.Point(61, 58),
      },
    });

    maps.Event.addListener(marker, "click", () => {
      mapState[kind].infoWindow.setContent(infoContent(item, kind));
      mapState[kind].infoWindow.open(map, marker);
      window.setTimeout(() => openListingFromMap(kind, item.id), 450);
    });
    mapState[kind].markers.push(marker);
  });

  if (items.length === 1) {
    map.setCenter(center);
    map.setZoom(12);
  } else {
    map.fitBounds(bounds);
  }

  window.setTimeout(() => {
    map.refresh?.();
  }, 0);
}

async function renderListingMap(kind, matches) {
  mapState[kind].version += 1;
  const version = mapState[kind].version;
  const waitingMessage = hasNaverMapKey() ? "네이버 지도 불러오는 중" : "지도 연결을 확인하고 있습니다";
  renderFallbackMap(kind, matches, waitingMessage);

  if (!hasNaverMapKey()) return;

  try {
    const maps = await loadNaverMaps();
    if (mapState[kind].version !== version) return;
    drawNaverMap(kind, matches, maps);
  } catch (error) {
    if (mapState[kind].version !== version) return;
    renderFallbackMap(kind, matches, "지도를 불러오지 못해 위치만 표시합니다");
  }
}

function getStayDetailFilters() {
  return {
    tags: qsa("[data-stay-filter]:checked").map((input) => input.value),
    minRooms: Number(qs("#stayMinRooms")?.value || 0),
    minBaths: Number(qs("#stayMinBaths")?.value || 0),
  };
}

function stayMatchesDetailFilters(stay, filters) {
  const tags = stay.detailTags || [];
  const tagsOk = filters.tags.every((tag) => tags.includes(tag));
  const roomsOk = Number(stay.roomCount || 0) >= filters.minRooms;
  const bathsOk = Number(stay.bathCount || 0) >= filters.minBaths;
  return tagsOk && roomsOk && bathsOk;
}

function getStayMatches() {
  normalizeStaySearchDates();
  ensureStayAvailability();
  const region = qs("#stayRegion").value;
  const people = Number(qs("#stayPeople").value || 0);
  const maxPrice = Number(qs("#stayPrice").value || 0);
  const detailFilters = getStayDetailFilters();
  return stays.filter((stay) => {
    const regionOk = region === "전체" || stay.region === region;
    const priceOk = maxPrice >= 2000000 || stayDisplayPrice(stay) <= maxPrice;
    return regionOk && stay.maxPeople >= people && priceOk && stayMatchesDetailFilters(stay, detailFilters) && stayHasAvailableRoom(stay);
  });
}

function renderStays() {
  normalizeStaySearchDates();
  ensureStayAvailability();
  const price = Number(qs("#stayPrice").value);
  qs("#stayPriceLabel").textContent = price >= 2000000 ? "2,000,000원 이상" : `${money(price)} 이하`;
  const detailFilters = getStayDetailFilters();
  const activeDetailFilterCount = detailFilters.tags.length + (detailFilters.minRooms > 0 ? 1 : 0) + (detailFilters.minBaths > 0 ? 1 : 0);
  const detailFilterButton = qs("[data-toggle-stay-filters]");
  if (detailFilterButton) {
    detailFilterButton.classList.toggle("active", activeDetailFilterCount > 0);
    detailFilterButton.innerHTML = `<i data-lucide="sliders-horizontal"></i>세부필터${activeDetailFilterCount ? ` ${activeDetailFilterCount}` : ""}`;
  }
  if (state.catalogLoading) {
    qs("#stayCount").textContent = "";
    qs("#stayList").innerHTML = Array.from({ length: state.staysPerPage || 5 }, () => `<article class="listing-card stay-listing-card catalog-skeleton" aria-hidden="true"><span></span><div><i></i><i></i><i></i></div></article>`).join("");
    qs("#stayPagination").innerHTML = "";
    renderListingMap("stays", []);
    syncStaySearchPanel();
    return;
  }
  const matches = getStayMatches();
  const pageSize = Math.max(1, Number(state.staysPerPage || 4));
  const pageCount = Math.max(1, Math.ceil(matches.length / pageSize));
  state.stayPage = Math.min(Math.max(1, Number(state.stayPage || 1)), pageCount);
  const pageStart = (state.stayPage - 1) * pageSize;
  const visibleMatches = matches.slice(pageStart, pageStart + pageSize);
  qs("#stayCount").textContent = `${matches.length}개 숙소`;
  qs("#stayList").innerHTML = state.catalogError
    ? `<div class="empty-state catalog-error"><i data-lucide="cloud-off"></i><strong>숙소 정보를 불러오지 못했습니다.</strong><span>잠시 후 다시 시도해주세요.</span></div>`
    : matches.length
    ? visibleMatches.map(stayCard).join("")
    : `<div class="empty-state">조건에 맞는 숙소가 없습니다. 인원이나 예산을 넓혀보세요.</div>`;
  renderStayPagination(matches.length, pageCount);
  renderListingMap("stays", matches);
  syncStaySearchPanel();
  refreshIcons();
}

function stayCard(stay) {
  const availableCount = availableRoomsForStay(stay).length;
  const estimate = estimateMtStayCost(stay);
  const selected = state.mtCandidateRecords.some((candidate) => String(candidate.businessId || candidate.business_id) === String(stay.id));
  const bathLabel = stay.bathCount ? `화장실 ${stay.bathCount}개` : "화장실 수 확인 필요";
  return `
    <article class="listing-card stay-listing-card">
      <img src="${stay.image}" alt="${stay.name} 사진" />
      <div class="listing-body stay-listing-body">
        <div class="stay-card-copy">
          <div class="listing-meta">
            <span class="pill">${stay.region}</span>
            <span class="pill success">최대 ${stay.maxPeople}명</span>
            <span class="pill">★ ${stay.rating} (${stay.reviews})</span>
          </div>
          <h3>${stay.name}</h3>
          <p class="stay-card-intro">${stay.intro}</p>
          <div class="stay-card-facts">
            <span>${stay.distance}</span>
            <span>${bathLabel}</span>
            ${(stay.highlights || []).slice(0, 1).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
          </div>
        </div>
        <div class="listing-actions stay-card-actions">
          <div class="stay-card-price-block">
            <span class="price">${money(estimate.total)}</span>
            <small>${estimate.people}명 예상 총액</small>
          </div>
          <span class="stay-card-availability">${availableCount}/${stay.rooms.length} 객실 가능</span>
          <div class="stay-card-action-buttons">
            <button class="secondary-btn candidate-button ${selected ? "active" : ""}" data-add-mt-candidate="${stay.id}" aria-label="${selected ? "담은 객실 후보 확인" : "객실 후보 담기"}"><i data-lucide="${selected ? "check" : "plus"}"></i>${selected ? "담김" : "후보"}</button>
            <button class="primary-btn" data-stay-id="${stay.id}"><i data-lucide="search"></i>상세</button>
            <button class="ghost-btn stay-chat-icon" data-open-chat="${stay.name}" aria-label="${stay.name}에 문의" title="채팅 문의"><i data-lucide="message-circle"></i></button>
          </div>
        </div>
      </div>
    </article>
  `;
}

function uniqueImages(images) {
  return [...new Set(images.filter(Boolean))];
}

function stayGalleryImages(stay) {
  return uniqueImages([
    stay.image,
    ...stay.images,
  ]);
}

function roomGalleryImages(_stay, room) {
  return uniqueImages([
    room.image,
    ...(room.images || []),
  ]);
}

function dashList(items) {
  return `<ul class="dash-list">${items.map((item) => `<li>${item}</li>`).join("")}</ul>`;
}

function renderStayPagination(total, pageCount) {
  const container = qs("#stayPagination");
  if (!container) return;
  if (!total || pageCount <= 1) {
    container.innerHTML = "";
    container.hidden = true;
    return;
  }
  container.hidden = false;
  const pages = [];
  for (let page = 1; page <= pageCount; page += 1) {
    const nearCurrent = Math.abs(page - state.stayPage) <= 1;
    if (page === 1 || page === pageCount || nearCurrent) pages.push(page);
  }
  const pageTokens = pages.flatMap((page, index) => {
    const previous = pages[index - 1];
    return index > 0 && page - previous > 1 ? ["ellipsis", page] : [page];
  });
  container.innerHTML = `
    <button type="button" data-stay-page="${state.stayPage - 1}" aria-label="이전 페이지" ${state.stayPage <= 1 ? "disabled" : ""}><i data-lucide="chevron-left"></i></button>
    ${pageTokens.map((page) => page === "ellipsis"
      ? '<span class="stay-pagination-ellipsis" aria-hidden="true">...</span>'
      : `<button type="button" data-stay-page="${page}" class="${page === state.stayPage ? "active" : ""}" aria-label="${page}페이지" ${page === state.stayPage ? 'aria-current="page"' : ""}>${page}</button>`).join("")}
    <button type="button" data-stay-page="${state.stayPage + 1}" aria-label="다음 페이지" ${state.stayPage >= pageCount ? "disabled" : ""}><i data-lucide="chevron-right"></i></button>`;
}

const STANDARD_AMENITIES = [
  ["barbecue", "야외바베큐"], ["pool", "수영장"], ["karaoke", "노래방/마이크"],
  ["screen", "TV/화면"], ["field", "야외운동장"], ["parking", "주차"],
  ["pickup", "픽업"], ["wifi", "와이파이"], ["kitchen", "취사시설"],
];

function amenityDescription(detail, available) {
  if (!detail) return available ? "이용 가능" : "제공되지 않음";
  const p = detail.params || {};
  const includedRooms = Array.isArray(p.included_rooms) ? p.included_rooms.join(", ") : p.included_rooms;
  const equipment = {
    soccer: "축구 골대", basketball: "농구 골대", footvolley: "족구장",
    soccer_ball: "축구공", basketball_ball: "농구공", footvolley_ball: "족구공",
  };
  const parts = {
    barbecue: [p.capacity && `최대 ${p.capacity}명`, p.setup, p.price && `${money(p.price)}`],
    karaoke: [p.available_until && `${p.available_until}까지`, p.mic_count && `마이크 ${p.mic_count}개`, includedRooms],
    field: [(p.equipment || []).map((key) => equipment[key] || key).join(", ")],
    pool: [p.open_start && p.open_end && `${p.open_start}~${p.open_end}`, p.capacity && `최대 ${p.capacity}명`, p.price && money(p.price)],
    screen: [includedRooms, p.ports, p.price && money(p.price)],
    wifi: [p.note],
    parking: [p.spaces != null && `승용차 ${p.spaces}대`, p.bus_allowed && "대형버스 진입 가능"],
    pickup: [p.place, p.hours, p.price && money(p.price)],
  }[detail.key] || [];
  if (detail.detail) parts.push(detail.detail);
  return parts.filter(Boolean).join(" · ") || (available ? "이용 가능" : "제공되지 않음");
}

function amenityChecklist(stay, room = null) {
  const details = [...(stay.amenityDetails || []), ...(room?.amenityDetails || [])];
  const tags = new Set((stay.detailTags || []).map((tag) => ({ outdoor: "barbecue", mic: "karaoke" }[tag] || tag)));
  const rows = STANDARD_AMENITIES.map(([key, label]) => {
    const detail = details.find((item) => item.key === key || item.label === label);
    const available = detail ? detail.available !== false : tags.has(key);
    return { available, label, description: amenityDescription(detail, available) };
  });
  rows.sort((a, b) => Number(b.available) - Number(a.available));
  return `<ul class="amenity-checklist">${rows.map((item) => `<li class="${item.available ? "available" : "unavailable"}"><i data-lucide="${item.available ? "check" : "x"}"></i><span><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.description)}</small></span></li>`).join("")}</ul>`;
}

function roomCapacityMax(room) {
  if (Number(room?.maxPeople) > 0) return Number(room.maxPeople);
  const match = room.capacity.match(/(\d+)\D*$/);
  return match ? Number(match[1]) : 0;
}

function roomDetailFacts(stay, room) {
  return [
    ["정원", room.capacity],
    ["객실 금액", money(room.price)],
    ["숙소 위치", `${stay.region} · ${stay.distance}`],
    ["공간 구성", room.features.join(" · ")],
  ];
}

function renderStayGallery(images, alt) {
  const visible = images.slice(0, 5);
  return `
    <div class="stay-photo-layout">
      <button class="stay-main-photo" type="button" data-open-gallery="0"><img src="${visible[0]}" alt="${alt} 대표 사진" /></button>
      <div class="stay-side-photos">
        ${visible.slice(1).map((src, index) => `<button type="button" data-open-gallery="${index + 1}"><img src="${src}" alt="${alt} 추가 사진 ${index + 1}" />${index === visible.length - 2 && images.length > 5 ? `<b>+${images.length - 5}</b>` : ""}</button>`).join("")}
      </div>
    </div>
  `;
}

function roomOptionCard(room, index, stay) {
  const unavailable = isRoomUnavailable(room);
  return `
    <article class="room-option-card ${unavailable ? "sold-out" : ""}">
      <img src="${room.image}" alt="${room.name} 사진" />
      <div class="room-option-body">
        <div>
          <p class="eyebrow">객실 유형 ${index + 1}</p>
          <h3>${room.name}</h3>
          <p class="muted">${room.capacity} · ${money(room.price)}</p>
        </div>
        <div class="mini-detail-grid">
          ${roomDetailFacts(stay, room)
            .map(
              ([label, value]) => `
                <div class="mini-detail-block">
                  <strong>${label}</strong>
                  <span>- ${value}</span>
                </div>
              `
            )
            .join("")}
        </div>
        <div class="detail-meta">${room.features.map((feature) => `<span class="pill">${feature}</span>`).join("")}</div>
        <button class="primary-btn" ${unavailable ? "disabled" : `data-room-index="${index}"`}><i data-lucide="${unavailable ? "ban" : "door-open"}"></i>${unavailable ? "품절" : "객실 자세히 보기"}</button>
      </div>
    </article>
  `;
}

function renderStayDetail() {
  ensureStayAvailability();
  const stay = state.selectedStay;
  const gallery = stayGalleryImages(stay);
  state.gallery = { images: gallery, index: 0, alt: stay.name };
  const insight = stayReviewInsight(stay);
  qs("#stayDetailContent").innerHTML = `
    <section class="stay-detail-top">
      <div>
        <p class="eyebrow">${stay.region} · ${stay.distance}</p>
        <h1 class="stay-detail-title">${stay.name}</h1>
        <p class="stay-detail-intro">${stay.intro}</p>
        ${stay.fullIntro && stay.fullIntro !== stay.intro ? `<details class="stay-description-more"><summary>숙소 소개 더보기</summary><p>${stay.fullIntro}</p></details>` : ""}
        <div class="detail-meta">
          <span class="pill success">최대 ${stay.maxPeople}명</span>
          <span class="pill">방 ${stay.roomCount}개</span>
          <span class="pill">${stay.bathCount ? `화장실 ${stay.bathCount}개` : "화장실 수 확인 필요"}</span>
          <span class="pill">★ ${stay.rating} (${stay.reviews})</span>
        </div>
      </div>
      <div class="button-row">
        <button class="secondary-btn" data-open-chat="${stay.name}"><i data-lucide="messages-square"></i>사장님과 채팅</button>
        <button class="ghost-btn" data-route="review"><i data-lucide="star"></i>리뷰 보기</button>
      </div>
    </section>

    <section class="stay-gallery-section">
      ${renderStayGallery(gallery, stay.name)}
    </section>

    <section class="stay-facility-showcase">
      <div class="section-toolbar"><div><p class="eyebrow">FACILITIES</p><h2>단체 이용 시설</h2><span>강당·바베큐장 등은 일별 수용 인원이 달라 예약 전 확인이 필요합니다.</span></div><button class="secondary-btn" data-open-chat="${stay.name}"><i data-lucide="message-circle"></i>이용 가능 여부 문의</button></div>
      ${amenityChecklist(stay)}
      <p class="facility-onsite-note"><i data-lucide="info"></i>예약 시에는 객실 기본금만 결제하며, 추가 인원과 부대시설 요금은 현장에서 사장님에게 직접 결제합니다.</p>
    </section>

    ${insight ? `<section class="stay-review-insight"><i data-lucide="users-round"></i><div><small>실제 이용팀 리뷰 기준</small><strong>등록 정원은 최대 ${stay.maxPeople}명이지만, 쾌적 인원은 ${insight.min}~${insight.max}명입니다.</strong><span>${insight.count}개 검증 후기에서 계산한 MT 전용 정보입니다.</span></div></section>` : ""}

    <section>
      ${renderStaySearchPanel("이 숙소 예약 조건")}
    </section>

    <section class="public-availability-section">
      <div class="section-toolbar"><div><p class="eyebrow">예약 현황</p><h2>객실 예약 달력</h2><span>날짜를 누르면 이미 예약된 객실을 확인할 수 있어요.</span></div><button class="secondary-btn" type="button" data-toggle-public-calendar><i data-lucide="calendar-days"></i>3개월 달력 보기</button></div>
      <div id="publicStayCalendarWrap" hidden>
        <div id="publicStayCalendar" class="public-stay-calendar"><div class="empty-state">예약 현황을 확인하는 중입니다.</div></div>
        <div id="publicCalendarDayDetail" class="public-calendar-day-detail">확인할 날짜를 선택해주세요.</div>
      </div>
    </section>

    <section>
      <div class="section-toolbar">
        <h2>객실 유형 및 타입</h2>
        <span>객실을 누르면 상세 정보로 이동합니다</span>
      </div>
      <div class="room-list-vertical">
        ${stay.rooms.map((room, index) => roomOptionCard(room, index, stay)).join("")}
      </div>
    </section>

    <div class="detail-sections detail-sections-bottom">
      <section class="info-panel">
        <h2>편의시설</h2>
        <p>상단 단체 이용 시설에서 제공 여부와 세부 조건을 확인해주세요.</p>
      </section>
      <section class="info-panel">
        <h2>추가요금</h2>
        ${dashList(stay.fees)}
      </section>
      <section class="info-panel">
        <h2>환불 및 규칙</h2>
        ${dashList(STANDARD_REFUND_POLICY)}
      </section>
    </div>
  `;
  loadPublicStayCalendar(stay);
  refreshIcons();
}

function stayReviewInsight(stay) {
  const matching = state.reviews.filter((review) => String(review.businessId || "") === String(stay.id) && review.comfortablePeopleMin && review.comfortablePeopleMax);
  if (!matching.length) return null;
  const average = (key) => Math.round(matching.reduce((sum, review) => sum + Number(review[key] || 0), 0) / matching.length);
  return { min: average("comfortablePeopleMin"), max: average("comfortablePeopleMax"), count: matching.length };
}

function renderPublicStayCalendar(stay) {
  const container = qs("#publicStayCalendar");
  if (!container || state.selectedStay?.id !== stay.id) return;
  const blocks = state.publicStayCalendar.blocks || [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  container.innerHTML = Array.from({ length: 3 }, (_, monthOffset) => {
    const first = new Date(monthStart.getFullYear(), monthStart.getMonth() + monthOffset, 1);
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
    const blanks = Array.from({ length: first.getDay() }, () => '<span class="calendar-empty" aria-hidden="true"></span>').join("");
    const days = Array.from({ length: last.getDate() }, (_, dayIndex) => {
      const date = new Date(first.getFullYear(), first.getMonth(), dayIndex + 1);
      const key = localDateKey(date);
      const blockedIds = new Set(blocks.filter((block) => key >= block.start_date && key < block.end_date).map((block) => String(block.offering_id)));
      const soldOut = stay.rooms.length > 0 && blockedIds.size >= stay.rooms.length;
      const past = date < today;
      return `<button type="button" class="calendar-date ${blockedIds.size ? "booked" : "available"} ${soldOut ? "sold-out" : ""}" data-inspect-calendar-date="${key}" ${past ? "disabled" : ""}><span>${date.getDate()}</span>${blockedIds.size ? `<small>${blockedIds.size}실 예약</small>` : ""}</button>`;
    }).join("");
    return `<section class="availability-month"><h3>${first.getFullYear()}년 ${first.getMonth() + 1}월</h3><div class="calendar-weekdays"><span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span></div><div class="calendar-month-grid">${blanks}${days}</div></section>`;
  }).join("");
}

function showPublicCalendarDay(stay, dateKey) {
  const detail = qs("#publicCalendarDayDetail");
  if (!detail) return;
  const blockedIds = new Set((state.publicStayCalendar.blocks || [])
    .filter((block) => dateKey >= block.start_date && dateKey < block.end_date)
    .map((block) => String(block.offering_id)));
  const occupied = (stay.rooms || []).filter((room) => blockedIds.has(String(room.id)));
  detail.innerHTML = `<strong>${escapeHtml(dateKey)} 예약 현황</strong><span>${occupied.length ? `예약된 객실: ${occupied.map((room) => escapeHtml(room.name)).join(", ")}` : "예약된 객실이 없습니다."}</span>`;
}

function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

async function loadPublicStayCalendar(stay) {
  const client = window.motfSupabase;
  if (!client || !stay?.id || String(stay.id).length < 20) {
    state.publicStayCalendar = { businessId: String(stay?.id || ""), blocks: [], loading: false };
    renderPublicStayCalendar(stay);
    return;
  }
  if (state.publicStayCalendar.loading && state.publicStayCalendar.businessId === String(stay.id)) return;
  state.publicStayCalendar = { businessId: String(stay.id), blocks: [], loading: true };
  const start = new Date();
  start.setDate(1);
  const end = new Date(start.getFullYear(), start.getMonth() + 3, 1);
  const { data, error } = await client.rpc("get_public_stay_calendar", {
    target_business_id: stay.id,
    range_start: localDateKey(start),
    range_end: localDateKey(end),
  });
  state.publicStayCalendar = { businessId: String(stay.id), blocks: error ? [] : (data || []), loading: false };
  renderPublicStayCalendar(stay);
}

function renderRoomDetail() {
  ensureStayAvailability();
  const stay = state.selectedStay;
  const room = state.selectedRoom;
  const unavailable = isRoomUnavailable(room);
  const gallery = roomGalleryImages(stay, room);
  state.gallery = { images: gallery, index: 0, alt: `${stay.name} ${room.name}` };
  const maxPeople = roomCapacityMax(room);
  const selectedBasePrice = bookingBaseRoomFee(stay, room);
  qs("#roomDetailContent").innerHTML = `
    <section class="room-detail-hero">
      <div>
        <p class="eyebrow">${stay.name}</p>
        <h1 class="room-detail-title">${room.name}</h1>
        <p>${room.capacity}${room.features.length ? ` · ${room.features.slice(0, 3).join(" · ")}` : ""}</p>
      </div>
      <aside class="room-reserve-card">
        <span>선택 일정 기본 숙박비</span>
        <strong>${money(selectedBasePrice)}</strong>
        <p>최대 ${maxPeople || stay.maxPeople}명까지 선택 가능</p>
        <button class="primary-btn" ${unavailable ? "disabled" : `data-route="booking"`}><i data-lucide="${unavailable ? "ban" : "calendar-check"}"></i>${unavailable ? "선택 날짜 품절" : "예약 정보 입력하기"}</button>
      </aside>
    </section>

    <section class="stay-gallery-section">
      ${renderStayGallery(gallery, room.name)}
    </section>

    <section>
      ${renderStaySearchPanel("이 객실 예약 조건")}
    </section>

    <div class="room-detail-grid">
      <section class="info-panel">
        <h2>객실 세부사항</h2>
        ${dashList([
          `정원 ${room.capacity}`,
          `선택 일정 기본 숙박비 ${money(selectedBasePrice)}`,
          `객실 내 화장실 ${room.bathroomCount || 0}개${room.bathroomGenderSeparated ? " · 남녀 구분" : ""}${room.bathroomNote ? ` · ${room.bathroomNote}` : ""}`,
          room.features.length ? `객실 장점: ${room.features.slice(0, 3).join(" · ")}` : "객실 구성은 예약 전 사장님에게 확인해주세요.",
          "체크인 15:00 이후, 체크아웃 11:00 이전",
        ])}
      </section>
      <section class="info-panel">
        <h2>인원 규정</h2>
        ${dashList([
          room.basePeople ? `기준 인원 ${room.basePeople}명 · 최대 ${room.maxPeople || maxPeople}명` : `최대 ${room.maxPeople || maxPeople || stay.maxPeople}명`,
          room.extraPersonFee ? `기준 인원 초과 시 1인당 ${money(room.extraPersonFee)} · 이용 후 별도 결제` : "추가 인원 요금 없음 또는 별도 문의",
          "미성년자 단체 이용은 대표자 확인이 필요합니다.",
        ])}
      </section>
      <section class="info-panel">
        <h2>포함 편의시설</h2>
        ${amenityChecklist(stay, room)}
      </section>
      <section class="info-panel">
        <h2>추가요금 및 환불</h2>
        ${dashList([...stay.fees.slice(0, 3), ...STANDARD_REFUND_POLICY])}
      </section>
    </div>
  `;
  refreshIcons();
}

function dateInSeasonRanges(dateText, ranges = []) {
  return ranges.some((range) => range?.start_date && range?.end_date && dateText >= range.start_date && dateText <= range.end_date);
}

function roomPriceForDate(stay, room, dateText) {
  const prices = room.seasonalPrices || {};
  const date = new Date(`${dateText}T12:00:00`);
  const weekend = [5, 6].includes(date.getDay());
  const season = dateInSeasonRanges(dateText, stay.peakSeasonRanges) ? "peak"
    : dateInSeasonRanges(dateText, stay.shoulderSeasonRanges) ? "shoulder" : "offseason";
  const key = `${season}${weekend ? "Weekend" : "Weekday"}`;
  return Number(prices[key] ?? room.price) || 0;
}

function bookingBaseRoomFee(stay, room) {
  const start = qs("#stayCheckInDate")?.value;
  const end = qs("#stayCheckOutDate")?.value;
  if (!start || !end || start >= end) return Number(room.price) || 0;
  let cursor = new Date(`${start}T12:00:00`);
  const last = new Date(`${end}T12:00:00`);
  let total = 0;
  while (cursor < last) {
    total += roomPriceForDate(stay, room, formatDateInput(cursor));
    cursor = addDays(cursor, 1);
  }
  return total;
}

function bookingAmount() {
  const stay = state.selectedStay;
  const room = state.selectedRoom;
  const people = Math.max(1, Number(qs("#bookingPeople")?.value || selectedStayPeople()));
  const basePeople = Number(room.basePeople || room.maxPeople || roomCapacityMax(room) || people);
  const extraPeople = Math.max(0, people - basePeople);
  const extraPersonTotal = extraPeople * Number(room.extraPersonFee || 0);
  const roomFee = bookingBaseRoomFee(stay, room);
  return {
    roomFee,
    extraPeople,
    extraPersonTotal,
    total: roomFee,
  };
}

function renderBooking() {
  ensureStayAvailability();
  const stay = state.selectedStay;
  const room = state.selectedRoom;
  const unavailable = isRoomUnavailable(room);
  const values = staySearchValues();
  const bookingPeopleInput = qs("#bookingPeople");
  bookingPeopleInput.max = room.maxPeople || roomCapacityMax(room) || stay.maxPeople;
  bookingPeopleInput.value = Math.min(Number(bookingPeopleInput.max), values.people);
  syncStaySearchPanel(qs("#bookingForm"));
  const update = () => {
    applyStaySearchField("people", qs("#bookingPeople").value);
    const amount = bookingAmount();
    qs("#bookingSummary").innerHTML = `
      <div class="summary-line"><span>${stay.name}</span><strong>${room.name}</strong></div>
      <div class="summary-line"><span>숙박일</span><strong>${stayDateRangeLabel().replace("숙박일 ", "")}</strong></div>
      <div class="summary-line"><span>예약 인원</span><strong>${qs("#bookingPeople").value}명</strong></div>
      <div class="summary-line"><span>기본 숙박비</span><strong>${money(amount.roomFee)}</strong></div>
      ${amount.extraPeople ? `<div class="summary-line"><span>추가 인원 ${amount.extraPeople}명</span><strong>숙소 현장 결제</strong></div>` : ""}
      <div class="summary-line"><span>부대시설 이용금</span><strong>숙소 현장 결제</strong></div>
      ${unavailable ? `<div class="summary-line"><span>예약 가능 여부</span><strong>선택 날짜 품절</strong></div>` : ""}
      <div class="separate-charge-note"><i data-lucide="info"></i><span>모티프에서는 객실 기본금만 결제합니다. 추가 인원과 바베큐 등 부대시설 요금은 이용 당일 숙소에 직접 결제해주세요.</span></div>
      <div class="summary-line total"><span>지금 결제할 금액</span><strong>${money(amount.total)}</strong></div>
    `;
    const submitButton = qs('#bookingForm [type="submit"]');
    if (submitButton) {
      submitButton.disabled = unavailable;
      submitButton.innerHTML = unavailable ? '<i data-lucide="ban"></i>선택 날짜 품절' : '<i data-lucide="credit-card"></i>결제하기';
      refreshIcons();
    }
  };
  update();
  ["#bookingPeople", "#bookingFacility"].forEach((selector) => {
    qs(selector).oninput = update;
    qs(selector).onchange = update;
  });
}

function renderStores() {
  const intro = qs("#marketIntro");
  const productSection = qs("#marketProducts");
  if (!stores.length) {
    state.selectedStore = null;
    state.selectedProduct = null;
    intro.innerHTML = `<div class="empty-state catalog-error"><i data-lucide="store"></i><strong>현재 공개된 제휴 마트가 없습니다.</strong><span>입점 승인과 상품 등록이 완료되면 이곳에 표시됩니다.</span></div>`;
    productSection.innerHTML = "";
    updateCartBadge();
    refreshIcons();
    return;
  }
  const store = stores.find((item) => item.id === state.selectedStore?.id) || stores[0];
  state.selectedStore = store;
  ensureMarketBundleProducts(store);
  const categories = ["전체", "MT 세트", "식재료", "주류/음료", "일회용품", "냉동식품", "기타"];
  if (!categories.includes(state.activeCategory)) state.activeCategory = "전체";
  const products = state.activeCategory === "전체"
    ? store.products
    : store.products.filter((product) => product.category === state.activeCategory);
  const people = Number(qs("#marketPeople")?.value || 32);
  const porkKg = Math.ceil(people * 0.35);
  intro.innerHTML = `
    ${stores.length > 1 ? `<nav class="market-store-tabs" aria-label="제휴 마트 선택">${stores.map((item) => `<button type="button" class="category-tab ${item.id === store.id ? "active" : ""}" data-market-select="${item.id}">${escapeHtml(item.name)}</button>`).join("")}</nav>` : ""}
    <section class="market-intro">
      <img src="${store.image}" alt="${store.name} 매장 사진" />
      <div class="market-intro-body">
        <p class="eyebrow">${store.region} 제휴 마트</p>
        <h2>${store.name}</h2>
        <p>${store.intro}<br />숙소 일정에 맞춰 수령 또는 배송 요청을 남길 수 있습니다.</p>
        <div class="detail-meta">
          ${store.rating > 0 ? `<span class="pill">★ ${store.rating}</span>` : '<span class="pill">신규 제휴</span>'}
          <span class="pill success">${store.type}</span>
          <span class="pill warning">주류 성인 인증</span>
        </div>
        <div class="button-row">
          <button class="secondary-btn" type="button" data-open-order-recommend><i data-lucide="calculator"></i>추천 주문량 보기</button>
          <button class="secondary-btn" data-open-chat="${store.name}"><i data-lucide="messages-square"></i>장보기 문의</button>
          <button class="ghost-btn" data-route="review" data-review-scope="market"><i data-lucide="star"></i>장보기 리뷰</button>
          <button class="ghost-btn" data-route="cart"><i data-lucide="shopping-cart"></i>장바구니 보기</button>
        </div>
      </div>
    </section>
  `;
  productSection.innerHTML = `
    <div class="section-toolbar">
      <div><p class="eyebrow">제휴 마트 등록 상품</p><h2>상품 둘러보기</h2></div>
      <span>${products.length}개 상품</span>
    </div>
    <div class="category-tabs">
      ${categories.map((cat) => `<button class="category-tab ${cat === state.activeCategory ? "active" : ""}" data-category="${cat}">${cat}</button>`).join("")}
    </div>
    <div class="product-grid">
      ${products.length ? products.map(productCard).join("") : `<div class="empty-state catalog-error"><strong>${state.activeCategory === "전체" ? "등록된 상품이 아직 없습니다." : "이 분류에 등록된 상품이 없습니다."}</strong><span>마트 사장님이 상품을 공개하면 바로 주문할 수 있습니다.</span></div>`}
    </div>
  `;
  updateCartBadge();
  refreshIcons();
}

function storeCard(store) {
  const people = Number(qs("#marketPeople").value || 32);
  const porkKg = Math.ceil(people * 0.35);
  return `
    <article class="listing-card">
      <img src="${store.image}" alt="${store.name} 사진" />
      <div class="listing-body">
        <div>
          <div class="listing-meta">
            <span class="pill">${store.region}</span>
            <span class="pill success">${store.type}</span>
            ${store.rating > 0 ? `<span class="pill">★ ${store.rating}</span>` : '<span class="pill">신규 제휴</span>'}
          </div>
          <h3>${store.name}</h3>
          <p>${store.intro}</p>
          <p class="muted">${people}명 기준 고기 추천량 약 ${porkKg}kg</p>
        </div>
        <div class="listing-actions">
          <span class="price">상품 ${store.products.length}개</span>
          <button class="primary-btn" data-store-id="${store.id}"><i data-lucide="shopping-bag"></i>상품 보기</button>
          <button class="ghost-btn" data-open-chat="${store.name}"><i data-lucide="message-circle"></i>문의</button>
        </div>
      </div>
    </article>
  `;
}

function renderStoreDetail() {
  const store = state.selectedStore;
  if (!store) {
    qs("#storeDetailContent").innerHTML = `<div class="empty-state catalog-error"><strong>마트 정보를 찾을 수 없습니다.</strong><button class="primary-btn" type="button" data-route="market">마트 목록으로</button></div>`;
    refreshIcons();
    return;
  }
  ensureMarketBundleProducts(store);
  const categories = ["전체", "MT 세트", "식재료", "주류/음료", "일회용품", "냉동식품", "기타"];
  const products = state.activeCategory === "전체"
    ? store.products
    : store.products.filter((product) => product.category === state.activeCategory);
  qs("#storeDetailContent").innerHTML = `
    <div class="store-header">
      <img src="${store.image}" alt="${store.name} 매장 사진" />
      <div>
        <p class="eyebrow">${store.region} · ${store.type}</p>
        <h1>${store.name}</h1>
        <p>${store.intro}</p>
        <div class="detail-meta">
          ${store.rating > 0 ? `<span class="pill">★ ${store.rating}</span>` : '<span class="pill">신규 제휴</span>'}
          <span class="pill success">장바구니/바로구매</span>
          <span class="pill warning">주류 성인 인증</span>
        </div>
        <div class="button-row">
          <button class="secondary-btn" data-open-chat="${store.name}"><i data-lucide="messages-square"></i>장보기 문의</button>
          <button class="ghost-btn" data-route="cart"><i data-lucide="shopping-cart"></i>장바구니 보기</button>
        </div>
      </div>
    </div>
    <div class="category-tabs">
      ${categories.map((cat) => `<button class="category-tab ${cat === state.activeCategory ? "active" : ""}" data-category="${cat}">${cat}</button>`).join("")}
    </div>
    <div class="product-grid">
      ${products.length ? products.map(productCard).join("") : `<div class="empty-state catalog-error"><strong>등록된 상품이 아직 없습니다.</strong><span>상품이 공개되면 바로 주문할 수 있습니다.</span></div>`}
    </div>
  `;
  refreshIcons();
}

function productCard(product) {
  return `
    <article class="product-card ${product.isBundle ? "bundle-product-card" : ""}">
      <img src="${product.image}" alt="${product.name} 사진" />
      <div>
        <span class="pill ${product.isBundle ? "success" : ""}">${product.isBundle ? "moTF 전용 패키지" : product.category}</span>
        <h3>${product.name}</h3>
        <p>${product.unit} · ${product.origin}</p>
        <p class="price">${money(product.price)}</p>
        <div class="button-row">
          <button class="primary-btn" data-product-id="${product.id}"><i data-lucide="search"></i>상세</button>
          <button class="ghost-btn" data-add-product="${product.id}"><i data-lucide="plus"></i>담기</button>
          <button class="ghost-btn" data-add-mt-shopping="${product.id}"><i data-lucide="folder-plus"></i>내 MT에 담기</button>
        </div>
      </div>
    </article>
  `;
}

function isAlcoholProduct(product) {
  return Boolean(product.isAlcohol || /소주|맥주|와인|막걸리|위스키|주류/.test(product.name));
}

function renderProductDetail() {
  const product = state.selectedProduct;
  if (!product) {
    qs("#productDetailContent").innerHTML = `<div class="empty-state catalog-error"><strong>상품 정보를 찾을 수 없습니다.</strong><button class="primary-btn" type="button" data-route="market">마트로 돌아가기</button></div>`;
    refreshIcons();
    return;
  }
  const alcoholProduct = isAlcoholProduct(product);
  qs("#productDetailContent").innerHTML = `
    <div class="product-detail">
      <img src="${product.image}" alt="${product.name} 사진" />
      <section class="info-panel">
        <p class="eyebrow">${product.isBundle ? "moTF 전용 할인 패키지" : product.category}</p>
        <h1>${product.name}</h1>
        <div class="product-meta">
          <span class="pill">${product.unit}</span>
          <span class="pill success">${product.origin}</span>
          ${product.isBundle ? '<span class="pill">세트 구성 상품</span>' : ""}
          <span class="pill warning">수령 전 변경 가능</span>
          ${alcoholProduct ? '<span class="pill danger">성인 인증 필수</span>' : ""}
        </div>
        <p>${product.detail}</p>
        <p class="price">${money(product.price)}</p>
        <div class="quantity-control">
          <button type="button" data-qty-change="-1">-</button>
          <input id="productQty" value="1" inputmode="numeric" />
          <button type="button" data-qty-change="1">+</button>
        </div>
        <div class="button-row">
          <button class="secondary-btn" data-add-current data-alcohol="${alcoholProduct ? "true" : "false"}"><i data-lucide="shopping-cart"></i>장바구니 담기</button>
          <button class="secondary-btn" data-add-current-to-mt><i data-lucide="folder-plus"></i>내 MT에 담기</button>
          <button class="primary-btn" data-buy-current data-alcohol="${alcoholProduct ? "true" : "false"}"><i data-lucide="credit-card"></i>바로구매</button>
        </div>
      </section>
    </div>
    ${alcoholProduct ? '<aside class="adult-purchase-notice"><i data-lucide="badge-alert"></i><div><strong>주류는 성인 인증 후 주문할 수 있습니다.</strong><p>배송 또는 픽업 시 대표자의 신분증을 확인하며, 성인 확인이 되지 않으면 상품을 전달하지 않습니다.</p></div></aside>' : ""}
    <section class="product-information-section">
      <h2>상품 상세 정보</h2>
      <dl class="product-spec-table">
        <div><dt>상품명</dt><dd>${escapeHtml(product.name)}</dd></div>
        <div><dt>용량·단위</dt><dd>${escapeHtml(product.unit)}</dd></div>
        <div><dt>원산지</dt><dd>${escapeHtml(product.origin)}</dd></div>
        <div><dt>보관 방법</dt><dd>${escapeHtml(product.detailSections?.storage || "상품 표기 및 마트 안내에 따릅니다.")}</dd></div>
        <div><dt>영양 정보</dt><dd>${escapeHtml(Object.entries(product.nutritionInfo || {}).map(([key, value]) => `${key} ${value}`).join(" · ") || "상품 포장지의 영양정보를 확인해주세요.")}</dd></div>
        <div><dt>판매자 안내</dt><dd>${escapeHtml(product.detailSections?.sellerNote || product.detail)}</dd></div>
      </dl>
    </section>
  `;
  refreshIcons();
}

function findProduct(productId) {
  for (const store of stores) {
    const product = store.products.find((item) => item.id === productId);
    if (product) return { product, store };
  }
  return null;
}

function addToCart(productId, qty = 1) {
  const found = findProduct(productId);
  if (!found) return;
  const existing = state.cart.find((item) => item.productId === productId);
  if (existing) {
    existing.qty += qty;
  } else {
    state.cart.push({ productId, storeId: found.store.id, qty });
  }
  updateCartBadge();
  toast(`${found.product.name} ${qty}개를 장바구니에 담았습니다.`);
}

function updateCartBadge() {
  const count = state.cart.reduce((sum, item) => sum + item.qty, 0);
  const badge = qs("#cartBadge");
  if (badge) badge.textContent = count;
}

function cartTotal() {
  return state.cart.reduce((sum, item) => {
    const found = findProduct(item.productId);
    return sum + (found ? found.product.price * item.qty : 0);
  }, 0);
}

function renderCart() {
  updateCartBadge();
  qs("#cartItems").innerHTML = state.cart.length
    ? state.cart
        .map((item) => {
          const found = findProduct(item.productId);
          if (!found) return "";
          return `
            <article class="cart-row">
              <img src="${found.product.image}" alt="${found.product.name} 사진" />
              <div>
                <span class="cart-store-name">${found.store.name}</span>
                <h3>${found.product.name}</h3>
                <p>${found.product.unit} · ${money(found.product.price)}</p>
              </div>
              <div>
                <div class="quantity-control">
                  <button type="button" data-cart-change="${item.productId}" data-delta="-1">-</button>
                  <input value="${item.qty}" data-cart-input="${item.productId}" inputmode="numeric" />
                  <button type="button" data-cart-change="${item.productId}" data-delta="1">+</button>
                </div>
                <p class="price">${money(found.product.price * item.qty)}</p>
              </div>
            </article>
          `;
        })
        .join("")
    : `<div class="empty-state">장바구니가 비어 있습니다. 장보기에서 상품을 담아보세요.</div>`;
  const total = cartTotal();
  qs("#cartSummary").innerHTML = `
    <div class="summary-line"><span>상품 금액</span><strong>${money(total)}</strong></div>
    <div class="summary-line total"><span>총 결제 금액</span><strong>${money(total)}</strong></div>
  `;
  refreshIcons();
}

function paymentBackRoute() {
  if (!state.pendingPayment) return "stays";
  return state.pendingPayment.type === "stay" ? "booking" : state.pendingPayment.type === "extra_charge" ? "myUsage" : "cart";
}

function paymentHomeRoute() {
  if (!state.paymentResult) return "stays";
  return state.paymentResult.type === "stay" ? "stays" : state.paymentResult.type === "extra_charge" ? "myUsage" : "market";
}

function getBaseUrl() {
  return `${window.location.origin}${window.location.pathname}`;
}

function addDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeStaySearchDates() {
  const checkInInput = qs("#stayCheckInDate");
  const checkOutInput = qs("#stayCheckOutDate");
  if (!checkInInput || !checkOutInput) return;
  const today = new Date();
  if (!checkInInput.value || checkInInput.value === "2026-06-12") {
    checkInInput.value = formatDateInput(today);
  }
  if (!checkOutInput.value || checkOutInput.value === "2026-06-12") {
    checkOutInput.value = formatDateInput(addDays(today, 1));
  }
  if (checkOutInput.value <= checkInInput.value) {
    checkOutInput.value = formatDateInput(addDays(new Date(`${checkInInput.value}T00:00:00`), 1));
  }
  checkOutInput.min = checkInInput.value;
}

function initializeStaySearchDefaults() {
  normalizeStaySearchDates();
  const regionInput = qs("#stayRegion");
  const peopleInput = qs("#stayPeople");
  if (regionInput && !regionInput.dataset.initialized) {
    regionInput.value = DEFAULT_STAY_REGION;
    regionInput.dataset.initialized = "true";
  }
  if (peopleInput && !peopleInput.dataset.initialized) {
    peopleInput.value = DEFAULT_STAY_PEOPLE;
    peopleInput.dataset.initialized = "true";
  }
}

function staySearchValues() {
  normalizeStaySearchDates();
  return {
    checkIn: qs("#stayCheckInDate")?.value || "",
    checkOut: qs("#stayCheckOutDate")?.value || "",
    region: qs("#stayRegion")?.value || DEFAULT_STAY_REGION,
    people: Number(qs("#stayPeople")?.value || DEFAULT_STAY_PEOPLE),
  };
}

function stayAvailabilityKey(values = staySearchValues()) {
  return `${values.checkIn}|${values.checkOut}`;
}

function isRoomUnavailable(room) {
  return state.stayAvailability.unavailableOfferingIds.has(String(room?.id || ""));
}

function availableRoomsForStay(stay) {
  return (stay.rooms || []).filter((room) => !isRoomUnavailable(room));
}

function stayHasAvailableRoom(stay) {
  return availableRoomsForStay(stay).length > 0;
}

function stayDisplayPrice(stay) {
  return estimateMtStayCost(stay, selectedStayPeople()).total;
}

function rerenderStayAvailabilityViews() {
  const route = currentRoute();
  if (route === "stays") renderStays();
  if (route === "stayDetail") renderStayDetail();
  if (route === "roomDetail") renderRoomDetail();
  if (route === "booking") renderBooking();
}

async function refreshStayAvailability() {
  const client = window.motfSupabase;
  if (!client) return;
  const values = staySearchValues();
  if (!values.checkIn || !values.checkOut || values.checkIn >= values.checkOut) return;
  const key = stayAvailabilityKey(values);
  if (state.stayAvailability.key === key || state.stayAvailability.loadingKey === key) return;

  state.stayAvailability.loadingKey = key;
  const { data, error } = await client.rpc("list_unavailable_stay_offerings", {
    target_check_in: values.checkIn,
    target_check_out: values.checkOut,
  });
  if (state.stayAvailability.loadingKey !== key) return;
  state.stayAvailability.loadingKey = "";

  if (error) {
    console.warn("Could not load stay availability.", error);
    return;
  }

  state.stayAvailability.key = key;
  state.stayAvailability.unavailableOfferingIds = new Set((data || []).map((item) => String(item.offering_id)));
  rerenderStayAvailabilityViews();
}

function ensureStayAvailability() {
  refreshStayAvailability();
}

function stayDateRangeLabel() {
  const values = staySearchValues();
  return `숙박일 ${values.checkIn} ~ ${values.checkOut}`;
}

function syncStaySearchPanel(container = document) {
  const values = staySearchValues();
  container.querySelectorAll("[data-stay-search-field]").forEach((input) => {
    const field = input.dataset.staySearchField;
    if (field === "checkIn") setDateInputValue(input, values.checkIn);
    if (field === "checkOut") setDateInputValue(input, values.checkOut);
    if (field === "region") input.value = values.region;
    if (field === "people") input.value = values.people;
  });
}

function selectedStayPeople() {
  return Math.max(1, Number(qs("#stayPeople")?.value || DEFAULT_STAY_PEOPLE));
}

function parseCapacityMax(room) {
  const values = String(room?.capacity || "").match(/\d+/g)?.map(Number) || [];
  return values.length ? Math.max(...values) : 0;
}

function normalizedExtraFees(stay) {
  if (Array.isArray(stay.extraFees)) return stay.extraFees;
  return (stay.fees || []).map((textValue) => {
    const text = String(textValue || "");
    const amount = Number(text.match(/([\d,]+)원/)?.[1]?.replaceAll(",", "") || 0);
    const category = /보증금/.test(text) ? "deposit" : /현장|문의/.test(text) ? "onsite" : /바베큐|숯|그릴|강당|침구|픽업|수영장/.test(text) ? "optional" : "confirmed";
    return { label: text.split(/\d/)[0].trim() || "추가요금", amount, category };
  });
}

function estimateMtStayCost(stay, people = selectedStayPeople()) {
  if (stay?._estimatedCost && Object.keys(stay._estimatedCost).length) {
    const source = stay._estimatedCost;
    const confirmed = Number(source.confirmed ?? source.fixed ?? source.room_total ?? 0);
    const optional = Number(source.optional ?? 0);
    const onSite = Number(source.on_site ?? source.onsite ?? 0);
    const deposit = Number(source.deposit ?? 0);
    const total = Number(source.total ?? confirmed + optional + onSite);
    return { people, room: null, rooms: [], confirmed, optional, onSite, deposit, total, extraPeople: Number(source.extra_people || 0), extraPersonTotal: Number(source.extra_person_total || 0), perPerson: Number(source.per_person ?? Math.ceil(total / people / 100) * 100) };
  }
  const rooms = availableRoomsForStay(stay);
  let selectedRooms = [];
  if (rooms.length && rooms.length <= 15) {
    let best = null;
    for (let mask = 1; mask < (1 << rooms.length); mask += 1) {
      const choice = rooms.filter((_, index) => mask & (1 << index));
      const capacity = choice.reduce((sum, room) => sum + parseCapacityMax(room), 0);
      const price = choice.reduce((sum, room) => sum + Number(room.price || 0), 0);
      if (capacity >= people && (!best || price < best.price || (price === best.price && choice.length < best.rooms.length))) best = { rooms: choice, price };
    }
    selectedRooms = best?.rooms || [...rooms].sort((a, b) => parseCapacityMax(b) - parseCapacityMax(a));
  } else {
    selectedRooms = [...rooms].sort((a, b) => (Number(a.price || 0) / Math.max(1, parseCapacityMax(a))) - (Number(b.price || 0) / Math.max(1, parseCapacityMax(b))));
    let capacity = 0;
    selectedRooms = selectedRooms.filter((room) => {
      if (capacity >= people) return false;
      capacity += parseCapacityMax(room);
      return true;
    });
  }
  const roomTotal = selectedRooms.reduce((sum, room) => sum + Number(room.price || 0), 0) || Number(stay.price || 0);
  const baseCapacity = selectedRooms.reduce((sum, room) => sum + Number(room.basePeople || room.maxPeople || parseCapacityMax(room) || 0), 0);
  const extraPeople = Math.max(0, people - baseCapacity);
  const extraPersonSlots = selectedRooms.flatMap((room) => {
    const base = Number(room.basePeople || room.maxPeople || parseCapacityMax(room) || 0);
    const max = Number(room.maxPeople || parseCapacityMax(room) || base);
    return Array.from({ length: Math.max(0, max - base) }, () => Number(room.extraPersonFee || 0));
  }).sort((a, b) => a - b);
  const extraPersonTotal = extraPersonSlots.slice(0, extraPeople).reduce((sum, amount) => sum + amount, 0);
  const fees = normalizedExtraFees(stay);
  const fixedFees = fees.filter((fee) => fee.category === "confirmed").reduce((sum, fee) => sum + Number(fee.amount || 0), 0);
  const optional = fees.filter((fee) => fee.category === "optional").reduce((sum, fee) => sum + Number(fee.amount || 0), 0);
  const onSite = fees.filter((fee) => fee.category === "onsite").reduce((sum, fee) => sum + Number(fee.amount || 0), 0);
  const deposit = fees.filter((fee) => fee.category === "deposit").reduce((sum, fee) => sum + Number(fee.amount || 0), 0);
  const confirmed = roomTotal + extraPersonTotal + fixedFees;
  const total = confirmed + optional + onSite;
  return { people, room: selectedRooms[0] || null, rooms: selectedRooms, roomTotal, fixedFees, confirmed, optional, onSite, deposit, extraPeople, extraPersonTotal, total, perPerson: Math.ceil(total / people / 100) * 100 };
}

window.motfGetMtCandidateEstimate = function getMtCandidateEstimate(businessId) {
  const stay = stays.find((item) => String(item.id) === String(businessId));
  if (!stay) return {};
  const estimate = estimateMtStayCost(stay, mtProjectPeople());
  return {
    total: estimate.total,
    per_person: estimate.perPerson,
    confirmed: estimate.confirmed,
    room_total: estimate.roomTotal || estimate.confirmed,
    optional: estimate.optional,
    on_site: estimate.onSite,
    deposit: estimate.deposit,
    extra_people: estimate.extraPeople,
    extra_person_total: estimate.extraPersonTotal,
    room_names: (estimate.rooms || []).map((room) => room.name),
  };
};

function mtCandidateStays() {
  return state.mtCandidates.map((id) => state.mtCandidateRecords.find((stay) => String(stay.id) === String(id)) || stays.find((stay) => String(stay.id) === String(id))).filter(Boolean);
}

function mtRoomRangeTotal(stay, room, project) {
  const start = new Date(`${String(project.starts_on).slice(0, 10)}T12:00:00`);
  const end = new Date(`${String(project.ends_on).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return Number(room.price || 0);
  let total = 0;
  for (const cursor = new Date(start); cursor < end; cursor.setDate(cursor.getDate() + 1)) {
    total += roomPriceForDate(stay, room, localDateKey(cursor));
  }
  return total;
}

function renderMtCandidateProjectChoices(projects) {
  const choices = qs("#mtCandidateProjectChoices");
  choices.innerHTML = `
    <p class="mt-room-picker-note">MT 일정을 먼저 고르면, 그 기간에 예약 가능한 객실만 보여드려요.</p>
    ${projects.map((project) => `<button type="button" data-select-candidate-project="${project.id}"><span><strong>${escapeHtml(project.title || "우리 MT")}</strong><small>${formatMtDate(project.starts_on)}~${formatMtDate(project.ends_on)} · ${Number(project.guest_count || 0)}명</small></span><i data-lucide="chevron-right"></i></button>`).join("")}`;
  refreshIcons();
}

async function renderMtCandidateRoomChoices(projectId, businessId) {
  const choices = qs("#mtCandidateProjectChoices");
  const stay = stays.find((item) => String(item.id) === String(businessId));
  if (!stay) throw new Error("숙소 객실 정보를 찾을 수 없습니다.");
  choices.innerHTML = `<div class="mt-room-picker-loading">객실 공실을 확인하고 있어요.</div>`;
  const fallbackProject = mtProjectList().find((project) => String(project.id) === String(projectId));
  const availability = window.motfGetCandidateRoomAvailability
    ? await window.motfGetCandidateRoomAvailability(projectId, businessId)
    : { project: fallbackProject, unavailableOfferingIds: [] };
  const project = availability.project || fallbackProject;
  if (!project) throw new Error("선택한 내 MT를 찾을 수 없습니다.");
  const unavailable = new Set(availability.unavailableOfferingIds || []);
  choices.innerHTML = `
    <button class="mt-room-picker-back" type="button" data-back-candidate-projects><i data-lucide="arrow-left"></i>MT 다시 선택</button>
    <div class="mt-room-picker-head"><strong>${escapeHtml(stay.name)}</strong><span>${formatMtDate(project.starts_on)}~${formatMtDate(project.ends_on)}에 가능한 객실</span></div>
    <div class="mt-room-choice-list">
      ${stay.rooms.map((room) => {
        const soldOut = unavailable.has(String(room.id));
        const total = mtRoomRangeTotal(stay, room, project);
        return `<button type="button" class="mt-room-choice ${soldOut ? "sold-out" : ""}" data-save-candidate-project="${project.id}" data-save-candidate-business="${stay.id}" data-save-candidate-room="${room.id}" ${soldOut ? "disabled" : ""}>
          <img src="${room.image || stay.image}" alt="" />
          <span><strong>${escapeHtml(room.name)}</strong><small>${escapeHtml(room.capacity || `최대 ${room.maxPeople || "-"}명`)} · ${money(total)}</small></span>
          <b>${soldOut ? "예약 마감" : "선택"}</b>
        </button>`;
      }).join("")}
    </div>`;
  refreshIcons();
}

function mtProjectPeople() {
  return Math.max(1, Number(state.mtProject?.guest_count || selectedStayPeople()));
}

function formatMtDate(value, includeYear = false) {
  if (!value) return "미정";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return new Intl.DateTimeFormat("ko-KR", { ...(includeYear ? { year: "numeric" } : {}), month: "long", day: "numeric" }).format(date);
}

function mtProjectSpend(project = state.mtProject) {
  return (project.items || [])
    .filter((item) => !["cancelled"].includes(item.status))
    .reduce((sum, item) => sum + Number(item.amount || 0) * Number(item.quantity || 1), 0);
}

function mtProjectList() {
  if (state.mtProjects.length) return state.mtProjects.map((project) => String(project.id) === String(state.mtProject?.id) ? { ...project, ...state.mtProject } : project);
  const isLocalPreview = ["localhost", "127.0.0.1", ""].includes(location.hostname);
  return isLocalPreview && (state.mtProject?.id || state.mtProject?.title) ? [state.mtProject] : [];
}

function renderMtDirectory() {
  const cards = qs("#mtProjectCards");
  const projects = mtProjectList().filter((project) => {
    if (state.mtDirectoryFilter === "completed") return project.status === "completed";
    if (state.mtDirectoryFilter === "invited") return project.status !== "completed" && project.is_owner === false;
    return project.status !== "completed" && project.is_owner !== false;
  });
  if (!cards) return;
  cards.innerHTML = projects.length ? projects.map((project) => {
    const budget = Number(project.estimated_budget || 0);
    const spent = mtProjectSpend(project);
    const remaining = budget - spent;
    const progress = budget > 0 ? Math.min(100, Math.round(spent / budget * 100)) : 0;
    return `<button class="mt-project-card ${project.status === "completed" ? "completed" : ""}" type="button" data-open-mt-project="${project.id || "demo"}">
      <span class="mt-project-card-icon"><i data-lucide="folder-kanban"></i></span>
      <span class="mt-project-card-copy"><small>${project.status === "completed" ? "완료된 MT" : project.is_owner === false ? "초대받은 MT · 보기 전용" : escapeHtml(project.organization_name || "단체 여행")}</small><strong>${escapeHtml(project.title || "이름 없는 MT")}</strong><span>${formatMtDate(project.starts_on)}~${formatMtDate(project.ends_on)} · ${Number(project.guest_count || 0)}명 · ${escapeHtml(project.region || "지역 미정")}</span></span>
      <span class="mt-project-card-budget"><small>예산 사용</small><strong>${money(spent)}</strong><span>${budget ? `${progress}% · ${remaining >= 0 ? `${money(remaining)} 남음` : `${money(Math.abs(remaining))} 초과`}` : "총예산 미설정"}</span></span>
      <i data-lucide="chevron-right"></i>
    </button>`;
  }).join("") : `<div class="mt-directory-empty"><i data-lucide="folder-plus"></i><h2>${state.mtDirectoryFilter === "invited" ? "초대받은 MT가 없습니다" : state.mtDirectoryFilter === "completed" ? "종료된 MT가 없습니다" : "아직 만든 MT가 없습니다"}</h2><p>${state.mtDirectoryFilter === "mine" ? "새 MT를 만들고 숙소와 장보기 후보를 모아보세요." : "해당하는 여행이 생기면 이곳에 구분해 보여드려요."}</p>${state.mtDirectoryFilter === "mine" ? '<button class="primary-btn" type="button" data-create-mt-project><i data-lucide="plus"></i>첫 MT 만들기</button>' : ""}</div>`;
}

function renderMtProjectSummary() {
  const project = state.mtProject;
  const readOnly = project.is_owner === false;
  const people = mtProjectPeople();
  const title = qs("#mtProjectTitle");
  if (title) title.textContent = project.title || "우리 MT";
  const completeButton = qs("[data-complete-mt-project]");
  if (completeButton) completeButton.hidden = project.status === "completed" || readOnly;
  qsa("[data-edit-mt-project], [data-invite-mt-companion], [data-add-mt-itinerary], [data-add-mt-notice]").forEach((button) => { button.hidden = readOnly; });
  const readOnlyBadge = qs("#mtReadonlyBadge");
  if (readOnlyBadge) readOnlyBadge.hidden = !readOnly;
  const meta = qs("#myMt .mt-project-meta");
  if (meta) meta.innerHTML = `<span><i data-lucide="calendar-days"></i>${formatMtDate(project.starts_on)}~${formatMtDate(project.ends_on)}</span><span><i data-lucide="users"></i>${people}명</span><span><i data-lucide="map-pin"></i>${escapeHtml(project.region || "지역 미정")}</span>`;
  const budget = Number(project.estimated_budget || 0);
  const spent = mtProjectSpend(project);
  const remaining = budget - spent;
  const percent = budget > 0 ? Math.round(spent / budget * 100) : 0;
  qs("#mtBudgetTotal").textContent = budget ? money(budget) : "미설정";
  qs("#mtBudgetSpent").textContent = money(spent);
  qs("#mtBudgetRemaining").textContent = budget ? (remaining >= 0 ? money(remaining) : `-${money(Math.abs(remaining))}`) : "-";
  qs("#mtBudgetRemaining").classList.toggle("over", remaining < 0);
  qs("#mtBudgetBar").style.width = `${Math.min(100, Math.max(0, percent))}%`;
  qs("#mtBudgetBar").classList.toggle("over", remaining < 0);
  qs("#mtBudgetCaption").textContent = budget ? `${people}명 기준 1인당 ${money(Math.ceil(budget / people / 100) * 100)} · 현재 ${percent}% 사용 예정` : "총예산을 입력하면 남은 금액을 자동으로 계산해드려요.";
  const timeline = qs("#mtTimeline");
  if (timeline) timeline.innerHTML = (project.itinerary || []).length ? project.itinerary.map((item) => { const when = new Date(item.starts_at); return `<li><time>${when.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })}</time><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.place || item.note || "")}</small></span></li>`; }).join("") : `<li><span><strong>아직 등록된 일정이 없습니다.</strong><small>집합부터 귀가까지 한곳에 정리하세요.</small></span></li>`;
  const notice = qs("#mtNoticeList");
  if (notice) notice.innerHTML = (project.notices || []).length ? project.notices.map((item) => `<article class="mt-notice ${item.is_pinned ? "pinned" : ""}">${item.is_pinned ? '<i data-lucide="pin"></i>' : ""}<div><small>${escapeHtml(item.notice_date || String(item.created_at || "").slice(0, 10))}</small><strong>${escapeHtml(item.title || "공지")}</strong><p>${escapeHtml(item.body)}</p></div></article>`).join("") : `<p class="mt-notice muted">아직 공지가 없습니다.</p>`;
}

function renderMyMt() {
  const directory = qs("#mtProjectDirectory");
  const workspace = qs("#mtProjectWorkspace");
  const isDetail = state.mtProjectMode === "detail";
  directory.hidden = isDetail;
  workspace.hidden = !isDetail;
  workspace.classList.toggle("readonly", isDetail && state.mtProject.is_owner === false);
  if (!isDetail) {
    qsa("[data-mt-directory-filter]").forEach((button) => button.classList.toggle("active", button.dataset.mtDirectoryFilter === state.mtDirectoryFilter));
    renderMtDirectory();
    refreshIcons();
    return;
  }
  renderMtProjectSummary();
  const candidates = mtCandidateStays();
  const people = mtProjectPeople();
  const comparison = qs("#mtCandidateComparison");
  if (comparison) {
    comparison.innerHTML = candidates.length ? `
      <div class="mt-compare-grid" style="--candidate-count:${candidates.length}">
        ${candidates.map((stay, index) => {
          const cost = estimateMtStayCost(stay, people);
          const planned = (state.mtProject.items || []).some((item) => item.item_kind === "stay" && String(item.reference_id) === String(stay.id) && item.status !== "cancelled");
          const facilityFees = Number(cost.fixedFees || 0) + Number(cost.optional || 0);
          const extraFeeLabel = cost.extraPeople
            ? `${cost.extraPeople}명 · ${money(cost.extraPersonTotal)}`
            : (stay.rooms || []).some((room) => Number(room.extraPersonFee || 0))
              ? `인당 ${money(Math.min(...stay.rooms.filter((room) => Number(room.extraPersonFee || 0)).map((room) => Number(room.extraPersonFee))))}부터`
              : "없음";
          return `<article class="mt-candidate-card ${planned ? "selected" : ""}"><div class="mt-candidate-rank">객실 후보 ${String.fromCharCode(65 + index)}</div><img src="${stay.image}" alt="${escapeHtml(stay.name)}"><h3>${escapeHtml(stay.name)}</h3><dl><div><dt>예상 총액</dt><dd>${money(cost.total)}</dd></div><div><dt>객실 기본금액</dt><dd>${money(cost.roomTotal || cost.confirmed)}</dd></div><div><dt>추가 요금(부대시설)</dt><dd>${facilityFees ? money(facilityFees) : "현장 이용 시 별도"}</dd></div><div><dt>추가 인원</dt><dd>${extraFeeLabel}</dd></div><div><dt>객실 화장실</dt><dd>${stay.bathCount ? `${stay.bathCount}개` : "확인 필요"}</dd></div><div><dt>위치</dt><dd>${escapeHtml(stay.distance)}</dd></div></dl><div class="button-row"><button class="ghost-btn" data-stay-id="${stay.businessId}">숙소 상세</button><button class="secondary-btn ${planned ? "active" : ""}" data-use-mt-stay="${stay.id}"><i data-lucide="${planned ? "x" : "wallet-cards"}"></i>${planned ? "예산 반영 취소" : "예산에 반영"}</button><button class="icon-action" data-remove-mt-candidate="${stay.id}" aria-label="후보 삭제"><i data-lucide="x"></i></button></div></article>`;
        }).join("")}
      </div>
      <p class="mt-comparison-note"><i data-lucide="info"></i>객실 후보는 최대 3개까지 비교할 수 있고, 예산에는 한 객실만 반영됩니다.</p>` : `<div class="empty-state">아직 담은 객실 후보가 없습니다. 숙소 목록에서 일정에 맞는 객실을 담아보세요.</div>`;
  }
  const shopping = (state.mtProject.items || []).filter((item) => item.item_kind === "shopping" && item.status !== "cancelled");
  const shoppingList = qs("#mtShoppingItems");
  if (shoppingList) shoppingList.innerHTML = shopping.length ? shopping.map((item) => `<article><span class="mt-shopping-icon"><i data-lucide="shopping-basket"></i></span><div><strong>${escapeHtml(item.title)}</strong><span>${Number(item.quantity || 1)}개 · ${money(Number(item.amount || 0) * Number(item.quantity || 1))}</span></div><button class="icon-action" type="button" data-remove-mt-item="${item.id}" aria-label="장보기 후보 삭제"><i data-lucide="x"></i></button></article>`).join("") : `<div class="empty-state compact">장보기에서 필요한 상품을 ` + "`내 MT에 담기`" + `로 추가해보세요.</div>`;
  refreshIcons();
}

window.motfApplyMtProject = function applyMtProject(project, candidates = []) {
  if (!project) return;
  state.mtProject = { ...state.mtProject, ...project };
  if (Array.isArray(project.itinerary)) state.mtProject.itinerary = project.itinerary;
  if (Array.isArray(project.notices)) state.mtProject.notices = project.notices;
  if (Array.isArray(candidates)) {
    const mapped = candidates.map((candidate) => {
      const catalogStay = stays.find((stay) => String(stay.id) === String(candidate.business_id));
      const catalogRoom = catalogStay?.rooms?.find((room) => String(room.id) === String(candidate.offering_id));
      const room = catalogRoom || {
        id: candidate.offering_id,
        name: candidate.offering?.name || "객실",
        price: Number(candidate.offering?.price || 0),
        basePeople: Number(candidate.offering?.base_people ?? candidate.offering?.min_people ?? 0),
        maxPeople: Number(candidate.offering?.max_people || 0),
        extraPersonFee: Number(candidate.offering?.extra_person_fee || 0),
        bathroomCount: Number(candidate.offering?.bathroom_count || 0),
        image: candidate.offering?.image_url || candidate.offering?.image_urls?.[0],
      };
      const businessName = candidate.business?.business_name || catalogStay?.name || "숙소";
      return {
        ...(catalogStay || {}),
        id: candidate.offering_id || candidate.id,
        businessId: candidate.business_id,
        offeringId: candidate.offering_id,
        _candidateId: candidate.id,
        _estimatedCost: candidate.estimated_cost || {},
        selectedRoom: room,
        name: `${businessName} · ${room.name}`,
        businessName,
        image: room.image || candidate.business?.cover_image_url || catalogStay?.image || photo("photo-1564013799919-ab600027ffc6"),
        distance: candidate.business?.address || catalogStay?.distance || "위치 확인 필요",
        bathCount: Number(room.bathroomCount ?? candidate.offering?.bathroom_count ?? 0),
        stationDistanceM: candidate.business?.station_distance_m ?? catalogStay?.stationDistanceM,
        detailTags: catalogStay?.detailTags || [],
        rooms: [room],
        images: room.images || [],
        amenities: catalogStay?.amenities || [],
        fees: catalogStay?.fees || [],
        extraFees: catalogStay?.extraFees || [],
        maxPeople: Number(room.maxPeople || mtProjectPeople()),
      };
    }).filter((candidate) => candidate.offeringId);
    state.mtCandidateRecords = mapped;
    state.mtCandidates = mapped.map((item) => String(item.id));
  }
  if (currentRoute() === "myMt") renderMyMt();
};

window.motfApplyMtProjects = function applyMtProjects(projects = []) {
  state.mtProjects = Array.isArray(projects) ? projects : [];
  if (currentRoute() === "myMt" && state.mtProjectMode === "list") renderMyMt();
};

function setDateInputValue(input, value) {
  if (!input) return;
  if (input._flatpickr) {
    input._flatpickr.setDate(value, false);
    return;
  }
  input.value = value;
}

function applyStaySearchField(field, value) {
  if (field === "checkIn") setDateInputValue(qs("#stayCheckInDate"), value);
  if (field === "checkOut") setDateInputValue(qs("#stayCheckOutDate"), value);
  if (field === "region") qs("#stayRegion").value = value;
  if (field === "people") qs("#stayPeople").value = Math.max(DEFAULT_STAY_PEOPLE, Number(value || DEFAULT_STAY_PEOPLE));
  normalizeStaySearchDates();
  if (field === "checkIn" || field === "checkOut") {
    state.stayAvailability.key = "";
    state.stayAvailability.loadingKey = "";
    state.stayAvailability.unavailableOfferingIds = new Set();
    ensureStayAvailability();
  }
}

function renderStaySearchPanel(title = "예약 조건") {
  const values = staySearchValues();
  return `
    <form class="filter-panel stay-context-filter" data-stay-context-search>
      <label>체크인<input type="date" data-stay-search-field="checkIn" value="${values.checkIn}" /></label>
      <label>체크아웃<input type="date" data-stay-search-field="checkOut" value="${values.checkOut}" /></label>
      <label>지역
        <select data-stay-search-field="region">
          ${[DEFAULT_STAY_REGION].map((region) => `<option value="${region}" ${region === values.region ? "selected" : ""}>${region}</option>`).join("")}
        </select>
      </label>
      <label>인원<input type="number" min="10" max="120" data-stay-search-field="people" value="${values.people}" /></label>
      <div class="stay-context-note">
        <strong>${title}</strong>
        <span>${values.checkIn} ~ ${values.checkOut} · ${values.people}명</span>
      </div>
    </form>
  `;
}

function getStoredPendingPayment() {
  try {
    const rawPayment = window.localStorage.getItem(PENDING_PAYMENT_STORAGE_KEY);
    return rawPayment ? JSON.parse(rawPayment) : null;
  } catch {
    return null;
  }
}

function savePendingPayment(payment) {
  window.localStorage.setItem(PENDING_PAYMENT_STORAGE_KEY, JSON.stringify(payment));
}

function clearPendingPayment() {
  window.localStorage.removeItem(PENDING_PAYMENT_STORAGE_KEY);
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 20);
}

function bankLabel(value = "") {
  const code = String(value || "").trim();
  const upper = code.toUpperCase();
  const labels = {
    WOORI: "우리은행",
    IBK: "IBK기업은행",
    KB: "KB국민은행",
    KOOKMIN: "KB국민은행",
    SHINHAN: "신한은행",
    HANA: "하나은행",
    NH: "NH농협은행",
    NONGHYUP: "NH농협은행",
    KAKAOBANK: "카카오뱅크",
    K_BANK: "케이뱅크",
    TOSS_BANK: "토스뱅크",
    SC: "SC제일은행",
    CITI: "씨티은행",
    DAEGU: "대구은행",
    BUSAN: "부산은행",
    GWANGJU: "광주은행",
    JEONBUK: "전북은행",
    KYONGNAM: "경남은행",
    SAEMAUL: "새마을금고",
    SHINHYUP: "신협",
    SUHYUP: "수협은행",
    POST: "우체국",
  };
  return labels[upper] || code.replace(/_/g, " ");
}

function readableAccount(account = {}) {
  const bank = bankLabel(account.bankName || account.bank || account.bankCode);
  const number = String(account.accountNumber || account.account_number || "").replace(/\s+/g, "");
  const holder = account.holderName || account.accountHolder || account.customerName || "";
  return [bank, number].filter(Boolean).join(" ") + (holder ? ` (예금주 ${holder})` : "");
}

function displayOrderNumber(orderId = "", type = "stay") {
  const shortId = String(orderId || "").replace(/^MOTF-(STAY|MARKET)-/, "").replace(/^M[SEM]-/, "").slice(-8).toUpperCase();
  return `${type === "stay" ? "예약" : type === "extra_charge" ? "추가금" : "주문"}-${shortId || "확인중"}`;
}

function setTossWidgetStatus(message, isError = false) {
  const status = qs("#tossWidgetStatus");
  if (!status) return;
  status.textContent = message;
  status.style.color = isError ? "#b74332" : "#6d7368";
}

function loadTossPaymentsSdk() {
  if (window.TossPayments) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existingScript = document.querySelector('script[src="https://js.tosspayments.com/v2/standard"]');
    if (existingScript) {
      existingScript.addEventListener("load", resolve, { once: true });
      existingScript.addEventListener("error", reject, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://js.tosspayments.com/v2/standard";
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function loadPaymentConfig() {
  const controller = new AbortController();
  window.setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch("/api/payment-config", { cache: "no-store", signal: controller.signal });
    if (!response.headers.get("content-type")?.includes("application/json")) return;
    const data = await response.json();
    if (response.ok && data.tossClientKey) TOSS_CLIENT_KEY = data.tossClientKey;
    if (response.ok && Array.isArray(data.enabledMethods)) TOSS_ENABLED_METHODS = data.enabledMethods;
    if (response.ok && data.naverMapKeyId) NAVER_MAP_KEY_ID = data.naverMapKeyId;
  } catch (error) {
    console.warn("토스 결제 공개 설정을 불러오지 못했습니다.", error);
  }
}

function renderPayment() {
  const payment = state.pendingPayment;
  if (!payment) {
    qs("#paymentSummary").innerHTML = `<div class="empty-state">결제할 내역이 없습니다.</div>`;
    return;
  }
  routeParents.payment = payment.type === "stay" ? "stays" : payment.type === "extra_charge" ? "myUsage" : "market";
  qs("#paymentSummary").innerHTML = `
    <div class="summary-line"><span>결제 대상</span><strong>${payment.title}</strong></div>
    <div class="summary-line"><span>상품명</span><strong>${payment.itemName}</strong></div>
    ${payment.lines.map(([label, value]) => `<div class="summary-line"><span>${label}</span><strong>${typeof value === "number" ? money(value) : value}</strong></div>`).join("")}
    <div class="summary-line"><span>주문번호</span><strong>${payment.orderId}</strong></div>
    <div class="summary-line total"><span>총 결제 금액</span><strong>${money(payment.amount)}</strong></div>
  `;
  renderTossWidgets(payment);
  refreshIcons();
}

function setPaymentResult(status) {
  const payment = state.pendingPayment;
  if (!payment) {
    toast("결제할 내역이 없습니다.");
    return;
  }

  const resultText = {
    success: {
      eyebrow: "결제 완료",
      title: payment.type === "stay" ? "숙소 예약 요청이 접수되었습니다" : "MT 장보기 주문이 접수되었습니다",
      text: payment.type === "stay"
        ? "사장님이 예약 가능 여부를 확인한 뒤 확정합니다. 취소되면 전액 환불이 자동으로 접수됩니다."
        : "사장님이 주문 가능 여부를 확인한 뒤 확정합니다. 취소되면 전액 환불이 자동으로 접수됩니다.",
      icon: "check",
      className: "",
    },
    fail: {
      eyebrow: "결제 실패",
      title: "결제가 완료되지 않았습니다",
      text: "카드 한도, 인증 실패, 네트워크 문제처럼 결제가 실패한 상황을 보여주는 화면입니다.",
      icon: "x",
      className: "fail",
    },
    cancel: {
      eyebrow: "결제 취소",
      title: "결제를 취소했습니다",
      text: "결제창이 닫혔습니다. 필요할 때 다시 결제를 진행해주세요.",
      icon: "rotate-ccw",
      className: "cancel",
    },
  }[status];

  state.paymentResult = {
    ...resultText,
    status,
    type: payment.type,
    orderId: payment.orderId,
    itemName: payment.itemName,
    amount: payment.amount,
    backRoute: paymentBackRoute(),
  };
  routeParents.paymentResult = payment.type === "stay" ? "stays" : payment.type === "extra_charge" ? "myUsage" : "market";

  if (status === "success") {
    state.pendingPayment = null;
    clearPendingPayment();
  }

  navigate("paymentResult");
}

function renderPaymentResult() {
  const result = state.paymentResult;
  if (!result) return;
  routeParents.paymentResult = result.type === "stay" ? "stays" : result.type === "extra_charge" ? "myUsage" : "market";
  const icon = qs("#paymentResultIcon");
  icon.className = `complete-icon ${result.className}`;
  icon.innerHTML = `<i data-lucide="${result.icon}"></i>`;
  qs("#paymentResultEyebrow").textContent = result.eyebrow;
  qs("#paymentResultTitle").textContent = result.title;
  qs("#paymentResultText").textContent = result.text;
  const account = result.virtualAccount || {};
  const bankName = bankLabel(account.bankName || account.bank || account.bankCode);
  const accountNumber = String(account.accountNumber || account.account_number || "").replace(/\s+/g, "");
  const holderName = account.holderName || account.accountHolder || account.customerName || "";
  const accountText = result.virtualAccount ? readableAccount(result.virtualAccount) : "";
  const dueDate = result.virtualAccount?.dueDate || result.virtualAccount?.accountExpiry?.dueDate;
  const virtualAccountRows = accountText ? `
    <div class="result-account-box">
      <div class="result-account-head">
        <span>입금 계좌</span>
        ${dueDate ? `<em>${formatDateTime(dueDate)}까지</em>` : ""}
      </div>
      <div class="result-account-bank">${escapeHtml(bankName || "은행 확인중")}</div>
      <div class="result-account-number">
        <strong>${escapeHtml(accountNumber || accountText)}</strong>
        ${accountNumber ? `<button type="button" data-copy-account="${escapeHtml(accountNumber)}">복사</button>` : ""}
      </div>
      ${holderName ? `<p>예금주 ${escapeHtml(holderName)}</p>` : ""}
    </div>
  ` : "";
  const stayRelated = result.type === "stay" || result.type === "extra_charge";
  const stayRows = stayRelated ? [
    `<div class="result-detail-row highlight"><span>${result.type === "extra_charge" ? "추가금 상태" : "예약 상태"}</span><strong>${result.status === "virtual_account_issued" ? "입금 확인 대기" : result.status === "success" ? (result.type === "extra_charge" ? "입금 확인 완료" : "예약 요청 접수") : "확인 필요"}</strong></div>`,
    result.date || result.checkOutDate
      ? `<div class="result-detail-row"><span>예약 일정</span><strong>${[result.date, result.checkOutDate].filter(Boolean).join(" ~ ")}</strong></div>` : "",
    result.stayName || result.roomName
      ? `<div class="result-detail-row"><span>예약 장소</span><strong>${[result.stayName, result.roomName].filter(Boolean).join(" · ")}</strong></div>` : "",
    result.location
      ? `<div class="result-detail-row"><span>위치 안내</span><strong>${result.location}</strong></div>` : "",
    result.people
      ? `<div class="result-detail-row"><span>예약 인원</span><strong>${result.people}명</strong></div>` : "",
  ].join("") : [
    `<div class="result-detail-row highlight"><span>주문 상태</span><strong>${result.status === "virtual_account_issued" ? "주문 요청 완료 · 입금 확인 대기" : result.status === "success" ? "주문 요청 접수" : "확인 필요"}</strong></div>`,
    result.pickupTime
      ? `<div class="result-detail-row"><span>수령 시간</span><strong>${formatDateTime(result.pickupTime)}</strong></div>` : "",
    result.storeName
      ? `<div class="result-detail-row"><span>수령 장소</span><strong>${result.storeName}</strong></div>` : "",
  ].join("");
  const guideRows = result.status === "virtual_account_issued" ? `
    <div class="result-next-steps">
      <div><span>1</span><strong>입금</strong></div>
      <div><span>2</span><strong>사장님 확인</strong></div>
      <div><span>3</span><strong>확정 안내</strong></div>
    </div>
  ` : "";
  const extraRows = [
    virtualAccountRows,
    guideRows,
    stayRows,
    result.errorCode ? `<div class="result-detail-row"><span>오류 코드</span><strong>${result.errorCode}</strong></div>` : "",
  ].join("");
  qs("#paymentResultDetails").innerHTML = `
    <div class="result-detail-row"><span>${result.type === "stay" ? "예약번호" : result.type === "extra_charge" ? "추가금 번호" : "주문번호"}</span><strong>${displayOrderNumber(result.orderId, result.type)}</strong></div>
    <div class="result-detail-row"><span>상품명</span><strong>${result.itemName}</strong></div>
    <div class="result-detail-row"><span>금액</span><strong>${money(result.amount)}</strong></div>
    ${extraRows}
  `;
  let primaryAction = "";
  if (result.status === "confirming") {
    primaryAction = `<button class="primary-btn" type="button" disabled><i data-lucide="loader-circle"></i>서버 확인 중</button>`;
  } else if (result.status === "virtual_account_issued") {
    primaryAction = `<button class="primary-btn" data-route="mypage"><i data-lucide="user-round"></i>예약 요청 확인</button>`;
  } else if (result.status !== "success") {
    primaryAction = `<button class="primary-btn" data-route="${result.backRoute}"><i data-lucide="credit-card"></i>다시 결제하기</button>`;
  }
  qs("#paymentResultActions").innerHTML = `
    ${primaryAction}
    <button class="secondary-btn" data-route="chat"><i data-lucide="message-circle"></i>채팅 문의</button>
    <button class="ghost-btn" data-route="${paymentHomeRoute()}"><i data-lucide="home"></i>목록으로</button>
  `;
  refreshIcons();
}

function renderCommunity() {
  const people = Number(qs("#recommendPeople").value || 32);
  const style = qs("#mealStyle").value;
  const factor = style === "heavy" ? 0.45 : style === "light" ? 0.28 : 0.35;
  const pork = Math.ceil(people * factor);
  const drink = Math.ceil(people * (style === "light" ? 1.1 : style === "heavy" ? 1.8 : 1.4));
  const water = Math.ceil(people * 0.6);
  const snacks = Math.ceil(people * (style === "heavy" ? 0.35 : 0.25));
  qs("#recommendResult").innerHTML = `
    <div class="recommend-total">
      <strong>${people}명 기준 추천</strong>
      <span>${style === "heavy" ? "든든한" : style === "light" ? "간단한" : "기본"} MT 장보기 기준</span>
    </div>
    <div class="recommend-row"><span>고기</span><strong>약 ${pork}kg</strong></div>
    <div class="recommend-row"><span>음료</span><strong>약 ${drink}병 또는 캔</strong></div>
    <div class="recommend-row"><span>생수</span><strong>2L ${water}병</strong></div>
    <div class="recommend-row"><span>안주</span><strong>약 ${snacks}kg · ${Math.ceil(people / 6)}세트</strong></div>
  `;
  qs("#activityList").innerHTML = activities
    .slice(0, 3)
    .map(
      (activity) => `
      <button class="mini-card interactive-card" type="button" data-activity-id="${activity.id}">
        <h3>${escapeHtml(activity.title)}</h3>
        <p>${activity.people} · ${activity.time}</p>
        <div class="activity-preview-details">
          <span class="activity-preview-line"><i data-lucide="sparkles"></i>${escapeHtml(activity.note)}</span>
          <span class="activity-preview-line"><i data-lucide="paperclip"></i>${activity.media}</span>
        </div>
        <span class="reaction-line"><i data-lucide="heart"></i>${activity.likes} <i data-lucide="message-circle"></i>${activity.comments.length}</span>
      </button>
    `
    )
    .join("");
  qs("#communityBoards").innerHTML = launchCommunityBoards()
    .map(
      (board) => `
      <button class="board-card" type="button" data-board-id="${board.id}">
        <div>
          <h3>${board.title}</h3>
          <p>${board.description}</p>
        </div>
        <ul>
          ${board.posts
            .slice(0, 3)
            .map((post) => `<li>${escapeHtml(post.title)}<span>공감 ${post.likes} · 댓글 ${post.comments.length}</span></li>`)
            .join("")}
        </ul>
      </button>
    `
    )
    .join("");
  refreshIcons();
}

function activityMatchesFilters(activity) {
  const people = qs("#activityPeople")?.value || "전체";
  const space = qs("#activitySpace")?.value || "전체";
  const mood = qs("#activityMood")?.value || "전체";
  return (
    (people === "전체" || activity.peopleGroup === people) &&
    (space === "전체" || activity.space === space || activity.space === "any") &&
    (mood === "전체" || activity.mood === mood)
  );
}

function renderRecreation() {
  const matches = activities.filter(activityMatchesFilters);
  qs("#activityDirectory").innerHTML = matches.length
    ? matches
        .map(
          (activity) => `
        <article class="activity-card">
          <div class="activity-card-head">
            <div>
              <h3>${escapeHtml(activity.title)}</h3>
              <p class="activity-note">${escapeHtml(activity.note)}</p>
            </div>
            <span class="pill">${activity.time}</span>
          </div>
          <div class="detail-meta">
            <span class="pill">${activity.people}</span>
            <span class="pill">${activity.space === "indoor" ? "실내" : activity.space === "outdoor" ? "야외" : "공간 무관"}</span>
            <span class="pill">${activity.mood === "icebreak" ? "아이스브레이킹" : activity.mood === "team" ? "팀전" : "개인전"}</span>
          </div>
          <div class="card-reactions">
            <span><i data-lucide="heart"></i>${activity.likes}</span>
            <span><i data-lucide="message-circle"></i>${activity.comments.length}</span>
          </div>
          <button class="ghost-btn" type="button" data-activity-id="${activity.id}"><i data-lucide="arrow-right"></i>자세히 보기</button>
        </article>
      `
        )
        .join("")
    : `<div class="empty-state">조건에 맞는 레크레이션이 없습니다.</div>`;
  refreshIcons();
}

function activeBoard() {
  return launchCommunityBoards().find((board) => board.id === state.activeBoardId) || launchCommunityBoards()[0];
}

function activeActivity() {
  return activities.find((activity) => activity.id === state.activeActivityId) || activities[0];
}

function activePost() {
  const board = activeBoard();
  return board.posts.find((post) => post.id === state.activePostId) || board.posts[0];
}

function communityActorId() {
  return window.motfCurrentUserId || "guest";
}

function relativeTime(value) {
  if (!value) return "방금 전";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "방금 전";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}분 전`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}시간 전`;
  return new Date(value).toLocaleDateString("ko-KR");
}

function renderAnonymousComments(comments, authorId = "") {
  const normalized = comments.map((item, index) => typeof item === "string" ? { body: item, userId: `seed-${index}`, createdAt: null } : item);
  const aliases = new Map();
  normalized.forEach((item) => { if (!aliases.has(item.userId)) aliases.set(item.userId, aliases.size + 1); });
  return normalized.map((item) => {
    const isAuthor = authorId && item.userId === authorId;
    const alias = isAuthor ? "익명(작성자)" : `익명${aliases.get(item.userId)}`;
    const replyAlias = item.replyTo ? `@익명${aliases.get(item.replyTo) || ""}` : "";
    return `<div class="comment-item ${isAuthor ? "post-author-comment" : ""}"><div class="comment-author-line"><strong>${alias}</strong><span>${relativeTime(item.createdAt)}</span></div><span>${replyAlias ? `<b>${replyAlias}</b> ` : ""}${escapeHtml(item.body)}</span><button type="button" class="comment-reply-button" data-reply-comment="${escapeHtml(item.userId)}" data-reply-comment-id="${escapeHtml(item.id || "")}" data-reply-alias="${alias}">답글</button></div>`;
  }).join("");
}

function likeOnce(kind, id) {
  const key = `motf.like.${communityActorId()}.${kind}.${id}`;
  if (localStorage.getItem(key)) return false;
  localStorage.setItem(key, "1");
  return true;
}

function renderBoardDetail() {
  const board = activeBoard();
  qs("#boardDetail")?.classList.remove("compose-mode");
  const initialWriteForm = qs("#boardWriteForm");
  if (initialWriteForm) { initialWriteForm.hidden = true; initialWriteForm.classList.remove("full-page-compose", "compose-open"); }
  qs("#boardDetailHeader").innerHTML = `
    <div>
      <h1>${board.title}</h1>
      <p>${board.description}</p>
    </div>
    <button class="primary-btn board-compose-button" type="button" data-community-write><i data-lucide="square-pen"></i>글쓰기</button>
  `;
  qs("#boardPostList").innerHTML = board.posts
    .map(
      (post) => `
      <button class="anonymous-post interactive-card" type="button" data-post-id="${post.id}">
        <div class="post-topline">
          <strong>익명</strong>
          <span>${relativeTime(post.createdAt)}</span>
        </div>
        <h3>${escapeHtml(post.title)}</h3>
        <p>${escapeHtml(post.body)}</p>
        <div class="post-actions">
          ${post.media ? `<span class="pill"><i data-lucide="image"></i>${post.media}</span>` : ""}
          <span class="reaction-line"><i data-lucide="heart"></i>${post.likes} <i data-lucide="message-square"></i>${post.comments.length}</span>
        </div>
      </button>
    `
    )
    .join("");
  qs("#boardPostBoard").value = board.id;
  qs("#boardPostTitle").value = "";
  qs("#boardPostBody").value = "";
  const writePanel = qs("#boardWriteForm");
  const header = qs("#boardDetailHeader");
  if (writePanel && header) {
    const headerHeight = Math.ceil(header.getBoundingClientRect().height);
    writePanel.style.marginTop = window.matchMedia("(max-width: 1080px)").matches ? "0px" : `${headerHeight + 22}px`;
  }
  refreshIcons();
}

function marketRecommendedSets(store) {
  return Array.isArray(store?.recommendedSets) ? store.recommendedSets : [];
}

function ensureMarketBundleProducts(store) {
  if (!store) return [];
  const existing = store.products.filter((product) => product.isBundle);
  if (existing.length) return existing;

  const bundles = marketRecommendedSets(store).map((set, index) => ({
    id: `motf-bundle-${store.id}-${index + 1}`,
    category: "MT 세트",
    name: set.name,
    unit: set.people || "단체 구성",
    price: Number(set.price || 0),
    origin: `${store.name} 추천 구성`,
    image: set.image || marketBundleImages[index % marketBundleImages.length],
    detail: `${set.description} 필요한 품목을 한 번에 준비할 수 있도록 묶은 moTF 전용 할인가 패키지입니다.`,
    detailSections: {
      storage: "구성 상품별 표기와 마트 안내에 따라 보관해주세요.",
      sellerNote: "구성 상품의 재고 상황에 따라 동일 가격대의 유사 상품으로 대체될 수 있습니다.",
    },
    isBundle: true,
    bundleProductIds: set.productIds || [],
  }));
  store.products = [...bundles, ...store.products];
  return bundles;
}

function renderActivityDetail() {
  const activity = activeActivity();
  qs("#activityDetailContent").innerHTML = `
    <img class="post-detail-media" src="${activity.image}" alt="${escapeHtml(activity.title)}" />
    <div class="post-detail-body">
      <h1>${escapeHtml(activity.title)}</h1>
      <p class="activity-detail-description">${escapeHtml(activity.detail)}</p>
      <div class="detail-meta activity-detail-meta">
        <span class="pill">${activity.people}</span>
        <span class="pill">${activity.time}</span>
        <span class="pill">${activity.space === "indoor" ? "실내" : activity.space === "outdoor" ? "야외" : "공간 무관"}</span>
      </div>
      <div class="activity-resource-links">
        <a class="media-chip activity-media-chip" href="https://www.youtube.com/results?search_query=${encodeURIComponent(activity.title + " 레크레이션 진행")}" target="_blank" rel="noopener"><i data-lucide="play-circle"></i>예시 영상 보기</a>
        <button class="media-chip activity-media-chip" type="button" data-download-activity-script><i data-lucide="file-down"></i>진행 대본 받기</button>
      </div>
      <div class="post-actions">
        <button class="secondary-btn" type="button" data-like-activity><i data-lucide="heart"></i>공감 ${activity.likes}</button>
        <button class="ghost-btn" type="button" data-focus-activity-comment><i data-lucide="message-square"></i>댓글 ${activity.comments.length}</button>
      </div>
    </div>
  `;
  qs("#activityCommentList").innerHTML = renderAnonymousComments(activity.comments);
  refreshIcons();
}

function renderPostDetail() {
  const board = activeBoard();
  const post = activePost();
  qs("#postDetailContent").innerHTML = `
    <div class="post-detail-body">
      <p class="eyebrow">${board.title}</p>
      <h1>${escapeHtml(post.title)}</h1>
      <p>${escapeHtml(post.body)}</p>
      ${post.media ? `<div class="post-media-placeholder"><i data-lucide="image"></i>${post.media} 첨부 영역</div>` : ""}
      <div class="post-actions">
        <button class="secondary-btn" type="button" data-like-post><i data-lucide="heart"></i>공감 ${post.likes}</button>
        <button class="ghost-btn" type="button" data-focus-post-comment><i data-lucide="message-square"></i>댓글 ${post.comments.length}</button>
      </div>
    </div>
  `;
  qs("#postCommentList").innerHTML = renderAnonymousComments(post.comments, post.authorId);
  refreshIcons();
}

function renderChat() {
  if (!state.chats.length) {
    qs("#chatList").innerHTML = `<div class="empty-state">아직 시작한 대화가 없습니다.</div>`;
    qs("#chatRoomHeader").innerHTML = `<h2>채팅</h2><p class="muted">숙소 또는 장보기 제휴처에 문의를 시작해보세요.</p>`;
    qs("#chatMessages").innerHTML = `<div class="empty-state">대화를 선택하면 메시지가 표시됩니다.</div>`;
    refreshIcons();
    return;
  }
  qs("#chatList").innerHTML = state.chats
    .map(
      (thread) => {
        const business = [...stays, ...stores].find((item) => item.name === thread.title);
        return `
      <button class="chat-thread ${thread.id === state.activeChatId ? "active" : ""} ${thread.isSupport ? "support-thread" : ""}" data-chat-id="${thread.id}">
        ${thread.isSupport ? '<span class="chat-avatar support"><i data-lucide="headphones"></i></span>' : (thread.image || business?.image) ? `<img src="${thread.image || business.image}" alt="" />` : '<span class="chat-avatar"><i data-lucide="user-round"></i></span>'}
        <span class="chat-thread-copy"><strong>${escapeHtml(thread.title)}${thread.isSupport ? '<b class="pinned-label">고정</b>' : ''}</strong><small>${escapeHtml(thread.address || business?.distance || business?.region || thread.subtitle)}</small><span>${escapeHtml(thread.subtitle)}</span></span>
      </button>
    `; }
    )
    .join("");
  const thread = state.chats.find((item) => item.id === state.activeChatId) || state.chats[0];
  const chatBusiness = [...stays, ...stores].find((item) => item.name === thread.title);
  qs("#chatRoomHeader").innerHTML = `
    ${thread.isSupport ? '<span class="chat-avatar support"><i data-lucide="headphones"></i></span>' : (thread.image || chatBusiness?.image) ? `<img src="${thread.image || chatBusiness.image}" alt="" />` : ""}
    <div><h2>${escapeHtml(thread.title)}</h2><p class="muted">${escapeHtml(thread.address || chatBusiness?.distance || chatBusiness?.region || (thread.isSupport ? "서비스 이용·예약·결제 문의" : thread.subtitle))}</p></div>
  `;
  qs("#chatMessages").innerHTML = thread.messages
    .map(
      (message) => `
      <div class="message-row ${message.from}">
        <div class="bubble ${message.from}">
          ${message.text ? `<span>${escapeHtml(message.text)}</span>` : ""}
          ${message.attachments?.length ? `<div class="attachment-list">${message.attachments.map((name) => `<span class="attachment-chip"><i data-lucide="paperclip"></i>${escapeHtml(name)}</span>`).join("")}</div>` : ""}
        </div>
        <span class="read-status">${message.read ? "읽음" : "안읽음"}</span>
      </div>
    `
    )
    .join("");
  refreshIcons();
}

window.motfApplyChats = function applyChats(chats, activeChatId) {
  state.chats = Array.isArray(chats) ? chats : [];
  state.activeChatId = activeChatId || state.activeChatId || state.chats[0]?.id || "";
  if (!state.chats.some((item) => item.id === state.activeChatId)) state.activeChatId = state.chats[0]?.id || "";
  if (currentRoute() === "chat") renderChat();
};

window.motfGetActiveChatId = () => state.activeChatId;
window.motfGetActiveCommunityPost = () => ({ boardId: state.activeBoardId, post: activePost() });
window.motfAppendCommunityComment = (comment) => { activePost().comments.push(comment); renderPostDetail(); };
window.motfFindBusinessByName = (name) => [...stays, ...stores].find((item) => item.name === escapeHtml(name)) || null;
window.motfNavigate = navigate;
window.motfGetUsageSnapshot = () => ({
  reservations: state.reservations.map((item) => ({ ...item })),
  orders: state.orders.map((item) => ({ ...item })),
});

function renderMypage() {
  const reservationList = qs("#reservationList");
  const orderList = qs("#orderList");
  if (!reservationList || !orderList) {
    refreshIcons();
    return;
  }
  reservationList.innerHTML = state.reservations.length
    ? state.reservations.map(reservationCard).join("")
    : `<div class="empty-state">아직 예약한 숙소가 없습니다.</div>`;
  orderList.innerHTML = state.orders.length
    ? state.orders.map(orderCard).join("")
    : `<div class="empty-state">아직 장보기 주문이 없습니다.</div>`;
  const selectedBudgetButton = qs("[data-selected-budget-file]");
  if (selectedBudgetButton) {
    selectedBudgetButton.disabled = state.selectedUsageIds.size === 0;
    selectedBudgetButton.innerHTML = `<i data-lucide="file-spreadsheet"></i>${state.selectedUsageIds.size ? `${state.selectedUsageIds.size}건 예결산 생성` : "선택 내역 예결산"}`;
  }
  refreshIcons();
}

async function renderTossWidgets(payment) {
  const paymentMethods = qs("#tossPaymentMethods");
  const agreement = qs("#tossAgreement");
  if (!paymentMethods || !agreement || !payment) return;
  const methods = [
    { id: "CARD", label: "신용·체크카드", note: "카드사 앱 또는 간편결제", icon: "credit-card" },
    { id: "TRANSFER", label: "계좌이체", note: "내 계좌에서 바로 결제", icon: "landmark" },
    { id: "VIRTUAL_ACCOUNT", label: "가상계좌", note: "12월 도입 예정", icon: "receipt-text" },
  ];
  const available = methods.filter((method) => TOSS_ENABLED_METHODS.includes(method.id));
  if (!payment.paymentMethod || !available.some((method) => method.id === payment.paymentMethod)) {
    payment.paymentMethod = available[0]?.id || "CARD";
  }
  paymentMethods.innerHTML = `<div class="toss-method-grid">${methods.map((method) => {
    const enabled = TOSS_ENABLED_METHODS.includes(method.id);
    return `<label class="toss-method-option ${enabled ? "" : "disabled"}">
      <input type="radio" name="tossPaymentMethod" value="${method.id}" ${payment.paymentMethod === method.id ? "checked" : ""} ${enabled ? "" : "disabled"} />
      <i data-lucide="${method.icon}"></i><span><strong>${method.label}</strong><small>${method.note}</small></span>
    </label>`;
  }).join("")}</div>`;
  agreement.innerHTML = `
    <label class="toss-final-agreement"><input type="checkbox" id="tossFinalAgreement" />주문 내용과 환불 규정을 확인했으며 결제에 동의합니다.</label>
  `;
  paymentMethods.querySelectorAll('input[name="tossPaymentMethod"]').forEach((input) => {
    input.addEventListener("change", () => { payment.paymentMethod = input.value; savePendingPayment(payment); });
  });
  setTossWidgetStatus("토스페이먼츠 결제창에서 선택한 수단으로 안전하게 결제합니다.");
  refreshIcons();
}

async function confirmPaymentOnServer(payment, params = new URLSearchParams()) {
  for (let i = 0; i < 20 && !window.motfSupabase; i += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 100));
  }
  if (!window.motfSupabase) throw new Error("Login config was not loaded.");
  const { data: sessionData } = await window.motfSupabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("Login expired. Please sign in again.");
  let response;
  try {
    response = await fetch("/api/toss-confirm", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        paymentKey: params.get("paymentKey"),
        orderId: params.get("orderId") || payment.orderId,
        amount: Number(params.get("amount") || payment.amount),
      }),
    });
  } catch (error) {
    throw new Error(`우리 서버 결제 확인 API 호출 실패: ${error.message || "네트워크 오류"}`);
  }
  const data = await response.json().catch(() => ({
    ok: false,
    message: `우리 서버 결제 확인 API가 JSON을 반환하지 않았습니다. HTTP ${response.status}`,
  }));
  if (!response.ok || !data.ok) {
    throw new Error(data.message || "Payment confirmation failed.");
  }
  return data;
}

async function requestTossPayment() {
  const payment = state.pendingPayment;
  if (!payment) return toast("결제할 내역이 없습니다.");
  if (!qs("#tossFinalAgreement")?.checked) return toast("주문 내용과 환불 규정에 동의해주세요.");
  if (!TOSS_CLIENT_KEY) {
    state.paymentResult = {
      status: "fail", type: payment.type, eyebrow: "결제 설정 필요", title: "토스 결제키가 설정되지 않았습니다",
      text: "Vercel 환경변수 TOSS_CLIENT_KEY를 등록한 뒤 다시 시도해주세요.", icon: "key-round", className: "fail",
      orderId: payment.orderId, itemName: payment.itemName, amount: payment.amount, backRoute: paymentBackRoute(),
    };
    return navigate("paymentResult");
  }

  try {
    await loadTossPaymentsSdk();
    const { data: sessionData } = await window.motfSupabase.auth.getSession();
    const activeSession = sessionData.session;
    if (!activeSession?.user) throw new Error("로그인이 만료되었습니다. 다시 로그인해주세요.");
    const method = payment.paymentMethod || "CARD";
    if (!TOSS_ENABLED_METHODS.includes(method)) throw new Error("현재 사용할 수 없는 결제수단입니다.");
    savePendingPayment(payment);
    const tossPayments = window.TossPayments(TOSS_CLIENT_KEY);
    const paymentClient = tossPayments.payment({ customerKey: activeSession.user.id });
    const tossRequest = {
      method,
      amount: { currency: "KRW", value: Number(payment.amount) },
      orderId: payment.orderId,
      orderName: payment.itemName,
      successUrl: `${window.location.origin}/payment?orderId=${encodeURIComponent(payment.orderId)}`,
      failUrl: `${window.location.origin}/payment?orderId=${encodeURIComponent(payment.orderId)}`,
      customerEmail: payment.customerEmail || activeSession.user.email || undefined,
      customerName: payment.customerName || "moTF 이용자",
      customerMobilePhone: String(payment.customerPhone || "").replace(/\D/g, "") || undefined,
    };
    if (method === "VIRTUAL_ACCOUNT") {
      tossRequest.virtualAccount = { cashReceipt: { type: "소득공제" }, useEscrow: false, validHours: 24 };
    }
    await paymentClient.requestPayment(tossRequest);
  } catch (error) {
    const cancelled = ["USER_CANCEL", "PAY_PROCESS_CANCELED"].includes(error.code);
    state.paymentResult = {
      status: cancelled ? "cancel" : "fail",
      type: payment.type,
      eyebrow: cancelled ? "결제 취소" : "결제 실패",
      title: cancelled ? "결제를 취소했습니다" : "결제를 완료하지 못했습니다",
      text: error.message || "결제 정보를 확인한 뒤 다시 시도해주세요.",
      icon: cancelled ? "rotate-ccw" : "x",
      className: cancelled ? "cancel" : "fail",
      orderId: payment.orderId,
      itemName: payment.itemName,
      amount: payment.amount,
      backRoute: paymentBackRoute(),
    };
    navigate("paymentResult");
  }
}

async function handleTossRedirect() {
  const params = new URLSearchParams(window.location.search);
  const paymentKey = params.get("paymentKey");
  const orderId = params.get("orderId");
  const amount = Number(params.get("amount"));
  const errorCode = params.get("code");
  const errorMessage = params.get("message");
  if (!paymentKey && !errorCode) return false;

  const payment = state.pendingPayment || getStoredPendingPayment();
  if (!payment || (orderId && payment.orderId !== orderId)) {
    state.paymentResult = {
      status: "fail", type: "stay", eyebrow: "결제 확인 필요", title: "결제 준비 정보를 찾지 못했습니다",
      text: "마이페이지에서 결제 내역을 확인하거나 고객센터에 문의해주세요.", icon: "x", className: "fail",
      orderId: orderId || "-", itemName: "결제 내역", amount: amount || 0, backRoute: "mypage",
    };
    navigate("paymentResult", { replace: true });
    return true;
  }

  if (errorCode) {
    state.paymentResult = {
      status: "fail", type: payment.type, eyebrow: "결제 실패", title: "결제가 완료되지 않았습니다",
      text: errorMessage || "결제창에서 요청을 완료하지 못했습니다.", icon: "x", className: "fail",
      errorCode, orderId: payment.orderId, itemName: payment.itemName, amount: payment.amount, backRoute: paymentBackRoute(),
    };
    window.history.replaceState({}, "", "/payment");
    navigate("paymentResult", { replace: true });
    return true;
  }

  state.paymentResult = {
    status: "confirming", type: payment.type, eyebrow: "결제 확인 중", title: "결제를 안전하게 확인하고 있습니다",
    text: "창을 닫지 마세요. 승인 결과를 한 번만 확인합니다.", icon: "loader-circle", className: "",
    orderId: payment.orderId, itemName: payment.itemName, amount: payment.amount, backRoute: paymentBackRoute(),
  };
  navigate("paymentResult", { replace: true });
  try {
    await confirmPaymentOnServer(payment, params);
    await window.motfReloadTransactions?.();
    state.pendingPayment = payment;
    setPaymentResult("success");
  } catch (error) {
    state.paymentResult = {
      status: "fail", type: payment.type, eyebrow: "승인 확인 실패", title: "결제 상태를 확인해주세요",
      text: error.message || "토스 승인 확인에 실패했습니다.", icon: "x", className: "fail",
      orderId: payment.orderId, itemName: payment.itemName, amount: payment.amount, backRoute: paymentBackRoute(),
    };
    navigate("paymentResult", { replace: true });
  } finally {
    window.history.replaceState({}, "", "/payment");
  }
  return true;
}

function pendingAccountDueDate(item = {}) {
  const account = item.virtualAccount || {};
  return item.expiresAt || item.dueAt || account.dueDate || account.due_date || account.expiredAt || account.expired_at || account.expiresAt || account.expires_at || account.expiry?.dueDate || account.expiry?.due_date || account.accountExpiry?.dueDate || account.accountExpiry?.due_date || "";
}

function reservationCard(item) {
  const account = item.virtualAccount ? readableAccount(item.virtualAccount) : "";
  const dueDate = pendingAccountDueDate(item);
  const schedule = [item.date, item.checkOutDate].filter(Boolean).join(" ~ ") || item.date || "";
  return `
    <article class="listing-card usage-history-card ${item.isPendingVirtualAccount ? "pending-payment-card" : ""} ${item.isExtraCharge ? "extra-charge-usage-card" : ""}">
      <label class="usage-select"><input type="checkbox" data-usage-select="${item.id}" ${state.selectedUsageIds.has(String(item.id)) ? "checked" : ""}><span>예결산에 포함</span></label>
      <div class="listing-body">
        <div class="listing-meta">
          <span class="pill ${item.isPendingVirtualAccount ? "warning" : "success"}">${item.status}</span>
          <span class="pill">${schedule}</span>
          <span class="pill">${item.people}명</span>
        </div>
        <h3>${item.isExtraCharge ? "추가 이용금" : item.stayName}</h3>
        <p>${item.isExtraCharge ? `${item.stayName} · ${item.roomName || "숙소 예약"}` : item.roomName} · ${money(item.amount)}</p>
        ${item.isExtraCharge && item.itemsLabel ? `<div class="extra-charge-breakdown"><strong>추가 항목</strong><br>${escapeHtml(item.itemsLabel)}</div>` : ""}
        ${account ? `<div class="pending-account"><span>입금 계좌</span><strong>${account}</strong>${dueDate ? `<p>입금 기한 ${formatDateTime(dueDate)}</p>` : ""}</div>` : ""}
        ${item.isPendingVirtualAccount ? `<p class="muted">입금 완료가 자동 확인되면 예약 요청 완료 상태로 넘어가고, 사장님 확인 후 최종 확정됩니다.</p>` : ""}
        ${item.refundAmount ? `<p class="muted">환불 예정 금액 ${money(item.refundAmount)}</p>` : ""}
        <div class="button-row">
          ${!item.isExtraCharge && item.rawStatus === "confirmed" ? `<button class="ghost-btn" data-cancel-reservation="${item.id}"><i data-lucide="rotate-ccw"></i>예약 취소</button>` : ""}
          <button class="secondary-btn" data-budget-file="${item.id}"><i data-lucide="file-spreadsheet"></i>예결산 엑셀 생성</button>
          <button class="ghost-btn" data-route="review"><i data-lucide="star"></i>리뷰</button>
        </div>
      </div>
    </article>
  `;
}

function orderCard(item) {
  const account = item.virtualAccount ? readableAccount(item.virtualAccount) : "";
  const dueDate = pendingAccountDueDate(item);
  return `
    <article class="listing-card usage-history-card ${item.isPendingVirtualAccount ? "pending-payment-card" : ""}">
      <label class="usage-select"><input type="checkbox" data-usage-select="${item.id}" ${state.selectedUsageIds.has(String(item.id)) ? "checked" : ""}><span>예결산에 포함</span></label>
      <div class="listing-body">
        <div class="listing-meta">
          <span class="pill ${item.isPendingVirtualAccount ? "warning" : "success"}">${item.status}</span>
          <span class="pill">${item.pickupTime}</span>
        </div>
        <h3>${item.storeName}</h3>
        <p>${item.items.length}개 품목 · ${money(item.amount)}</p>
        ${account ? `<div class="pending-account"><span>입금 계좌</span><strong>${account}</strong>${dueDate ? `<p>입금 기한 ${formatDateTime(dueDate)}</p>` : ""}</div>` : ""}
        ${item.isPendingVirtualAccount ? `<p class="muted">입금 완료가 자동 확인되면 주문 요청 완료 상태로 넘어갑니다.</p>` : ""}
        ${item.refundAmount ? `<p class="muted">환불 예정 금액 ${money(item.refundAmount)}</p>` : ""}
        <div class="button-row">
          <button class="secondary-btn" data-budget-file="${item.id}"><i data-lucide="file-spreadsheet"></i>예결산 엑셀 생성</button>
          <button class="ghost-btn" data-route="review"><i data-lucide="star"></i>리뷰</button>
        </div>
      </div>
    </article>
  `;
}

function renderReviews() {
  const targetSelect = qs("#reviewTarget");
  const submitButton = qs("#reviewForm")?.querySelector('[type="submit"]');
  const helper = qs("#reviewEligibilityNote");
  if (targetSelect) {
    targetSelect.innerHTML = state.reviewTargets.length
      ? state.reviewTargets.map((target) => `<option value="${escapeHtml(target.id)}">${escapeHtml(target.label)}</option>`).join("")
      : `<option value="">이용 완료 내역이 없습니다</option>`;
    targetSelect.disabled = !state.reviewTargets.length;
  }
  if (submitButton) submitButton.disabled = !state.reviewTargets.length;
  if (helper) {
    helper.textContent = state.reviewTargets.length
      ? "이용 완료된 예약이나 주문만 리뷰를 작성할 수 있어요."
      : "리뷰는 실제 이용 완료된 예약이나 장보기 주문이 있을 때 작성할 수 있어요.";
  }
  renderReviewKeywords();
  const visibleReviews = state.reviewScope === "market"
    ? state.reviews.filter((review) => review.type === "market")
    : state.reviewScope === "stay"
      ? state.reviews.filter((review) => review.type !== "market")
      : state.reviews;
  qs("#reviewList").innerHTML = visibleReviews.length
    ? visibleReviews.map(reviewCard).join("")
    : `<div class="empty-state">${state.reviewScope === "market" ? "아직 등록된 장보기 후기가 없습니다." : "아직 등록된 후기가 없습니다."}</div>`;
  const ratingRange = qs("#reviewRatingRange");
  const ratingLabel = qs("#reviewRatingLabel");
  if (ratingRange) ratingRange.value = String(state.rating);
  if (ratingLabel) ratingLabel.textContent = `${state.rating}점`;
  qs("#ratingRow").innerHTML = renderStarPreview(state.rating);
  refreshIcons();
}

function activeReviewTarget() {
  const targetId = qs("#reviewTarget")?.value || "";
  return state.reviewTargets.find((item) => item.id === targetId) || null;
}

function reviewKeywordsForTarget(target) {
  const common = ["소통이 빨라요", "단체 이용 좋아요", "합리적인 가격", "응답이 빨라요", "사장님이 친절해요", "재방문하고 싶어요"];
  const stay = ["숙소가 깨끗해요", "사진과 같아요", "방이 넓어요", "바베큐장이 좋아요", "편의시설이 좋아요", "주차가 편해요", "소음 안내가 명확해요"];
  const market = ["상품 품질이 좋아요", "포장이 꼼꼼해요", "수량이 정확해요", "신선해요", "픽업이 편해요", "배송이 편해요", "대량 주문이 편해요"];
  return [...common, ...(target?.type === "market_order" ? market : stay)];
}

function renderReviewKeywords() {
  const target = activeReviewTarget();
  const list = qs("#reviewKeywordList");
  const label = qs("#reviewKeywordTypeLabel");
  if (!list) return;
  const keywords = reviewKeywordsForTarget(target);
  list.innerHTML = keywords.map((keyword, index) => `
    <button type="button" class="tag-chip ${index < 3 ? "active" : ""}">${escapeHtml(keyword)}</button>
  `).join("");
  if (label) {
    label.textContent = target?.type === "market_order"
      ? "장보기 주문에 맞는 키워드예요"
      : "숙소 이용에 맞는 키워드예요";
  }
}

function renderStarPreview(score) {
  const normalized = Math.max(1, Math.min(10, Number(score) || 10));
  return [1, 2, 3, 4, 5].map((index) => {
    const fill = Math.max(0, Math.min(100, (normalized - (index - 1) * 2) * 50));
    return `
      <span class="star-meter" aria-hidden="true">
        <span class="star-meter-base">★</span>
        <span class="star-meter-fill" style="width:${fill}%">★</span>
      </span>
    `;
  }).join("");
}

function reviewCard(review) {
  return `
    <article class="review-card">
      <div class="listing-meta">
        <span class="pill">${escapeHtml(review.target)}</span>
        <span class="review-score">${renderStarPreview(review.score)} <b>${Number(review.score || 0).toFixed(0)}점</b></span>
      </div>
      ${Array.isArray(review.images) && review.images.length ? `
        <div class="review-photo-grid">
          ${review.images.map((image) => `<img src="${escapeHtml(image)}" alt="리뷰 사진" loading="lazy" />`).join("")}
        </div>
      ` : ""}
      <p>${escapeHtml(review.text)}</p>
      <div class="detail-meta">${review.tags.map((tag) => `<span class="pill">${escapeHtml(tag)}</span>`).join("")}</div>
      <strong>${escapeHtml(review.author)}</strong>
    </article>
  `;
}

window.motfApplyReviews = function applyReviews(nextReviews = []) {
  state.reviews = Array.isArray(nextReviews) ? nextReviews : [];
  if (currentRoute() === "review") renderReviews();
  if (currentRoute() === "stayDetail") renderStayDetail();
};

window.motfApplyReviewTargets = function applyReviewTargets(nextTargets = []) {
  state.reviewTargets = Array.isArray(nextTargets) ? nextTargets : [];
  if (currentRoute() === "review") renderReviews();
};

window.motfSetReviewScope = function setReviewScope(scope = "all") {
  state.reviewScope = ["all", "stay", "market"].includes(scope) ? scope : "all";
  if (currentRoute() === "review") renderReviews();
};

window.motfGetReviewDraft = function getReviewDraft() {
  const targetId = qs("#reviewTarget")?.value || "";
  const target = state.reviewTargets.find((item) => item.id === targetId);
  if (!target) return null;
  return {
    targetType: target.type,
    transactionId: target.transactionId,
    rating: state.rating,
    body: qs("#reviewText")?.value.trim() || "",
    tags: qsa(".tag-chip.active").map((tag) => tag.textContent.trim()).filter(Boolean),
    files: qs("#reviewImages")?.files ? [...qs("#reviewImages").files] : [],
    structuredScores: Object.fromEntries(qsa("[data-review-score]").map((input) => [input.dataset.reviewScore, Number(input.value)])),
    comfortablePeopleMin: Number(qs("#reviewComfortMin")?.value || 0) || null,
    comfortablePeopleMax: Number(qs("#reviewComfortMax")?.value || 0) || null,
    recommend30Plus: qs("#reviewRecommendLarge")?.value === "" ? null : qs("#reviewRecommendLarge")?.value === "true",
    organizerDifficulty: Number(qs("#reviewOrganizerDifficulty")?.value || 0) || null,
  };
};

function complete(type, title, text) {
  qs("#completeEyebrow").textContent = type;
  qs("#completeTitle").textContent = title;
  qs("#completeText").textContent = text;
  navigate("complete");
}

function ensureChat(title) {
  if (window.motfOpenDatabaseChat?.(title)) return;
  let thread = state.chats.find((item) => item.title === title);
  if (!thread) {
    thread = {
      id: `chat-${Date.now()}`,
      title,
      subtitle: "새 문의",
      messages: [{ from: "admin", text: "moTF가 대화와 예약 정보를 함께 확인합니다.", read: true }],
    };
    state.chats.unshift(thread);
  }
  state.activeChatId = thread.id;
  navigate("chat");
}

document.addEventListener("click", async (event) => {
  const historyBackButton = event.target.closest("[data-history-back]");
  if (historyBackButton) {
    goBack(historyBackButton.dataset.fallbackRoute || "home");
    return;
  }

  const homeStayScrollButton = event.target.closest("[data-home-stay-scroll]");
  if (homeStayScrollButton) {
    const rail = qs("#homeStayPicks");
    const direction = Number(homeStayScrollButton.dataset.homeStayScroll || 1);
    rail?.scrollBy({ left: direction * Math.max(280, rail.clientWidth * 0.82), behavior: "smooth" });
    return;
  }

  const homeMarketScrollButton = event.target.closest("[data-home-market-scroll]");
  if (homeMarketScrollButton) {
    const rail = qs("#homeMarketPicks");
    const direction = Number(homeMarketScrollButton.dataset.homeMarketScroll || 1);
    rail?.scrollBy({ left: direction * Math.max(280, rail.clientWidth * 0.82), behavior: "smooth" });
    return;
  }

  if (event.target.closest("[data-create-mt-project]")) {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    qs("#mtProjectForm").dataset.mode = "create";
    qs("#mtProjectForm").reset();
    setDateInputValue(qs("#mtEditStart"), localDateKey(today));
    setDateInputValue(qs("#mtEditEnd"), localDateKey(tomorrow));
    qs("#mtEditPeople").value = 10;
    qs("#mtEditRegion").value = DEFAULT_STAY_REGION;
    qs("#mtProjectDialog").showModal();
    refreshIcons();
    return;
  }

  const openMtProjectButton = event.target.closest("[data-open-mt-project]");
  if (openMtProjectButton) {
    const projectId = openMtProjectButton.dataset.openMtProject;
    try {
      if (projectId !== "demo") await window.motfSelectMtProject?.(projectId);
      state.mtProjectMode = "detail";
      renderMyMt();
    } catch (error) { toast(error.message || "MT 정보를 불러오지 못했습니다."); }
    return;
  }

  if (event.target.closest("[data-mt-directory]")) {
    state.mtProjectMode = "list";
    renderMyMt();
    return;
  }

  if (event.target.closest("[data-edit-mt-project]")) {
    const project = state.mtProject;
    qs("#mtProjectForm").dataset.mode = "edit";
    qs("#mtEditTitle").value = project.title || "";
    qs("#mtEditOrganization").value = project.organization_name || "";
    setDateInputValue(qs("#mtEditStart"), String(project.starts_on || "").slice(0, 10));
    setDateInputValue(qs("#mtEditEnd"), String(project.ends_on || "").slice(0, 10));
    qs("#mtEditPeople").value = project.guest_count || 10;
    qs("#mtEditRegion").value = project.region || "가평";
    qs("#mtEditBudget").value = Number(project.estimated_budget || 0) ? Number(project.estimated_budget).toLocaleString("ko-KR") : "";
    qs("#mtProjectDialog").showModal();
    refreshIcons();
    return;
  }

  if (event.target.closest("[data-add-mt-itinerary]")) {
    qs("#mtItineraryTime").value = `${String(state.mtProject.starts_on || "").slice(0, 10)}T13:00`;
    qs("#mtItineraryDialog").showModal();
    refreshIcons();
    return;
  }

  if (event.target.closest("[data-add-mt-notice]")) {
    qs("#mtNoticeTitle").value = "";
    qs("#mtNoticeDate").value = localDateKey(new Date());
    qs("#mtNoticeBody").value = "";
    qs("#mtNoticePinned").checked = false;
    qs("#mtNoticeDialog").showModal();
    refreshIcons();
    return;
  }

  const routeButton = event.target.closest("[data-route]");
  if (routeButton) {
    if (routeButton.dataset.route === "review") window.motfSetReviewScope?.(routeButton.dataset.reviewScope || "all");
    navigate(routeButton.dataset.route);
    if (routeButton.dataset.route === "community" && routeButton.dataset.communitySection) {
      scrollToCommunitySection(routeButton.dataset.communitySection);
    }
    return;
  }

  const addCandidateButton = event.target.closest("[data-add-mt-candidate]");
  if (addCandidateButton) {
    const businessId = String(addCandidateButton.dataset.addMtCandidate);
    const projects = mtProjectList().filter((project) => project.status !== "completed" && project.id);
    if (!projects.length) {
      toast("객실 후보를 담으려면 내 MT를 먼저 만들어주세요.");
      navigate("myMt");
      return;
    }
    state.pendingMtCandidateId = businessId;
    renderMtCandidateProjectChoices(projects);
    qs("#mtCandidateProjectDialog").showModal();
    return;
  }

  const candidateProjectSelectButton = event.target.closest("[data-select-candidate-project]");
  if (candidateProjectSelectButton) {
    candidateProjectSelectButton.disabled = true;
    try {
      await renderMtCandidateRoomChoices(candidateProjectSelectButton.dataset.selectCandidateProject, state.pendingMtCandidateId);
    } catch (error) {
      candidateProjectSelectButton.disabled = false;
      toast(error.message || "객실 공실을 확인하지 못했습니다.");
    }
    return;
  }

  if (event.target.closest("[data-back-candidate-projects]")) {
    renderMtCandidateProjectChoices(mtProjectList().filter((project) => project.status !== "completed" && project.id));
    return;
  }

  const candidateProjectButton = event.target.closest("[data-save-candidate-project]");
  if (candidateProjectButton) {
    const projectId = candidateProjectButton.dataset.saveCandidateProject;
    const businessId = candidateProjectButton.dataset.saveCandidateBusiness;
    const offeringId = candidateProjectButton.dataset.saveCandidateRoom;
    if (!projectId || !businessId || !offeringId) return;
    candidateProjectButton.disabled = true;
    try {
      await window.motfSaveCandidateToProject?.(projectId, businessId, offeringId);
      if (String(state.mtProject?.id) === String(projectId)) await window.motfSelectMtProject?.(projectId);
      qs("#mtCandidateProjectDialog")?.close();
      state.pendingMtCandidateId = "";
      toast("선택한 내 MT에 객실 후보를 담았습니다.");
    } catch (error) {
      candidateProjectButton.disabled = false;
      toast(error.message || "객실 후보를 저장하지 못했습니다.");
    }
    return;
  }

  const removeCandidateButton = event.target.closest("[data-remove-mt-candidate]");
  if (removeCandidateButton) {
    const id = String(removeCandidateButton.dataset.removeMtCandidate);
    const candidate = state.mtCandidateRecords.find((item) => String(item.id) === id);
    state.mtCandidates = state.mtCandidates.filter((candidateId) => candidateId !== id);
    state.mtCandidateRecords = state.mtCandidateRecords.filter((item) => String(item.id) !== id);
    const plannedItem = (state.mtProject.items || []).find((item) => item.item_kind === "stay" && String(item.reference_id) === id);
    if (plannedItem) {
      state.mtProject.items = state.mtProject.items.filter((item) => item !== plannedItem);
      try { await window.motfRemoveMtItem?.(plannedItem.id); } catch (error) { console.warn("MT 숙소 예산 항목 삭제 실패", error); }
    }
    try { await window.motfSaveMtCandidate?.(candidate?.businessId, id, false); } catch (error) { console.warn("MT 후보 DB 삭제 실패", error); }
    renderMyMt();
    return;
  }

  const useMtStayButton = event.target.closest("[data-use-mt-stay]");
  if (useMtStayButton) {
    const stay = stays.find((item) => String(item.id) === String(useMtStayButton.dataset.useMtStay)) || state.mtCandidateRecords.find((item) => String(item.id) === String(useMtStayButton.dataset.useMtStay));
    if (!stay) return;
    const plannedItem = (state.mtProject.items || []).find((item) => item.item_kind === "stay" && String(item.reference_id) === String(stay.id) && item.status !== "cancelled");
    if (plannedItem) {
      state.mtProject.items = (state.mtProject.items || []).filter((item) => item.item_kind !== "stay");
      try { await window.motfClearMtStayItem?.(); } catch (error) { console.warn("MT 숙소 예산 취소 실패", error); }
      renderMyMt();
      toast("숙소 예산 반영을 취소했습니다.");
      return;
    }
    const estimate = estimateMtStayCost(stay, mtProjectPeople());
    const localItem = { id: `stay-${stay.id}`, item_kind: "stay", reference_id: stay.id, title: stay.name, quantity: 1, amount: estimate.total, status: "planned" };
    state.mtProject.items = [...(state.mtProject.items || []).filter((item) => item.item_kind !== "stay"), localItem];
    try {
      const saved = await window.motfSetMtStayItem?.({ business_id: stay.businessId, offering_id: stay.offeringId || stay.id, title: stay.name, amount: estimate.total });
      if (saved) state.mtProject.items = [...state.mtProject.items.filter((item) => item.item_kind !== "stay"), saved];
    } catch (error) { console.warn("MT 숙소 예산 저장 실패", error); }
    renderMyMt();
    toast("이 객실을 예산에 반영했습니다.");
    return;
  }

  if (event.target.closest("[data-complete-mt-project]")) {
    if (!window.confirm("이 MT를 완료 처리할까요? 완료된 MT는 목록에 보관됩니다.")) return;
    try {
      await window.motfCompleteMtProject?.();
      state.mtProject.status = "completed";
      state.mtProjectMode = "list";
      renderMyMt();
      toast("MT를 완료 처리했습니다.");
    } catch (error) {
      toast(error.message || "MT를 완료하지 못했습니다.");
    }
    return;
  }

  const removeMtItemButton = event.target.closest("[data-remove-mt-item]");
  if (removeMtItemButton) {
    const itemId = removeMtItemButton.dataset.removeMtItem;
    state.mtProject.items = (state.mtProject.items || []).filter((item) => String(item.id) !== String(itemId));
    try { await window.motfRemoveMtItem?.(itemId); } catch (error) { console.warn("MT 준비 항목 삭제 실패", error); }
    renderMyMt();
    return;
  }

  const calendarToggle = event.target.closest("[data-toggle-public-calendar]");
  if (calendarToggle) {
    const wrap = qs("#publicStayCalendarWrap");
    if (!wrap) return;
    wrap.hidden = !wrap.hidden;
    calendarToggle.innerHTML = `<i data-lucide="calendar-days"></i>${wrap.hidden ? "3개월 달력 보기" : "달력 닫기"}`;
    refreshIcons();
    return;
  }

  const calendarDateButton = event.target.closest("[data-inspect-calendar-date]");
  if (calendarDateButton) {
    showPublicCalendarDay(state.selectedStay, calendarDateButton.dataset.inspectCalendarDate);
    return;
  }

  const stayPageButton = event.target.closest("[data-stay-page]");
  if (stayPageButton && !stayPageButton.disabled) {
    state.stayPage = Number(stayPageButton.dataset.stayPage || 1);
    renderStays();
    qs("#stayList")?.closest("section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  const stayButton = event.target.closest("[data-stay-id]");
  if (stayButton) {
    state.selectedStay = stays.find((stay) => stay.id === stayButton.dataset.stayId) || stays[0];
    state.selectedRoom = state.selectedStay.rooms[0];
    navigate("stayDetail");
    return;
  }

  const roomButton = event.target.closest("[data-room-index]");
  if (roomButton) {
    const room = state.selectedStay.rooms[Number(roomButton.dataset.roomIndex)];
    if (isRoomUnavailable(room)) {
      toast("선택한 날짜에는 이미 품절된 객실입니다.");
      return;
    }
    state.selectedRoom = room;
    navigate("roomDetail");
    return;
  }

  const stayFilterToggle = event.target.closest("[data-toggle-stay-filters]");
  if (stayFilterToggle) {
    const panel = qs("#stayAdvancedFilters");
    if (panel) panel.hidden = !panel.hidden;
    return;
  }

  const stayFilterReset = event.target.closest("[data-reset-stay-filters]");
  if (stayFilterReset) {
    qsa("[data-stay-filter]").forEach((input) => {
      input.checked = false;
    });
    qs("#stayMinRooms").value = 0;
    qs("#stayMinBaths").value = 0;
    renderStays();
    return;
  }

  if (event.target.closest("[data-stay-filter], .check-card")) {
    window.setTimeout(renderStays, 0);
    return;
  }

  const chatButton = event.target.closest("[data-open-chat]");
  if (chatButton) {
    ensureChat(chatButton.dataset.openChat);
    return;
  }

  const storeButton = event.target.closest("[data-store-id]");
  if (storeButton) {
    state.selectedStore = stores.find((store) => store.id === storeButton.dataset.storeId) || stores[0];
    state.activeCategory = "전체";
    navigate("storeDetail");
    return;
  }

  const marketSelectButton = event.target.closest("[data-market-select]");
  if (marketSelectButton) {
    state.selectedStore = stores.find((store) => store.id === marketSelectButton.dataset.marketSelect) || stores[0] || null;
    state.selectedProduct = state.selectedStore?.products?.[0] || null;
    state.activeCategory = "전체";
    renderStores();
    return;
  }

  const categoryButton = event.target.closest("[data-category]");
  if (categoryButton) {
    state.activeCategory = categoryButton.dataset.category;
    currentRoute() === "market" ? renderStores() : renderStoreDetail();
    return;
  }

  const communityWriteButton = event.target.closest("[data-community-write]");
  if (communityWriteButton) {
    if (!state.activeBoardId) state.activeBoardId = communityBoards[0].id;
    navigate("boardDetail");
    window.setTimeout(() => {
      const form = qs("#boardWriteForm");
      qs("#boardDetail")?.classList.add("compose-mode");
      form.hidden = false;
      form.classList.add("full-page-compose", "compose-open");
      form.scrollIntoView({ behavior: "smooth", block: "start" });
      qs("#boardPostTitle")?.focus();
    }, 0);
    return;
  }

  const orderRecommendButton = event.target.closest("[data-open-order-recommend]");
  if (orderRecommendButton) {
    navigate("community");
    scrollToCommunitySection("orderRecommend");
    return;
  }

  const boardButton = event.target.closest("[data-board-id]");
  if (boardButton) {
    state.activeBoardId = boardButton.dataset.boardId;
    state.activePostId = activeBoard().posts[0]?.id || "";
    navigate("boardDetail");
    return;
  }

  const activityButton = event.target.closest("[data-activity-id]");
  if (activityButton) {
    state.activeActivityId = activityButton.dataset.activityId;
    navigate("activityDetail");
    return;
  }

  const postButton = event.target.closest("[data-post-id]");
  if (postButton) {
    state.activePostId = postButton.dataset.postId;
    navigate("postDetail");
    return;
  }

  if (event.target.closest("[data-like-activity]")) {
    if (!likeOnce("activity", activeActivity().id)) { toast("공감은 한 게시물에 한 번만 할 수 있어요."); return; }
    activeActivity().likes += 1;
    renderActivityDetail();
    return;
  }

  if (event.target.closest("[data-like-post]")) {
    if (!likeOnce("post", activePost().id)) { toast("공감은 한 게시물에 한 번만 할 수 있어요."); return; }
    activePost().likes += 1;
    renderPostDetail();
    return;
  }

  if (event.target.closest("[data-focus-activity-comment]")) {
    qs("#activityCommentInput")?.focus();
    return;
  }

  if (event.target.closest("[data-focus-post-comment]")) {
    qs("#postCommentInput")?.focus();
    return;
  }

  const replyButton = event.target.closest("[data-reply-comment]");
  if (replyButton) {
    const input = currentRoute() === "activityDetail" ? qs("#activityCommentInput") : qs("#postCommentInput");
    input.dataset.replyTo = replyButton.dataset.replyComment;
    input.dataset.replyCommentId = replyButton.dataset.replyCommentId || "";
    input.placeholder = `${replyButton.dataset.replyAlias}에게 답글 남기기`;
    input.focus();
    return;
  }

  if (event.target.closest("[data-download-activity-script]")) {
    const activity = activeActivity();
    const script = `${activity.title}\n\n추천 인원: ${activity.people}\n진행 시간: ${activity.time}\n\n진행 방법\n${activity.detail}\n\n준비 및 주의사항\n${activity.note}`;
    const url = URL.createObjectURL(new Blob([script], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = `${activity.title}-진행대본.txt`; link.click();
    URL.revokeObjectURL(url);
    return;
  }

  if (event.target.closest("[data-open-recreation-form]")) {
    qs("#activitySubmitTitle")?.focus();
    qs("#activitySubmitForm")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  const productButton = event.target.closest("[data-product-id]");
  if (productButton) {
    const found = findProduct(productButton.dataset.productId);
    if (found) {
      state.selectedProduct = found.product;
      state.selectedStore = found.store;
      navigate("productDetail");
    }
    return;
  }

  const addButton = event.target.closest("[data-add-product]");
  if (addButton) {
    addToCart(addButton.dataset.addProduct, 1);
    return;
  }

  const addMtShoppingButton = event.target.closest("[data-add-mt-shopping]");
  if (addMtShoppingButton || event.target.closest("[data-add-current-to-mt]")) {
    if (state.mtProjectMode !== "detail") {
      toast("먼저 내 MT에서 사용할 여행을 선택해주세요.");
      navigate("myMt");
      return;
    }
    const productId = addMtShoppingButton?.dataset.addMtShopping || state.selectedProduct?.id;
    const product = findProduct(productId)?.product || state.selectedProduct;
    if (!product) return;
    const qty = event.target.closest("[data-add-current-to-mt]") ? Math.max(1, Number(qs("#productQty")?.value || 1)) : 1;
    const existing = (state.mtProject.items || []).find((item) => item.item_kind === "shopping" && String(item.reference_id) === String(product.id));
    let saved = null;
    try {
      saved = await window.motfAddMtShoppingItem?.({ product_id: product.id, title: product.name, quantity: qty, amount: Number(product.price || 0) });
    } catch (error) { console.warn("MT 장보기 항목 저장 실패", error); }
    if (saved) {
      state.mtProject.items = (state.mtProject.items || []).filter((item) => !(item.item_kind === "shopping" && String(item.reference_id) === String(product.id)));
      state.mtProject.items.push(saved);
    } else if (existing) {
      state.mtProject.items = state.mtProject.items.map((item) => item === existing ? { ...item, quantity: Number(item.quantity || 1) + qty } : item);
    } else {
      state.mtProject.items = [...(state.mtProject.items || []), { id: `shopping-${product.id}-${Date.now()}`, item_kind: "shopping", reference_id: product.id, title: product.name, quantity: qty, amount: Number(product.price || 0), status: "planned" }];
    }
    toast("선택한 MT의 장보기 후보에 담았습니다.");
    return;
  }

  if (event.target.closest("[data-add-current]")) {
    const qty = Math.max(1, Number(qs("#productQty").value || 1));
    addToCart(state.selectedProduct.id, qty);
    return;
  }

  if (event.target.closest("[data-buy-current]")) {
    const qty = Math.max(1, Number(qs("#productQty").value || 1));
    addToCart(state.selectedProduct.id, qty);
    navigate("cart");
    return;
  }

  const qtyButton = event.target.closest("[data-qty-change]");
  if (qtyButton) {
    const input = qs("#productQty");
    input.value = Math.max(1, Number(input.value || 1) + Number(qtyButton.dataset.qtyChange));
    return;
  }

  const cartButton = event.target.closest("[data-cart-change]");
  if (cartButton) {
    const item = state.cart.find((row) => row.productId === cartButton.dataset.cartChange);
    if (item) {
      item.qty += Number(cartButton.dataset.delta);
      if (item.qty <= 0) state.cart = state.cart.filter((row) => row !== item);
      renderCart();
    }
    return;
  }

  const chatThread = event.target.closest("[data-chat-id]");
  if (chatThread) {
    state.activeChatId = chatThread.dataset.chatId;
    renderChat();
    return;
  }

  const tagButton = event.target.closest(".tag-chip");
  if (tagButton) {
    tagButton.classList.toggle("active");
    return;
  }

  const copyAccountButton = event.target.closest("[data-copy-account]");
  if (copyAccountButton) {
    const accountNumber = copyAccountButton.dataset.copyAccount;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(accountNumber).then(() => {
        toast("계좌번호를 복사했습니다.");
      }).catch(() => {
        toast(accountNumber);
      });
    } else {
      toast(accountNumber);
    }
    return;
  }

  const tossPaymentButton = event.target.closest("[data-toss-payment]");
  if (tossPaymentButton) {
    requestTossPayment();
    return;
  }

  const payChip = event.target.closest(".pay-chip");
  if (payChip) {
    const group = payChip.closest(".payment-methods");
    group.querySelectorAll(".pay-chip").forEach((chip) => chip.classList.remove("active"));
    payChip.classList.add("active");
    return;
  }

  const budgetButton = event.target.closest("[data-budget-file]");
  if (budgetButton) {
    window.motfOpenBudgetPreview?.(budgetButton.dataset.budgetFile);
    return;
  }

  if (event.target.closest("[data-selected-budget-file]")) {
    if (!state.selectedUsageIds.size) return;
    window.motfOpenBudgetPreview?.([...state.selectedUsageIds]);
    return;
  }

  if (event.target.closest("[data-mt-budget-export]")) {
    const exactId = state.mtProject?.final_reservation_id;
    const finalBusinessIds = new Set([
      state.mtProject?.final_business_id,
      ...(state.mtProject?.items || []).filter((item) => item.item_kind === "stay" && item.status !== "cancelled").map((item) => item.reference_id),
    ].filter(Boolean).map(String));
    const matchedIds = state.reservations
      .filter((item) => finalBusinessIds.has(String(item.businessId || "")))
      .filter((item) => !state.mtProject?.starts_on || String(item.date || "").slice(0, 10) === String(state.mtProject.starts_on).slice(0, 10))
      .map((item) => item.id);
    const exactIds = exactId && [...state.reservations, ...state.orders].some((item) => String(item.id) === String(exactId))
      ? [exactId]
      : matchedIds;
    if (exactIds.length) {
      window.motfOpenBudgetPreview?.(exactIds);
    } else {
      state.selectedUsageIds.clear();
      navigate("myUsage");
      toast("이 MT와 바로 연결된 이용 내역이 없어, 예결산에 넣을 내역을 직접 선택해주세요.");
    }
    return;
  }

  const setButton = event.target.closest("[data-set-products]");
  if (setButton) {
    const productIds = setButton.dataset.setProducts.split(",").filter(Boolean);
    productIds.forEach((productId) => addToCart(productId, 1));
    toast("추천 세트 구성을 장바구니에 담았습니다.");
    return;
  }
});

document.addEventListener("input", (event) => {
  if (event.target.matches('input[type="tel"], [data-phone-input]')) {
    event.target.value = formatPhone(event.target.value);
  }
  if (event.target.matches("[data-money-input]")) {
    event.target.value = formatMoneyInput(event.target.value);
  }
  if (event.target.matches("[data-stay-search-field]")) {
    applyStaySearchField(event.target.dataset.staySearchField, event.target.value);
    syncStaySearchPanel();
    if (currentRoute() === "stays") renderStays();
    if (currentRoute() === "booking") renderBooking();
    return;
  }
  if (event.target.matches("#stayPrice, #stayRegion, #stayPeople, #stayCheckInDate, #stayCheckOutDate, #stayMinRooms, #stayMinBaths")) {
    normalizeStaySearchDates();
    renderStays();
  }
  if (event.target.matches("#marketPeople")) renderStores();
  if (event.target.matches("#recommendPeople, #mealStyle")) renderCommunity();
  if (event.target.matches("#activityPeople, #activitySpace, #activityMood")) renderRecreation();
  if (event.target.matches("#reviewRatingRange")) {
    state.rating = Number(event.target.value || 10);
    renderReviews();
  }
  if (event.target.matches("#reviewTarget")) renderReviewKeywords();
  if (event.target.matches("[data-cart-input]")) {
    const item = state.cart.find((row) => row.productId === event.target.dataset.cartInput);
    if (item) {
      item.qty = Math.max(1, Number(event.target.value || 1));
      renderCart();
    }
  }
});

document.addEventListener("change", (event) => {
  if (event.target.matches("[data-usage-select]")) {
    const id = String(event.target.dataset.usageSelect);
    if (event.target.checked) state.selectedUsageIds.add(id);
    else state.selectedUsageIds.delete(id);
    const button = qs("[data-selected-budget-file]");
    if (button) {
      button.disabled = state.selectedUsageIds.size === 0;
      button.innerHTML = `<i data-lucide="file-spreadsheet"></i>${state.selectedUsageIds.size ? `${state.selectedUsageIds.size}건 예결산 생성` : "선택 내역 예결산"}`;
      refreshIcons();
    }
    return;
  }
  if (event.target.matches("[data-stay-search-field]")) {
    applyStaySearchField(event.target.dataset.staySearchField, event.target.value);
    syncStaySearchPanel();
    if (currentRoute() === "stays") renderStays();
    if (currentRoute() === "booking") renderBooking();
    return;
  }
  if (event.target.matches("#stayRegion, #stayCheckInDate, #stayCheckOutDate, [data-stay-filter], #stayMinRooms, #stayMinBaths")) {
    normalizeStaySearchDates();
    renderStays();
  }
  if (event.target.matches("#marketPeople")) renderStores();
  if (event.target.matches("#mealStyle")) renderCommunity();
  if (event.target.matches("#activityPeople, #activitySpace, #activityMood")) renderRecreation();
  if (event.target.matches("#reviewTarget")) renderReviewKeywords();
});

document.addEventListener("submit", (event) => {
  if (!event.target.matches("[data-home-stay-search]")) return;
  event.preventDefault();
  syncStaySearchPanel();
  navigate("stays");
});

document.addEventListener("click", (event) => {
  const closeButton = event.target.closest("[data-close-motf-dialog]");
  if (closeButton) closeButton.closest("dialog")?.close();
});

qs("#mtProjectForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {
    title: qs("#mtEditTitle").value.trim(),
    organization_name: qs("#mtEditOrganization").value.trim() || null,
    starts_on: qs("#mtEditStart").value,
    ends_on: qs("#mtEditEnd").value,
    guest_count: Number(qs("#mtEditPeople").value),
    region: qs("#mtEditRegion").value.trim(),
    estimated_budget: Math.max(0, parseMoneyInput(qs("#mtEditBudget").value)),
  };
  if (payload.ends_on <= payload.starts_on) return toast("종료일은 시작일보다 뒤여야 합니다.");
  try {
    const creating = event.target.dataset.mode === "create";
    const saved = creating ? await window.motfCreateMtProject?.(payload) : await window.motfSaveMtProject?.(payload);
    state.mtProject = { ...(creating ? { items: [], itinerary: [], notices: [] } : state.mtProject), ...(saved || payload) };
    const existingIndex = state.mtProjects.findIndex((project) => String(project.id) === String(state.mtProject.id));
    if (existingIndex >= 0) state.mtProjects[existingIndex] = state.mtProject;
    else state.mtProjects.unshift(state.mtProject);
    state.mtProjectMode = "detail";
    qs("#mtProjectDialog").close();
    renderMyMt();
    toast(creating ? "새 MT가 만들어졌습니다." : "MT 정보가 저장되었습니다.");
  } catch (error) { toast(error.message || "MT 정보를 저장하지 못했습니다."); }
});

qs("#mtItineraryForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = { starts_at: new Date(qs("#mtItineraryTime").value).toISOString(), title: qs("#mtItineraryTitle").value.trim(), place: qs("#mtItineraryPlace").value.trim() || null, note: qs("#mtItineraryNote").value.trim() || null };
  try {
    const saved = await window.motfAddMtItinerary?.(payload) || payload;
    state.mtProject.itinerary = [...(state.mtProject.itinerary || []), saved].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
    event.target.reset();
    qs("#mtItineraryDialog").close();
    renderMyMt();
    toast("일정이 추가되었습니다.");
  } catch (error) { toast(error.message || "일정을 추가하지 못했습니다."); }
});

qs("#mtNoticeForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = { title: qs("#mtNoticeTitle").value.trim(), notice_date: qs("#mtNoticeDate").value, body: qs("#mtNoticeBody").value.trim(), is_pinned: qs("#mtNoticePinned").checked };
  try {
    const saved = await window.motfAddMtNotice?.(payload) || payload;
    state.mtProject.notices = [saved, ...(state.mtProject.notices || [])];
    event.target.reset();
    qs("#mtNoticeDialog").close();
    renderMyMt();
    toast("공지가 등록되었습니다.");
  } catch (error) { toast(error.message || "공지를 등록하지 못했습니다."); }
});

qs("#bookingForm").addEventListener("submit", (event) => {
  event.preventDefault();
  toast("결제 준비 모듈을 불러오지 못했습니다. 페이지를 새로고침해주세요.");
});

qs("#orderForm").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!state.cart.length) {
    toast("장바구니가 비어 있습니다.");
    return;
  }
  toast("결제 준비 모듈을 불러오지 못했습니다. 페이지를 새로고침해주세요.");
});

qs("#chatForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = qs("#chatText");
  const attachmentInput = qs("#chatAttachment");
  const text = input.value.trim();
  const attachments = attachmentInput?.files ? [...attachmentInput.files].map((file) => file.name) : [];
  if (!text && !attachments.length) return;
  const thread = state.chats.find((item) => item.id === state.activeChatId);
  thread.messages.push({ from: "user", text, attachments, read: false });
  input.value = "";
  if (attachmentInput) attachmentInput.value = "";
  renderChat();
  const messages = qs("#chatMessages");
  messages.scrollTop = messages.scrollHeight;
});

qs("#activitySubmitForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const title = qs("#activitySubmitTitle").value.trim();
  if (!title) {
    toast("레크레이션 제목을 입력해주세요.");
    return;
  }
  if (typeof window.motfSubmitRecreation === "function") {
    window.motfSubmitRecreation(event.target);
    return;
  }
  const spaceText = qs("#activitySubmitSpace").value;
  activities.unshift({
    id: `activity-${Date.now()}`,
    title,
    people: qs("#activitySubmitPeople").value.trim() || "인원 자유",
    peopleGroup: "medium",
    space: spaceText === "야외" ? "outdoor" : spaceText === "공간 무관" ? "any" : "indoor",
    mood: "icebreak",
    time: "추천 등록",
    note: qs("#activitySubmitNote").value.trim() || "이용자 추천 레크레이션",
    media: "이용자 첨부 가능",
    image: photo("photo-1529156069898-49953e39b3ac"),
    likes: 0,
    comments: [],
    detail: qs("#activitySubmitNote").value.trim() || "이용자가 새로 추천한 레크레이션입니다.",
  });
  event.target.reset();
  renderRecreation();
  toast("레크레이션 추천이 관리자 검토 대상으로 접수되었습니다.");
});

qs("#boardWriteForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const selectedBoardId = qs("#boardPostBoard").value;
  const board = communityBoards.find((item) => item.id === selectedBoardId) || activeBoard();
  state.activeBoardId = board.id;
  const title = qs("#boardPostTitle").value.trim();
  const body = qs("#boardPostBody").value.trim();
  if (!title || !body) return;
  if (typeof window.motfSubmitCommunityPost === "function") {
    window.motfSubmitCommunityPost(event.target, { boardId: selectedBoardId, title, body });
    return;
  }
  const post = {
    id: `post-${Date.now()}`,
    title,
    body,
    likes: 0,
    comments: [],
    media: "첨부 가능",
    authorId: communityActorId(),
    createdAt: new Date().toISOString(),
  };
  board.posts.unshift(post);
  state.activePostId = post.id;
  renderBoardDetail();
  event.target.hidden = true;
  qs("#boardDetail")?.classList.remove("compose-mode");
  toast("익명 게시글이 등록되었습니다.");
});

qs("#activityCommentForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = qs("#activityCommentInput");
  const text = input.value.trim();
  if (!text) return;
  activeActivity().comments.push({ body: text, userId: communityActorId(), replyTo: input.dataset.replyTo || null, createdAt: new Date().toISOString() });
  input.value = "";
  delete input.dataset.replyTo;
  delete input.dataset.replyCommentId;
  input.placeholder = "익명 댓글을 입력하세요";
  renderActivityDetail();
});

qs("#postCommentForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = qs("#postCommentInput");
  const text = input.value.trim();
  if (!text) return;
  activePost().comments.push({ body: text, userId: communityActorId(), replyTo: input.dataset.replyTo || null, createdAt: new Date().toISOString() });
  input.value = "";
  delete input.dataset.replyTo;
  delete input.dataset.replyCommentId;
  input.placeholder = "익명 댓글을 입력하세요";
  renderPostDetail();
});

qs("#reviewForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (window.motfSubmitVerifiedReview) {
    await window.motfSubmitVerifiedReview(event.target);
    return;
  }
  const activeTags = qsa(".tag-chip.active").map((tag) => tag.textContent);
  state.reviews.unshift({
    target: qs("#reviewTarget").value,
    score: state.rating,
    tags: activeTags,
    text: qs("#reviewText").value,
    author: "내 MT 팀",
  });
  qs("#reviewText").value = "";
  renderReviews();
  toast("후기가 등록되었습니다.");
});

qsa(".brand").forEach((brand) => {
  brand.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") navigate("home");
  });
});

function updatePhotoGallery() {
  const image = qs("#photoGalleryImage");
  const caption = qs("#photoGalleryCaption");
  if (!image || !state.gallery.images.length) return;
  state.gallery.index = (state.gallery.index + state.gallery.images.length) % state.gallery.images.length;
  image.src = state.gallery.images[state.gallery.index];
  caption.textContent = `${state.gallery.alt} · ${state.gallery.index + 1} / ${state.gallery.images.length}`;
}

document.addEventListener("click", (event) => {
  const mtFilter = event.target.closest("[data-mt-directory-filter]");
  if (mtFilter) {
    state.mtDirectoryFilter = mtFilter.dataset.mtDirectoryFilter;
    renderMyMt();
    return;
  }
  if (event.target.closest("[data-join-mt-invite]")) {
    const code = window.prompt("받은 초대코드를 입력해주세요.", "")?.trim();
    if (!code) return;
    window.motfAcceptMtInvite?.(code).then((projectId) => {
      state.mtDirectoryFilter = "invited";
      renderMyMt();
      toast("초대받은 MT에 참여했습니다.");
      if (projectId) window.motfSelectMtProject?.(projectId);
    }).catch((error) => toast(error.message || "초대코드를 확인해주세요."));
    return;
  }
  if (event.target.closest("[data-invite-mt-companion]")) {
    window.motfCreateMtInvite?.().then(async (code) => {
      const link = `${window.location.origin}/my-mt?invite=${encodeURIComponent(code)}`;
      try { await navigator.clipboard.writeText(link); toast("7일 동안 유효한 초대 링크를 복사했습니다."); }
      catch { window.prompt("아래 초대 링크를 전달해주세요.", link); }
    }).catch((error) => toast(error.message || "초대 링크를 만들지 못했습니다."));
    return;
  }
  const eventCardButton = event.target.closest("[data-event-id]");
  if (eventCardButton) {
    state.selectedEvent = state.platformEvents.find((item) => String(item.id) === String(eventCardButton.dataset.eventId)) || null;
    navigate("eventDetail");
    return;
  }
  const eventFilterButton = event.target.closest("[data-event-filter]");
  if (eventFilterButton) {
    state.eventFilter = eventFilterButton.dataset.eventFilter;
    qsa("[data-event-filter]").forEach((button) => button.classList.toggle("active", button === eventFilterButton));
    renderEvents();
    return;
  }
  const galleryButton = event.target.closest("[data-open-gallery]");
  if (galleryButton) {
    state.gallery.index = Number(galleryButton.dataset.openGallery || 0);
    updatePhotoGallery();
    qs("#photoGalleryDialog")?.showModal();
    refreshIcons();
    return;
  }
  const galleryMove = event.target.closest("[data-gallery-move]");
  if (galleryMove) {
    state.gallery.index += Number(galleryMove.dataset.galleryMove || 0);
    updatePhotoGallery();
    return;
  }
  if (event.target.closest("[data-close-photo-gallery]")) {
    qs("#photoGalleryDialog")?.close();
    return;
  }
  const instagram = event.target.closest("[data-social-instagram]");
  if (instagram) {
    const url = instagram.dataset.url;
    if (!url) {
      event.preventDefault();
      toast("공식 인스타그램 주소를 운영자 화면에서 등록해주세요.");
    } else instagram.href = url;
  }
});

window.addEventListener("popstate", () => {
  if (appHistoryDepth > 0) appHistoryDepth -= 1;
  routeHistory.pop();
  navigate(routeFromLocation(), { record: false, updateHistory: false });
});

(async function boot() {
  preservePendingMtInvite();
  // DB 연결 전 데모 숙소도 1차 운영 지역인 가평 목록에 함께 표시합니다.
  stays = stays.map((stay) => ({ ...stay, region: normalizeStayRegion(stay.region, stay.distance) }));
  initializeStaySearchDefaults();
  try {
    await loadPaymentConfig();
    const handledPaymentRedirect = await handleTossRedirect();
    if (!handledPaymentRedirect) navigate(routeFromLocation(), { record: false, replace: true });
    updateCartBadge();
    refreshIcons();
  } catch (error) {
    console.warn("결제 설정을 불러오지 못했습니다.", error);
  }
})();
