"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import DashboardIcon from "@/components/DashboardIcon";

type Menu = "stats" | "partners" | "chats" | "cases" | "reservations" | "content" | "revenue" | "settlement";
// 여러 관리자 테이블을 한 화면에서 합쳐 보여주는 과도기 공통 행 타입이다.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const reservationLabel: Record<string,string> = { pending:"확정 대기", confirmed:"예약 확정", rejected:"거절", cancelled:"취소", completed:"이용 완료" };

export default function AdminDashboard({ supabase, onLogout }: { supabase: SupabaseClient; onLogout: () => void }) {
  const [menu, setMenu] = useState<Menu>("stats");
  const [businesses, setBusinesses] = useState<Row[]>([]);
  const [profiles, setProfiles] = useState<Row[]>([]);
  const [reservations, setReservations] = useState<Row[]>([]);
  const [conversations, setConversations] = useState<Row[]>([]);
  const [cases, setCases] = useState<Row[]>([]);
  const [reviews, setReviews] = useState<Row[]>([]);
  const [posts, setPosts] = useState<Row[]>([]);
  const [selectedBusiness, setSelectedBusiness] = useState("");
  const [selectedConversation, setSelectedConversation] = useState("");
  const [messages, setMessages] = useState<Row[]>([]);
  const [notice, setNotice] = useState("");
  const [contentTab, setContentTab] = useState<"reviews"|"posts">("reviews");

  const loadAll = useCallback(async () => {
    setNotice("");
    const [businessResult, profileResult, reservationResult, conversationResult, caseResult, reviewResult, postResult] = await Promise.all([
      supabase.from("businesses").select("*").order("created_at", { ascending:false }),
      supabase.from("profiles").select("id,email,full_name,phone,role,status,created_at").order("created_at", { ascending:false }),
      supabase.from("reservations").select("*").order("created_at", { ascending:false }),
      supabase.from("conversations").select("*").order("last_message_at", { ascending:false }),
      supabase.from("support_cases").select("*").order("created_at", { ascending:false }),
      supabase.from("reviews").select("*").order("created_at", { ascending:false }),
      supabase.from("community_posts").select("*").order("created_at", { ascending:false }),
    ]);
    setBusinesses(businessResult.data || []); setProfiles(profileResult.data || []); setReservations(reservationResult.data || []); setConversations(conversationResult.data || []); setCases(caseResult.data || []); setReviews(reviewResult.data || []); setPosts(postResult.data || []);
    if (businessResult.data?.[0]) setSelectedBusiness((current) => current || businessResult.data[0].id);
  }, [supabase]);

  useEffect(() => { void loadAll(); }, [loadAll]);
  useEffect(() => {
    if (!selectedConversation) { setMessages([]); return; }
    supabase.from("messages").select("*").eq("conversation_id", selectedConversation).order("created_at").then(({data}) => setMessages(data || []));
  }, [selectedConversation, supabase]);

  const partnerProfiles = useMemo(() => profiles.filter((profile) => profile.role === "partner"), [profiles]);
  const totalRevenue = reservations.filter((item) => ["confirmed","completed"].includes(item.status)).reduce((sum,item) => sum + item.total_amount, 0);
  const businessName = (id:string) => businesses.find((item) => item.id === id)?.business_name || "업장 정보 없음";

  async function reviewPartner(ownerId:string, decision:"approved"|"rejected") {
    const reason = decision === "rejected" ? window.prompt("거절 사유를 입력해 주세요.") : null;
    if (decision === "rejected" && !reason?.trim()) return;
    const { error } = await supabase.rpc("review_partner_application", { target_user_id:ownerId, decision, reason:reason?.trim() || null });
    setNotice(error ? error.message : "가입 심사 상태를 변경했습니다."); await loadAll();
  }
  async function setReservation(id:string, status:"confirmed"|"rejected") {
    const reason = status === "rejected" ? window.prompt("운영팀 거절 사유를 입력해 주세요.") : null;
    if (status === "rejected" && !reason?.trim()) return;
    const { error } = await supabase.rpc("set_reservation_status", { target_reservation_id:id, new_status:status, reason:reason?.trim() || null });
    setNotice(error ? error.message : "운영팀에서 예약 상태를 변경했습니다."); await loadAll();
  }
  async function updateCase(id:string, status:string) { const {error}=await supabase.rpc("review_support_case", { target_case_id:id, new_status:status, note:null }); setNotice(error?error.message:"문의 상태를 변경했습니다."); await loadAll(); }
  async function toggleContent(table:"reviews"|"community_posts", id:string, hidden:boolean) { const {error}=await supabase.from(table).update({is_hidden:!hidden}).eq("id",id); setNotice(error?error.message:"공개 상태를 변경했습니다."); await loadAll(); }

  const menuItems:{id:Menu,label:string,icon:string}[]=[
    {id:"stats",label:"플랫폼 종합 현황",icon:"stats"},{id:"partners",label:"가입 회원 & 업장 관리",icon:"partners"},{id:"chats",label:"전체 채팅 모니터링",icon:"chat"},{id:"cases",label:"문의 & 분쟁 관리",icon:"cases"},{id:"reservations",label:"예약 관리",icon:"reservations"},{id:"content",label:"리뷰 & 커뮤니티",icon:"content"},{id:"revenue",label:"본사 매출 분석",icon:"revenue"},{id:"settlement",label:"대금 정산 센터",icon:"settlement"},
  ];
  const chatsForBusiness=conversations.filter((item)=>!selectedBusiness||item.business_id===selectedBusiness);

  return <main className="dashboard-page admin-dashboard">
    <aside className="dashboard-sidebar"><div className="dashboard-sidebar-header"><div className="dashboard-logo">moTF</div><div className="dashboard-owner">모티프 본사 총관리자</div></div><nav>{menuItems.map((item)=><button key={item.id} className={menu===item.id?"active":""} onClick={()=>setMenu(item.id)}><DashboardIcon name={item.icon}/>{item.label}</button>)}</nav></aside>
    <section className="dashboard-content"><header className="dashboard-top"><button className="admin-logout-button" onClick={onLogout}>로그아웃</button></header><div className="dashboard-body">{notice&&<div className="dashboard-notice">{notice}</div>}
      {menu==="stats"&&<section><h2 className="owner-panel-title">moTF 플랫폼 마스터 실시간 종합 현황</h2><div className="owner-stats-grid"><Stat label="가입 파트너" value={`${partnerProfiles.length}명`}/><Stat label="입점 심사 대기" value={`${partnerProfiles.filter((p)=>p.status==="pending").length}건`}/><Stat label="플랫폼 누적 거래액" value={`${totalRevenue.toLocaleString()}원`}/><Stat label="본사 예상 수수료" value={`${Math.floor(totalRevenue*.06).toLocaleString()}원`}/></div><AdminTable headers={["업장","예약자","이용일","금액","상태"]} rows={reservations.slice(0,10).map((r)=><tr key={r.id}><td>{businessName(r.business_id)}</td><td>{r.customer_name}</td><td>{r.event_date}</td><td>{r.total_amount.toLocaleString()}원</td><td><Badge text={reservationLabel[r.status]}/></td></tr>)}/></section>}
      {menu==="partners"&&<section><h2 className="owner-panel-title">전체 가입 유저 및 파트너 업장 관리</h2><AdminTable headers={["업장명","유형","대표자","이메일","심사 상태","관리"]} rows={businesses.map((b)=>{const p=profiles.find((x)=>x.id===b.owner_id);return <tr key={b.id}><td><strong>{b.business_name}</strong></td><td>{b.business_type==="stay"?"숙소":"공판장"}</td><td>{b.representative_name}</td><td>{p?.email||"-"}</td><td><Badge text={p?.status||b.approval_status}/></td><td>{p?.status==="pending"&&<div className="table-actions"><button className="approve-button" onClick={()=>reviewPartner(b.owner_id,"approved")}>승인</button><button className="reject-button" onClick={()=>reviewPartner(b.owner_id,"rejected")}>거절</button></div>}</td></tr>})}/></section>}
      {menu==="chats"&&<section><h2 className="owner-panel-title">사장님별 전체 채팅 모니터링</h2><div className="master-chat-grid"><div className="master-business-list">{businesses.map((b)=><button key={b.id} className={selectedBusiness===b.id?"active":""} onClick={()=>{setSelectedBusiness(b.id);setSelectedConversation("");}}><strong>{b.business_name}</strong><small>채팅 {conversations.filter((c)=>c.business_id===b.id).length}건</small></button>)}</div><div className="chat-panel"><div className="chat-people">{chatsForBusiness.map((c)=><button key={c.id} className={selectedConversation===c.id?"active":""} onClick={()=>setSelectedConversation(c.id)}><strong>{c.customer_name}</strong><small>{c.group_name||"이용자 문의"}</small></button>)}</div><div className="chat-room"><div className="message-list">{messages.map((m)=><div key={m.id} className={`message ${m.sender_role==="partner"?"mine":""}`}>{m.body}<small>{new Date(m.created_at).toLocaleString("ko-KR")}</small></div>)}</div><div className="monitor-note">운영팀 읽기 전용 모니터링</div></div></div></div></section>}
      {menu==="cases"&&<section><h2 className="owner-panel-title">플랫폼 문의 및 분쟁 관리</h2>{cases.length?<AdminTable headers={["유형","제목","관련 업장","접수일","상태"]} rows={cases.map((c)=><tr key={c.id}><td>{c.case_type==="dispute"?"분쟁":"문의"}</td><td><strong>{c.title}</strong><small className="table-subcopy">{c.body}</small></td><td>{businessName(c.business_id)}</td><td>{new Date(c.created_at).toLocaleDateString("ko-KR")}</td><td><select value={c.status} onChange={(e)=>updateCase(c.id,e.target.value)}><option value="received">접수</option><option value="processing">처리 중</option><option value="resolved">완료</option></select></td></tr>)}/>:<Empty text="접수된 문의·분쟁이 없습니다. 3단계 SQL 적용 후 실데이터가 표시됩니다."/>}</section>}
      {menu==="reservations"&&<section><h2 className="owner-panel-title">운영팀 예약 관리</h2>{reservations.length?<div className="reservation-list">{reservations.map((r)=><article key={r.id}><div><small>{businessName(r.business_id)}</small><h3>{r.customer_name}</h3><p>{r.event_date} | {r.offering_name} | {r.total_amount.toLocaleString()}원</p></div>{r.status==="pending"?<div><button className="owner-pill-button approve" onClick={()=>setReservation(r.id,"confirmed")}>운영팀 확정</button><button className="owner-pill-button reject" onClick={()=>setReservation(r.id,"rejected")}>운영팀 거절</button></div>:<Badge text={reservationLabel[r.status]}/>}</article>)}</div>:<Empty text="등록된 예약이 없습니다."/>}</section>}
      {menu==="content"&&<section><h2 className="owner-panel-title">리뷰 및 커뮤니티 관리</h2><div className="owner-tabs"><button className={contentTab==="reviews"?"active":""} onClick={()=>setContentTab("reviews")}>이용자 리뷰</button><button className={contentTab==="posts"?"active":""} onClick={()=>setContentTab("posts")}>커뮤니티 게시글</button></div><div className="moderation-grid">{contentTab==="reviews"?reviews.map((r)=><article key={r.id} className={r.is_hidden?"hidden":""}><strong>{businessName(r.business_id)} · {"★".repeat(r.rating)}</strong><p>{r.body}</p><small>{r.author_name} · 신고 {r.report_count}건</small><button onClick={()=>toggleContent("reviews",r.id,r.is_hidden)}>{r.is_hidden?"다시 공개":"리뷰 숨김"}</button></article>):posts.map((p)=><article key={p.id} className={p.is_hidden?"hidden":""}><strong>{p.title}</strong><p>{p.body}</p><small>{p.author_name} · 신고 {p.report_count}건</small><button onClick={()=>toggleContent("community_posts",p.id,p.is_hidden)}>{p.is_hidden?"다시 공개":"게시글 숨김"}</button></article>)}</div>{(contentTab==="reviews"?reviews:posts).length===0&&<Empty text="등록된 콘텐츠가 없습니다. 3단계 SQL 적용 후 표시됩니다."/>}</section>}
      {menu==="revenue"&&<section><h2 className="owner-panel-title">moTF 본사 종합 매출 분석</h2><div className="owner-stats-grid"><Stat label="전체 거래액" value={`${totalRevenue.toLocaleString()}원`}/><Stat label="숙소 예상 수수료" value={`${Math.floor(reservations.filter((r)=>businesses.find((b)=>b.id===r.business_id)?.business_type==="stay"&&["confirmed","completed"].includes(r.status)).reduce((s,r)=>s+r.total_amount,0)*.07).toLocaleString()}원`}/><Stat label="공판장 예상 수수료" value={`${Math.floor(reservations.filter((r)=>businesses.find((b)=>b.id===r.business_id)?.business_type==="market"&&["confirmed","completed"].includes(r.status)).reduce((s,r)=>s+r.total_amount,0)*.05).toLocaleString()}원`}/><Stat label="확정 거래" value={`${reservations.filter((r)=>["confirmed","completed"].includes(r.status)).length}건`}/></div></section>}
      {menu==="settlement"&&<section><h2 className="owner-panel-title">본사 월별 대금 정산 통제 센터</h2><AdminTable headers={["정산 대상 파트너","업종 요율","총 매출액","수수료","최종 입금 예정액"]} rows={businesses.map((b)=>{const amount=reservations.filter((r)=>r.business_id===b.id&&["confirmed","completed"].includes(r.status)).reduce((s,r)=>s+r.total_amount,0);const rate=b.business_type==="market"?.05:.07;return <tr key={b.id}><td><strong>{b.business_name}</strong></td><td>{rate*100}%</td><td>{amount.toLocaleString()}원</td><td>{Math.floor(amount*rate).toLocaleString()}원</td><td>{Math.floor(amount*(1-rate)).toLocaleString()}원</td></tr>})}/></section>}
    </div></section>
  </main>;
}

function Stat({label,value}:{label:string;value:string}){return <div><span>{label}</span><strong>{value}</strong></div>}
function Badge({text}:{text:string}){return <span className="master-badge">{text}</span>}
function Empty({text}:{text:string}){return <div className="empty-panel">{text}</div>}
function AdminTable({headers,rows}:{headers:string[];rows:React.ReactNode[]}){return <div className="table-scroll"><table className="master-table"><thead><tr>{headers.map((h)=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.length?rows:<tr><td colSpan={headers.length}>데이터가 없습니다.</td></tr>}</tbody></table></div>}
