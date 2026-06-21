"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import DashboardIcon from "@/components/DashboardIcon";

type Menu = "calendar" | "reservations" | "chat" | "revenue" | "mypage";
type Business = { id: string; business_name: string; business_type: string; representative_name: string; phone: string | null; address: string | null; description: string | null; };
type Reservation = { id: string; customer_name: string; group_name: string | null; event_date: string; guest_count: number | null; offering_name: string; total_amount: number; status: string; reject_reason: string | null; };
type Conversation = { id: string; customer_name: string; group_name: string | null; last_message_at: string; };
type Message = { id: string; sender_id: string; sender_role: string; body: string; read_at: string | null; created_at: string; };

const statusLabel: Record<string, string> = { pending: "확정 대기", confirmed: "예약 확정", rejected: "거절", cancelled: "취소", completed: "이용 완료" };

export default function PartnerDashboard({ supabase, profileName, onLogout }: { supabase: SupabaseClient; profileName: string; onLogout: () => void; }) {
  const [menu, setMenu] = useState<Menu>("calendar");
  const [business, setBusiness] = useState<Business | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
  const [reservationFilter, setReservationFilter] = useState("pending");

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setNotice("");
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    const { data: businessData, error: businessError } = await supabase.from("businesses").select("id, business_name, business_type, representative_name, phone, address, description").eq("owner_id", userData.user.id).maybeSingle();
    if (businessError || !businessData) {
      setNotice("업장 정보를 불러오지 못했습니다.");
      setLoading(false);
      return;
    }
    setBusiness(businessData);
    const [{ data: reservationData, error: reservationError }, { data: conversationData }] = await Promise.all([
      supabase.from("reservations").select("id, customer_name, group_name, event_date, guest_count, offering_name, total_amount, status, reject_reason").eq("business_id", businessData.id).order("event_date"),
      supabase.from("conversations").select("id, customer_name, group_name, last_message_at").eq("business_id", businessData.id).order("last_message_at", { ascending: false }),
    ]);
    if (reservationError) setNotice("2단계 데이터베이스 SQL을 먼저 적용해 주세요.");
    setReservations(reservationData || []);
    setConversations(conversationData || []);
    if (conversationData?.[0]) setSelectedConversation((current) => current || conversationData[0].id);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { void loadDashboard(); }, [loadDashboard]);

  useEffect(() => {
    if (!selectedConversation) { setMessages([]); return; }
    const loadMessages = async () => {
      const { data } = await supabase.from("messages").select("id, sender_id, sender_role, body, read_at, created_at").eq("conversation_id", selectedConversation).order("created_at");
      setMessages(data || []);
      await supabase.rpc("mark_conversation_read", { target_conversation_id: selectedConversation });
    };
    void loadMessages();
    const channel = supabase.channel(`partner-chat-${selectedConversation}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${selectedConversation}` }, loadMessages)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [selectedConversation, supabase]);

  const revenue = useMemo(() => reservations.filter((item) => ["confirmed", "completed"].includes(item.status)).reduce((sum, item) => sum + item.total_amount, 0), [reservations]);
  const pendingCount = reservations.filter((item) => item.status === "pending").length;
  const filteredReservations = reservations.filter((item) => reservationFilter === "all" ? true : item.status === reservationFilter);
  const calendarCells = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();
    return [...Array(firstWeekday).fill(null), ...Array.from({ length: lastDate }, (_, index) => index + 1)];
  }, [calendarMonth]);

  async function changeReservationStatus(id: string, status: "confirmed" | "rejected") {
    const reason = status === "rejected" ? window.prompt("거절 사유를 입력해 주세요.") : null;
    if (status === "rejected" && !reason?.trim()) return;
    const { error } = await supabase.rpc("set_reservation_status", { target_reservation_id: id, new_status: status, reason: reason?.trim() || null });
    if (error) setNotice(error.message); else await loadDashboard();
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedConversation) return;
    const form = event.currentTarget;
    const body = String(new FormData(form).get("message") || "").trim();
    if (!body) return;
    const { error } = await supabase.rpc("send_chat_message", {
      target_conversation_id: selectedConversation,
      message_body: body,
    });
    if (error) setNotice(error.message);
    else {
      form.reset();
      const { data } = await supabase.from("messages").select("id, sender_id, sender_role, body, read_at, created_at").eq("conversation_id", selectedConversation).order("created_at");
      setMessages(data || []);
    }
  }

  async function saveBusiness(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!business) return;
    const form = new FormData(event.currentTarget);
    const { error } = await supabase.from("businesses").update({ business_name: String(form.get("businessName")), representative_name: String(form.get("representativeName")), phone: String(form.get("phone")), address: String(form.get("address")), description: String(form.get("description")) }).eq("id", business.id);
    setNotice(error ? error.message : "업장 정보가 저장되었습니다.");
    if (!error) loadDashboard();
  }

  const menuItems: { id: Menu; label: string; icon: string }[] = [
    { id: "calendar", label: "캘린더", icon: "calendar" }, { id: "reservations", label: "예약 관리", icon: "reservations" }, { id: "chat", label: "채팅 문의", icon: "chat" }, { id: "revenue", label: "매출 관리", icon: "revenue" }, { id: "mypage", label: "마이페이지", icon: "mypage" },
  ];

  return <main className="dashboard-page">
    <aside className="dashboard-sidebar">
      <div className="dashboard-sidebar-header"><div className="dashboard-logo">moTF</div><div className="dashboard-owner">{business?.business_name || profileName} 님 홈</div></div>
      <nav>{menuItems.map((item) => <button key={item.id} className={menu === item.id ? "active" : ""} onClick={() => setMenu(item.id)}><DashboardIcon name={item.icon}/>{item.label}{item.id === "reservations" && pendingCount > 0 && <b>{pendingCount}</b>}</button>)}</nav>
    </aside>
    <section className="dashboard-content">
      <header className="dashboard-top"><button className="top-mypage-button" onClick={() => setMenu("mypage")}>○ 마이페이지</button></header>
      <div className="dashboard-body">
        {notice && <div className="dashboard-notice">{notice}</div>}
        {loading ? <div className="empty-panel">데이터를 불러오는 중입니다...</div> : <>
          {menu === "calendar" && <section><h2 className="owner-panel-title">월간 스케줄 현황</h2><div className="owner-calendar-controls"><button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}>‹ 이전 달</button><h3>{calendarMonth.getFullYear()}년 {calendarMonth.getMonth() + 1}월</h3><button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}>다음 달 ›</button></div><div className="owner-calendar-layout"><div className="owner-calendar-grid">{["일","월","화","수","목","금","토"].map((day) => <div className="owner-day-label" key={day}>{day}</div>)}{calendarCells.map((day, index) => <div className={`owner-calendar-cell ${day ? "" : "blank"}`} key={`${day}-${index}`}>{day && <><div className="owner-date-num">{day}</div>{reservations.filter((item) => { const date = new Date(`${item.event_date}T00:00:00`); return date.getFullYear() === calendarMonth.getFullYear() && date.getMonth() === calendarMonth.getMonth() && date.getDate() === day && item.status !== "rejected" && item.status !== "cancelled"; }).map((item) => <button key={item.id} className={`owner-cal-badge ${item.status === "confirmed" ? "confirm" : "pending"}`} onClick={() => setSelectedReservation(item)}>{item.customer_name} ({item.status === "confirmed" ? "확정" : "대기"})</button>)}</>}</div>)}</div><aside className="owner-calendar-detail"><h4>ⓘ 일별 상세 정보</h4>{selectedReservation ? <div className="owner-calendar-detail-body"><strong>{selectedReservation.customer_name}</strong><p>📅 {selectedReservation.event_date}</p><p>🎯 {selectedReservation.offering_name}</p><p>👥 {selectedReservation.guest_count || "-"}명</p><b>💵 {selectedReservation.total_amount.toLocaleString()}원</b><span>{statusLabel[selectedReservation.status]}</span></div> : <p>캘린더의 예약자 배너를 클릭하시면 해당 일자 예약 데이터 정보가 표시됩니다.</p>}</aside></div></section>}
          {menu === "reservations" && <section><h2 className="owner-panel-title">예약 및 승인 관리</h2><div className="owner-tabs">{[["pending","확정 대기"],["confirmed","예약 확정"],["completed","지난 예약"],["rejected","거절한 예약"]].map(([id,label]) => <button key={id} className={reservationFilter === id ? "active" : ""} onClick={() => setReservationFilter(id)}>{label}</button>)}</div>{filteredReservations.length ? <div className="reservation-list">{filteredReservations.map((item) => <article key={item.id}><div><h3>{item.customer_name}</h3><p>날짜: {item.event_date} | 대상 항목: {item.offering_name} | 금액: {item.total_amount.toLocaleString()}원</p>{item.reject_reason && <small>거절 사유: {item.reject_reason}</small>}</div>{item.status === "pending" && <div><button className="owner-pill-button approve" onClick={() => changeReservationStatus(item.id, "confirmed")}>확정하기</button><button className="owner-pill-button reject" onClick={() => changeReservationStatus(item.id, "rejected")}>거절하기</button></div>}</article>)}</div> : <Empty text="해당 내역이 존재하지 않습니다." />}</section>}
          {menu === "chat" && <div className="chat-panel"><div className="chat-people">{conversations.length ? conversations.map((item) => <button className={selectedConversation === item.id ? "active" : ""} key={item.id} onClick={() => setSelectedConversation(item.id)}><strong>{item.customer_name}</strong><small>{item.group_name || "이용자 문의"}</small></button>) : <Empty text="진행 중인 채팅이 없습니다." />}</div><div className="chat-room">{selectedConversation ? <><div className="message-list">{messages.map((item) => <div key={item.id} className={item.sender_role === "partner" ? "message mine" : "message"}>{item.body}<small>{new Date(item.created_at).toLocaleString("ko-KR")}{item.sender_role === "partner" ? ` · ${item.read_at ? "읽음" : "안읽음"}` : ""}</small></div>)}</div><form onSubmit={sendMessage}><input name="message" placeholder="메시지를 입력하세요" autoComplete="off" /><button>전송</button></form></> : <Empty text="대화를 선택해 주세요." />}</div></div>}
          {menu === "revenue" && <section><h2 className="owner-panel-title">종합 매출 데이터</h2><div className="owner-stats-grid"><div><span>이번 달 총 매출액</span><strong>{revenue.toLocaleString()}원</strong></div><div><span>총 정산 금액</span><strong>{Math.floor(revenue * (business?.business_type === "market" ? .95 : .93)).toLocaleString()}원</strong></div><div><span>정산 완료 금액</span><strong>0원</strong></div><div><span>정산 예정 금액</span><strong>{Math.floor(revenue * (business?.business_type === "market" ? .95 : .93)).toLocaleString()}원</strong></div></div><div className="owner-revenue-layout"><nav><button className="active">💡 순수익 계산기</button><button>기간별 매출 조회</button><button>항목/객실별 매출</button><button>매출 변동 추이</button></nav><div className="panel-card"><h2>실시간 모티프 순수익 산출</h2><p className="muted-copy">확정 및 이용 완료 예약을 기준으로 자동 계산됩니다.</p></div></div></section>}
          {menu === "mypage" && business && <section><div className="owner-mypage-heading"><h2 className="owner-panel-title">정보 수정 및 미리보기</h2><button onClick={onLogout}>로그아웃</button></div><h3>💻 서비스 제공 유저화면 미리보기 연동</h3><div className="owner-preview"><h4>{business.business_name}</h4><p>{business.description || "업장 소개 문구를 입력해 주세요."}</p></div><h3>⚙️ 데이터 상세 편집</h3><div className="panel-card narrow-card"><form className="business-form" onSubmit={saveBusiness}><label>업장명<input name="businessName" defaultValue={business.business_name} required /></label><label>대표자명<input name="representativeName" defaultValue={business.representative_name} required /></label><label>연락처<input name="phone" defaultValue={business.phone || ""} /></label><label>주소<input name="address" defaultValue={business.address || ""} /></label><label>소개 문구<textarea name="description" rows={5} defaultValue={business.description || ""} /></label><button className="primary-button">변경사항 저장하기</button></form></div></section>}
        </>}
      </div>
    </section>
  </main>;
}

function Empty({ text }: { text: string }) { return <div className="dashboard-empty">{text}</div>; }
