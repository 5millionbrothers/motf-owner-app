"use client";

import { FormEvent, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import PartnerDashboard from "@/components/PartnerDashboard";
import AdminDashboard from "@/components/AdminDashboard";

type AuthMode = "login" | "signup" | "recovery" | "new-password";
type AccountView = "auth" | "pending" | "partner" | "admin" | "blocked";
type PartnerApplication = {
  businessId: string;
  ownerId: string;
  businessName: string;
  businessType: string;
  representativeName: string;
  phone: string | null;
  createdAt: string;
  email: string | null;
  profileStatus: string;
};

export default function Home() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [accountView, setAccountView] = useState<AccountView>("auth");
  const [profileName, setProfileName] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);
  const [applications, setApplications] = useState<PartnerApplication[]>([]);
  const [applicationsLoading, setApplicationsLoading] = useState(false);
  const [reviewingId, setReviewingId] = useState("");

  const supabase = getSupabaseClient();

  async function routeSignedInUser(userId: string) {
    if (!supabase) return;
    const { data: authData } = await supabase.auth.getUser();
    const signedInUser = authData.user;
    if (signedInUser?.id === userId) {
      const metadata = signedInUser.user_metadata;
      const { data: existingBusiness } = await supabase
        .from("businesses")
        .select("id")
        .eq("owner_id", userId)
        .maybeSingle();

      if (!existingBusiness && metadata.business_name && metadata.business_type) {
        await supabase.from("businesses").insert({
          owner_id: userId,
          business_type: metadata.business_type,
          business_name: metadata.business_name,
          representative_name: metadata.full_name,
          phone: metadata.phone,
        });
      }
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("full_name, role, status")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      setError("회원 정보를 불러오지 못했습니다. 운영팀에 문의해 주세요.");
      setAccountView("auth");
      return;
    }

    setProfileName(profile.full_name || "파트너");
    if (profile.role === "admin" && profile.status === "approved") {
      setAccountView("admin");
    } else if (profile.status === "approved") {
      setAccountView("partner");
    } else if (profile.status === "pending") {
      setAccountView("pending");
    } else {
      setAccountView("blocked");
    }
  }

  useEffect(() => {
    if (!supabase) {
      setCheckingSession(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) routeSignedInUser(data.session.user.id);
      setCheckingSession(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setAccountView("auth");
        setMode("new-password");
        setMessage("새 비밀번호를 입력해 주세요.");
        return;
      }
      if (!session?.user) setAccountView("auth");
    });
    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  async function handleLogout() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setAccountView("auth");
    setMessage("");
    setError("");
  }

  async function handleRecoveryRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const form = new FormData(event.currentTarget);
    setLoading(true);
    setError("");
    const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(
      String(form.get("email")),
      { redirectTo: `${window.location.origin}/reset-password` },
    );
    if (recoveryError) setError(recoveryError.message);
    else setMessage("비밀번호 재설정 메일을 보냈습니다. 이메일의 링크를 눌러주세요.");
    setLoading(false);
  }

  async function handleNewPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password"));
    const passwordConfirm = String(form.get("passwordConfirm"));
    if (password !== passwordConfirm) {
      setError("비밀번호 확인이 일치하지 않습니다.");
      return;
    }
    setLoading(true);
    setError("");
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
    } else {
      await supabase.auth.signOut();
      setMode("login");
      setMessage("비밀번호가 변경되었습니다. 새 비밀번호로 로그인해 주세요.");
    }
    setLoading(false);
  }

  async function loadAdminApplications() {
    if (!supabase) return;
    setApplicationsLoading(true);
    const { data: businesses, error: businessError } = await supabase
      .from("businesses")
      .select("id, owner_id, business_name, business_type, representative_name, phone, created_at")
      .order("created_at", { ascending: false });

    if (businessError) {
      setError("가입 신청 목록을 불러오지 못했습니다.");
      setApplicationsLoading(false);
      return;
    }

    const ownerIds = (businesses || []).map((business) => business.owner_id);
    const { data: profiles } = ownerIds.length
      ? await supabase.from("profiles").select("id, email, status").in("id", ownerIds)
      : { data: [] };

    setApplications((businesses || []).map((business) => {
      const profile = profiles?.find((item) => item.id === business.owner_id);
      return {
        businessId: business.id,
        ownerId: business.owner_id,
        businessName: business.business_name,
        businessType: business.business_type,
        representativeName: business.representative_name,
        phone: business.phone,
        createdAt: business.created_at,
        email: profile?.email || null,
        profileStatus: profile?.status || "pending",
      };
    }));
    setApplicationsLoading(false);
  }

  useEffect(() => {
    if (accountView === "admin") loadAdminApplications();
  }, [accountView]);

  async function reviewApplication(application: PartnerApplication, decision: "approved" | "rejected") {
    if (!supabase) return;
    const reason = decision === "rejected"
      ? window.prompt("가입 거절 사유를 입력해 주세요.")
      : null;
    if (decision === "rejected" && !reason?.trim()) return;

    setReviewingId(application.ownerId);
    setError("");
    const { error: reviewError } = await supabase.rpc("review_partner_application", {
      target_user_id: application.ownerId,
      decision,
      reason: reason?.trim() || null,
    });
    if (reviewError) setError(`처리하지 못했습니다: ${reviewError.message}`);
    else await loadAdminApplications();
    setReviewingId("");
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setLoading(true);
    setError("");
    setMessage("");

    const form = new FormData(event.currentTarget);
    const { data, error: loginError } = await supabase.auth.signInWithPassword({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });

    if (loginError) {
      setError("이메일 또는 비밀번호를 확인해 주세요.");
      setLoading(false);
      return;
    }

    const metadata = data.user.user_metadata;
    const { data: business } = await supabase
      .from("businesses")
      .select("id, approval_status")
      .eq("owner_id", data.user.id)
      .maybeSingle();

    if (!business && metadata.business_name && metadata.business_type) {
      await supabase.from("businesses").insert({
        owner_id: data.user.id,
        business_type: metadata.business_type,
        business_name: metadata.business_name,
        representative_name: metadata.full_name,
        phone: metadata.phone,
      });
    }

    await routeSignedInUser(data.user.id);
    setLoading(false);
  }

  async function handleSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const signupForm = event.currentTarget;
    setLoading(true);
    setError("");
    setMessage("");

    const form = new FormData(signupForm);
    const password = String(form.get("password"));
    const passwordConfirm = String(form.get("passwordConfirm"));

    if (password !== passwordConfirm) {
      setError("비밀번호 확인이 일치하지 않습니다.");
      setLoading(false);
      return;
    }

    try {
      const { error: signupError } = await supabase.auth.signUp({
        email: String(form.get("email")),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: {
            full_name: String(form.get("fullName")),
            phone: String(form.get("phone")),
            business_type: String(form.get("businessType")),
            business_name: String(form.get("businessName")),
          },
        },
      });

      if (signupError) {
        setError(signupError.message);
        return;
      }

      signupForm.reset();
      setMessage("인증 메일을 보냈습니다. 이메일 인증 후 로그인해 주세요.");
    } catch {
      setError("회원가입 처리 중 연결 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession) {
    return <main className="auth-page"><div className="loading-card">로그인 상태를 확인하고 있습니다...</div></main>;
  }

  if (accountView !== "auth") {
    if (accountView === "admin" && supabase) {
      return <AdminDashboard supabase={supabase} onLogout={handleLogout} />;
    }

    if (accountView === "partner" && supabase) {
      return <PartnerDashboard supabase={supabase} profileName={profileName} onLogout={handleLogout} />;
    }

    if (accountView === "admin") {
      return (
        <main className="admin-page">
          <header className="admin-header">
            <div><strong className="admin-brand">moTF</strong><span> 운영팀</span></div>
            <button className="header-logout" type="button" onClick={handleLogout}>로그아웃</button>
          </header>
          <section className="admin-shell">
            <div className="admin-title-row">
              <div><span className="status-label">입점 관리</span><h1>파트너 가입 심사</h1><p>신규 숙소·공판장의 가입 정보를 확인하고 승인 상태를 결정합니다.</p></div>
              <button className="refresh-button" onClick={loadAdminApplications}>새로고침</button>
            </div>
            {error && <div className="notice error-notice">{error}</div>}
            {applicationsLoading ? <div className="empty-panel">신청 목록을 불러오는 중입니다...</div> : (
              <div className="application-list">
                {applications.length === 0 ? <div className="empty-panel">등록된 가입 신청이 없습니다.</div> : applications.map((application) => (
                  <article className="application-card" key={application.businessId}>
                    <div className="application-main">
                      <div className="application-top"><strong>{application.businessName}</strong><span className={`review-badge ${application.profileStatus}`}>{application.profileStatus === "approved" ? "승인 완료" : application.profileStatus === "rejected" ? "승인 거절" : "심사 대기"}</span></div>
                      <p>{application.businessType === "stay" ? "숙소" : "공판장"} · 대표자 {application.representativeName}</p>
                      <small>{application.email || "이메일 없음"} · {application.phone || "연락처 없음"} · {new Date(application.createdAt).toLocaleDateString("ko-KR")}</small>
                    </div>
                    {application.profileStatus === "pending" && <div className="review-actions"><button className="approve-button" disabled={reviewingId === application.ownerId} onClick={() => reviewApplication(application, "approved")}>승인</button><button className="reject-button" disabled={reviewingId === application.ownerId} onClick={() => reviewApplication(application, "rejected")}>거절</button></div>}
                  </article>
                ))}
              </div>
            )}
          </section>
        </main>
      );
    }

    const viewContent = {
      pending: {
        label: "입점 심사 중",
        title: `${profileName}님의 가입 신청을 확인하고 있습니다`,
        text: "모티프 운영팀이 업장 정보를 확인한 뒤 승인해 드립니다. 승인 전에는 예약과 채팅 메뉴를 사용할 수 없습니다.",
      },
      partner: {
        label: "파트너 승인 완료",
        title: `${profileName}님, 환영합니다`,
        text: "인증과 입점 승인이 완료되었습니다. 다음 작업에서 기존 예약·채팅·매출 대시보드를 이 계정에 연결합니다.",
      },
      blocked: {
        label: "계정 이용 제한",
        title: "현재 계정을 이용할 수 없습니다",
        text: "가입 신청이 반려되었거나 계정이 정지된 상태입니다. 모티프 운영팀에 문의해 주세요.",
      },
    }[accountView];

    return (
      <main className="auth-page">
        <section className="status-card">
          <div className={`status-icon ${accountView}`}>moTF</div>
          <span className="status-label">{viewContent.label}</span>
          <h1>{viewContent.title}</h1>
          <p>{viewContent.text}</p>
          <button className="switch-button" type="button" onClick={handleLogout}>로그아웃</button>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <section className={`auth-card ${mode === "signup" ? "signup-card" : ""}`}>
        <div className="brand-area">
          <div className="brand">moTF</div>
          <p>단체행사를 더 가깝고 간편하게</p>
        </div>

        <div className="auth-content">
          <h1>{mode === "login" ? "파트너 로그인" : mode === "signup" ? "파트너 회원가입" : mode === "recovery" ? "비밀번호 찾기" : "새 비밀번호 설정"}</h1>
          <p className="subtitle">
            {mode === "login"
              ? "숙소·공판장 파트너와 운영팀 전용 서비스입니다."
              : mode === "signup"
                ? "업장 정보를 제출하면 모티프 운영팀의 심사가 시작됩니다."
                : mode === "recovery"
                  ? "가입한 이메일로 비밀번호 재설정 링크를 보내드립니다."
                  : "앞으로 사용할 새 비밀번호를 입력해 주세요."}
          </p>

          {!supabase && (
            <div className="notice error-notice">
              Supabase 연결값이 없습니다. <code>.env.local</code>에 API URL과
              Publishable key를 입력해 주세요.
            </div>
          )}
          {message && <div className="notice success-notice">{message}</div>}
          {error && <div className="notice error-notice">{error}</div>}

          {mode === "login" ? (
            <form onSubmit={handleLogin} className="auth-form">
              <label>
                이메일
                <input name="email" type="email" required autoComplete="email" />
              </label>
              <label>
                비밀번호
                <input
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                />
              </label>
              <button className="primary-button" disabled={!supabase || loading}>
                {loading ? "확인 중..." : "로그인"}
              </button>
              <button className="text-button" type="button" onClick={() => { setMode("recovery"); setError(""); setMessage(""); }}>비밀번호를 잊으셨나요?</button>
            </form>
          ) : mode === "signup" ? (
            <form onSubmit={handleSignup} className="auth-form">
              <label>
                파트너 유형
                <select name="businessType" required defaultValue="">
                  <option value="" disabled>유형을 선택하세요</option>
                  <option value="stay">숙소 사장님</option>
                  <option value="market">공판장 사장님</option>
                </select>
              </label>
              <label>
                업장명
                <input name="businessName" required placeholder="예: 가평 모티프 펜션" />
              </label>
              <label>
                대표자명
                <input name="fullName" required />
              </label>
              <label>
                휴대전화번호
                <input name="phone" type="tel" required placeholder="010-0000-0000" />
              </label>
              <label>
                이메일
                <input name="email" type="email" required autoComplete="email" />
              </label>
              <label>
                비밀번호
                <input name="password" type="password" minLength={8} required autoComplete="new-password" />
              </label>
              <label>
                비밀번호 확인
                <input name="passwordConfirm" type="password" minLength={8} required autoComplete="new-password" />
              </label>
              <label className="terms">
                <input type="checkbox" required />
                <span>이용약관 및 개인정보 수집·이용에 동의합니다.</span>
              </label>
              <button className="primary-button" disabled={!supabase || loading}>
                {loading ? "가입 처리 중..." : "회원가입"}
              </button>
            </form>
          ) : mode === "recovery" ? (
            <form onSubmit={handleRecoveryRequest} className="auth-form">
              <label>가입 이메일<input name="email" type="email" required autoComplete="email" /></label>
              <button className="primary-button" disabled={!supabase || loading}>{loading ? "메일 전송 중..." : "재설정 메일 받기"}</button>
              <button className="text-button" type="button" onClick={() => setMode("login")}>로그인으로 돌아가기</button>
            </form>
          ) : (
            <form onSubmit={handleNewPassword} className="auth-form">
              <label>새 비밀번호<input name="password" type="password" minLength={8} required autoComplete="new-password" /></label>
              <label>새 비밀번호 확인<input name="passwordConfirm" type="password" minLength={8} required autoComplete="new-password" /></label>
              <button className="primary-button" disabled={!supabase || loading}>{loading ? "변경 중..." : "새 비밀번호 저장"}</button>
            </form>
          )}

          {(mode === "login" || mode === "signup") && <>
            <div className="divider"><span>또는</span></div>
            <button className="kakao-button" type="button" disabled>카카오로 시작하기 · 다음 단계에서 연결</button>
            <button className="switch-button" type="button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); setMessage(""); }}>{mode === "login" ? "처음이신가요? 회원가입" : "이미 계정이 있나요? 로그인"}</button>
          </>}
        </div>
      </section>
    </main>
  );
}
