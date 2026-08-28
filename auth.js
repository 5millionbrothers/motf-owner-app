(function setupMotfAuth() {
  const config = window.MOTF_CONFIG || {};
  const supabaseLibrary = window.supabase;

  if (!supabaseLibrary || !config.SUPABASE_URL || !config.SUPABASE_PUBLISHABLE_KEY) {
    console.error("moTF 로그인 설정을 불러오지 못했습니다.");
    return;
  }

  const client = supabaseLibrary.createClient(
    config.SUPABASE_URL,
    config.SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    },
  );

  window.motfSupabase = client;

  const protectedRoutes = new Set([
    "mypage",
    "myUsage",
    "myAccount",
    "myGuide",
    "chat",
    "booking",
    "payment",
    "paymentResult",
  ]);
  const protectedFormIds = new Set([
    "bookingForm",
    "orderForm",
    "chatForm",
    "activitySubmitForm",
    "boardWriteForm",
    "activityCommentForm",
    "postCommentForm",
    "reviewForm",
    "supportCaseForm",
  ]);

  let session = null;
  let profile = null;
  let pendingAction = null;
  let lastUserId = null;
  let welcomeEmailRequestUserId = null;
  let welcomeEmailRequestPromise = null;
  let verifiedIdentity = null;
  let passwordResetIdentity = null;

  function showToast(message) {
    if (typeof window.toast === "function") {
      window.toast(message);
      return;
    }
    console.info(message);
  }

  function formatPhone(value = "") {
    const digits = String(value || "").replace(/\D/g, "").slice(0, 11);
    if (digits.startsWith("02")) {
      if (digits.length <= 2) return digits;
      if (digits.length <= 6) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
      if (digits.length <= 10) return `${digits.slice(0, 2)}-${digits.slice(2, digits.length - 4)}-${digits.slice(-4)}`;
    }
    if (digits.length <= 3) return digits;
    if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }

  function normalizePhone(value = "") {
    return formatPhone(value);
  }

  function applyPhoneMask(input) {
    if (!input) return;
    const before = input.value;
    const formatted = formatPhone(before);
    if (before !== formatted) input.value = formatted;
  }

  function createModal() {
    const modal = document.createElement("div");
    modal.className = "auth-modal";
    modal.id = "authModal";
    modal.hidden = true;
    modal.innerHTML = `
      <div class="auth-modal-backdrop" data-auth-close></div>
      <section class="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="authTitle">
        <div class="auth-dialog-head">
          <div>
            <p class="eyebrow">moTF 계정</p>
            <h2 id="authTitle">로그인</h2>
          </div>
          <button class="auth-close" type="button" data-auth-close aria-label="닫기">
            <i data-lucide="x"></i>
          </button>
        </div>
        <div class="auth-tabs" role="tablist">
          <button class="auth-tab active" type="button" data-auth-tab="login">로그인</button>
          <button class="auth-tab" type="button" data-auth-tab="signup">회원가입</button>
        </div>
        <form class="auth-form" id="customerLoginForm">
          <label>이메일
            <input id="customerLoginEmail" type="email" autocomplete="email" required placeholder="example@email.com" />
          </label>
          <label>비밀번호
            <span class="password-field">
              <input id="customerLoginPassword" type="password" autocomplete="current-password" required placeholder="비밀번호를 입력해주세요" />
              <button class="password-toggle" type="button" data-toggle-login-password aria-label="비밀번호 보기">
                <i data-lucide="eye"></i>
              </button>
            </span>
          </label>
          <button class="primary-btn auth-submit" type="submit">이메일로 로그인</button>
          <div class="auth-divider"><span>또는</span></div>
          <button class="auth-kakao-btn" type="button" data-kakao-login>
            <span class="auth-kakao-symbol">K</span>카카오로 로그인
          </button>
          <button class="auth-link" type="button" data-password-reset>비밀번호를 잊으셨나요?</button>
        </form>
        <form class="auth-form" id="customerSignupForm" hidden>
          <div class="identity-step-card" id="signupIdentityStep">
            <span class="identity-step-number">1</span>
            <div><strong>휴대폰 본인인증</strong><p>이름·연락처·생년월일을 안전하게 확인합니다.</p></div>
            <button class="secondary-btn" type="button" data-identity-verify="signup">본인인증</button>
          </div>
          <div class="identity-result" id="signupIdentityResult" hidden></div>
          <label>이름<input id="customerSignupName" autocomplete="name" readonly required placeholder="본인인증 후 자동 입력" /></label>
          <label>휴대전화번호<input id="customerSignupPhone" type="tel" autocomplete="tel" readonly required placeholder="본인인증 후 자동 입력" /></label>
          <label>생년월일<input id="customerSignupBirthDate" readonly required placeholder="본인인증 후 자동 입력" /></label>
          <label>이메일
            <input id="customerSignupEmail" type="email" autocomplete="email" required placeholder="example@email.com" />
          </label>
          <label>비밀번호
            <input id="customerSignupPassword" type="password" autocomplete="new-password" required minlength="8" maxlength="12" placeholder="영문·숫자·특수문자 8~12자리" />
          </label>
          <label>비밀번호 확인
            <input id="customerSignupPasswordConfirm" type="password" autocomplete="new-password" required minlength="8" maxlength="12" placeholder="비밀번호를 한 번 더 입력해주세요" />
          </label>
          <label class="auth-agreement">
            <input id="customerSignupTerms" type="checkbox" required />
            <span>
              이용약관과 개인정보 처리방침에 동의합니다.
              <span class="auth-policy-links">
                <button type="button" data-auth-legal-route="terms">이용약관 보기</button>
                <button type="button" data-auth-legal-route="privacy">개인정보 처리방침 보기</button>
              </span>
            </span>
          </label>
          <button class="primary-btn auth-submit" type="submit">회원가입</button>
          <div class="auth-divider"><span>또는</span></div>
          <button class="auth-kakao-btn" type="button" data-kakao-login>
            <span class="auth-kakao-symbol">K</span>카카오로 시작하기
          </button>
        </form>
        <form class="auth-form" id="identityPasswordResetForm" hidden>
          <p class="auth-helper-text">가입한 이메일과 휴대폰 본인인증 정보가 일치하면 바로 새 비밀번호를 설정할 수 있어요.</p>
          <label>가입 이메일<input id="identityResetEmail" type="email" autocomplete="email" required placeholder="example@email.com" /></label>
          <button class="secondary-btn" type="button" data-identity-verify="password_reset">휴대폰 본인인증</button>
          <div class="identity-result" id="passwordIdentityResult" hidden></div>
          <label>새 비밀번호<input id="identityResetPassword" type="password" autocomplete="new-password" minlength="8" maxlength="12" required placeholder="영문·숫자·특수문자 8~12자리" /></label>
          <label>새 비밀번호 확인<input id="identityResetPasswordConfirm" type="password" autocomplete="new-password" minlength="8" maxlength="12" required /></label>
          <button class="primary-btn auth-submit" type="submit">비밀번호 변경</button>
          <button class="auth-link" type="button" data-auth-back-login>로그인으로 돌아가기</button>
        </form>
        <form class="auth-form" id="customerPasswordForm" hidden>
          <label>새 비밀번호
            <input id="customerNewPassword" type="password" autocomplete="new-password" required minlength="8" maxlength="12" placeholder="영문·숫자·특수문자 8~12자리" />
          </label>
          <label>새 비밀번호 확인
            <input id="customerNewPasswordConfirm" type="password" autocomplete="new-password" required minlength="8" maxlength="12" placeholder="한 번 더 입력해주세요" />
          </label>
          <button class="primary-btn auth-submit" type="submit">새 비밀번호 저장</button>
        </form>
        <form class="auth-form" id="profileCompleteForm" hidden>
          <p class="auth-helper-text">카카오 로그인도 안전한 예약과 성인 상품 확인을 위해 최초 1회 휴대폰 본인인증이 필요합니다.</p>
          <button class="secondary-btn" type="button" data-identity-verify="profile_upgrade">휴대폰 본인인증</button>
          <div class="identity-result" id="profileIdentityResult" hidden></div>
          <label>휴대전화번호<input id="profileCompletePhone" type="tel" autocomplete="tel" readonly maxlength="20" placeholder="본인인증 후 자동 입력" /></label>
          <label>학교/소속
            <input id="profileCompleteOrganization" autocomplete="organization" maxlength="80" placeholder="예: 한국대 경영학과 학생회" />
          </label>
          <div id="kakaoPasswordFields" hidden>
            <label>서비스 비밀번호<input id="profileCompletePassword" type="password" autocomplete="new-password" minlength="8" maxlength="12" placeholder="영문·숫자·특수문자 8~12자리" /></label>
            <label>비밀번호 확인<input id="profileCompletePasswordConfirm" type="password" autocomplete="new-password" minlength="8" maxlength="12" /></label>
          </div>
          <button class="primary-btn auth-submit" type="submit">기본 정보 저장</button>
          <button class="auth-link" type="button" data-profile-complete-later>나중에 입력하기</button>
        </form>
        <p class="auth-message" id="authMessage" aria-live="polite"></p>
      </section>
    `;
    document.body.appendChild(modal);
    if (typeof window.refreshIcons === "function") window.refreshIcons();
    return modal;
  }

  const modal = createModal();
  const loginForm = document.querySelector("#customerLoginForm");
  const signupForm = document.querySelector("#customerSignupForm");
  const identityPasswordResetForm = document.querySelector("#identityPasswordResetForm");
  const passwordForm = document.querySelector("#customerPasswordForm");
  const profileCompleteForm = document.querySelector("#profileCompleteForm");
  const message = document.querySelector("#authMessage");

  function setMessage(text, type = "") {
    message.textContent = text;
    message.className = `auth-message ${type}`.trim();
  }

  function passwordIsValid(value) {
    return /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d\s]).{8,12}$/.test(String(value || ""));
  }

  async function apiJson(path, options = {}) {
    const response = await fetch(path, options);
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) throw new Error(result?.message || "요청을 처리하지 못했습니다.");
    return result;
  }

  async function startIdentityVerification(purpose) {
    const email = purpose === "password_reset"
      ? document.querySelector("#identityResetEmail")?.value.trim()
      : document.querySelector("#customerSignupEmail")?.value.trim();
    if (purpose === "password_reset" && !email) throw new Error("가입한 이메일을 먼저 입력해주세요.");
    const start = await apiJson("/api/identity-start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ purpose, email, accountType: "user", returnUrl: window.location.href, mobile: window.innerWidth < 720 }),
    });
    const popup = window.open("", "motf_identity", "width=430,height=640,toolbar=no,menubar=no,scrollbars=yes,resizable=yes");
    if (!popup) throw new Error("본인인증 팝업이 차단되었습니다. 브라우저에서 팝업을 허용해주세요.");
    const form = document.createElement("form");
    form.method = "POST";
    form.action = start.callUrl;
    form.target = "motf_identity";
    Object.entries(start.form || {}).forEach(([name, value]) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.appendChild(input);
    });
    document.body.appendChild(form);
    form.submit();
    form.remove();
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => { cleanup(); reject(new Error("본인인증 시간이 만료되었습니다. 다시 시도해주세요.")); }, 10 * 60 * 1000);
      const poll = window.setInterval(() => { if (popup.closed) { cleanup(); reject(new Error("본인인증 창이 닫혔습니다.")); } }, 700);
      const onMessage = async (event) => {
        if (event.origin !== window.location.origin) return;
        if (event.data?.type !== "motf:kcp-identity") return;
        cleanup();
        if (!event.data.ok) return reject(new Error(event.data.message || "본인인증에 실패했습니다."));
        try {
          const status = await apiJson("/api/identity-status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ identityToken: start.identityToken, purpose }),
          });
          resolve({ token: start.identityToken, purpose, person: status.person });
        } catch (error) { reject(error); }
      };
      function cleanup() {
        window.clearTimeout(timeout);
        window.clearInterval(poll);
        window.removeEventListener("message", onMessage);
      }
      window.addEventListener("message", onMessage);
    });
  }

  function showIdentityResult(targetId, identity) {
    const target = document.querySelector(targetId);
    if (!target) return;
    target.hidden = false;
    target.innerHTML = `<strong>본인인증 완료</strong><span>${identity.person.name} · ${formatPhone(identity.person.phone)} · ${identity.person.birthDate}</span>`;
  }

  function loginErrorMessage(error) {
    const code = error?.code || "";
    const detail = String(error?.message || "").toLowerCase();
    if (code === "email_not_confirmed" || detail.includes("email not confirmed")) {
      return "이메일 인증이 완료되지 않았습니다. 가입한 메일함의 인증 링크를 먼저 눌러주세요. 스팸 메일함도 확인해주세요.";
    }
    if (code === "invalid_credentials" || detail.includes("invalid login credentials")) {
      return "이메일 또는 비밀번호가 일치하지 않습니다.";
    }
    if (code === "over_request_rate_limit" || detail.includes("rate limit")) {
      return "로그인 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.";
    }
    return error?.message ? `로그인에 실패했습니다: ${error.message}` : "로그인에 실패했습니다. 잠시 후 다시 시도해주세요.";
  }

  function oauthRedirectUrl() {
    return `${window.location.origin}${window.location.pathname}`;
  }

  async function signInWithKakao(button) {
    if (!client?.auth?.signInWithOAuth) {
      setMessage("카카오 로그인을 시작할 수 없습니다. 잠시 후 다시 시도해주세요.", "error");
      return;
    }
    const originalHtml = button?.innerHTML;
    if (button) {
      button.disabled = true;
      button.innerHTML = '<span class="auth-kakao-symbol">K</span>카카오로 이동 중...';
    }
    setMessage("카카오 로그인 화면으로 이동합니다.");

    const { error } = await client.auth.signInWithOAuth({
      provider: "kakao",
      options: {
        redirectTo: oauthRedirectUrl(),
        queryParams: {
          prompt: "select_account",
        },
      },
    });

    if (button) {
      button.disabled = false;
      button.innerHTML = originalHtml;
    }
    if (error) setMessage(`카카오 로그인에 실패했습니다: ${error.message}`, "error");
  }

  function switchTab(tab) {
    const isLogin = tab === "login";
    loginForm.hidden = !isLogin;
    signupForm.hidden = isLogin;
    passwordForm.hidden = true;
    identityPasswordResetForm.hidden = true;
    profileCompleteForm.hidden = true;
    document.querySelector(".auth-tabs").hidden = false;
    document.querySelector("#authTitle").textContent = isLogin ? "로그인" : "회원가입";
    document.querySelectorAll("[data-auth-tab]").forEach((button) => {
      button.classList.toggle("active", button.dataset.authTab === tab);
    });
    setMessage("");
  }

  function openModal(tab = "login", action = null) {
    pendingAction = action;
    switchTab(tab);
    const loginPassword = document.querySelector("#customerLoginPassword");
    if (loginPassword) {
      loginPassword.value = "";
      loginPassword.type = "password";
    }
    const toggleButton = document.querySelector("[data-toggle-login-password]");
    if (toggleButton) {
      toggleButton.innerHTML = '<i data-lucide="eye"></i>';
      toggleButton.setAttribute("aria-label", "비밀번호 보기");
    }
    modal.hidden = false;
    document.body.classList.add("auth-modal-open");
    window.refreshIcons?.();
    window.setTimeout(() => {
      if (loginPassword) loginPassword.value = "";
      document.querySelector(isSignupTab() ? "#customerSignupName" : "#customerLoginEmail")?.focus();
    }, 0);
  }

  function isSignupTab() {
    return !signupForm.hidden;
  }

  function profileCompletionDismissKey() {
    return session?.user?.id ? `motf.profileCompletion.dismissed.${session.user.id}` : "";
  }

  function needsProfileCompletion() {
    if (!session?.user || !profile || profile.role !== "user") return false;
    const kakaoUser = (session?.user?.app_metadata?.providers || []).includes("kakao");
    return !profile.identity_verified_at || !profile.organization || (kakaoUser && !profile.password_set_at);
  }

  function openProfileCompletion() {
    if (!needsProfileCompletion()) return;
    loginForm.hidden = true;
    signupForm.hidden = true;
    passwordForm.hidden = true;
    identityPasswordResetForm.hidden = true;
    profileCompleteForm.hidden = false;
    document.querySelector(".auth-tabs").hidden = true;
    document.querySelector("#authTitle").textContent = "기본 정보 입력";
    document.querySelector("#profileCompletePhone").value = formatPhone(profile?.phone || "");
    document.querySelector("#profileCompleteOrganization").value = profile?.organization || "";
    const needsPassword = (session.user.app_metadata?.providers || []).includes("kakao") && !profile?.password_set_at;
    const passwordFields = document.querySelector("#kakaoPasswordFields");
    passwordFields.hidden = !needsPassword;
    passwordFields.querySelectorAll("input").forEach((input) => { input.required = needsPassword; });
    modal.hidden = false;
    document.body.classList.add("auth-modal-open");
    setMessage(profile?.identity_verified_at
      ? "학교/소속을 입력하면 예약 정보를 더 빠르게 작성할 수 있어요."
      : "휴대폰 본인인증을 먼저 완료해주세요.");
    window.setTimeout(() => document.querySelector(profile?.phone ? "#profileCompleteOrganization" : "#profileCompletePhone")?.focus(), 0);
  }

  function maybePromptProfileCompletion() {
    const key = profileCompletionDismissKey();
    if (!key || window.localStorage.getItem(key) === "1") return;
    if (needsProfileCompletion()) window.setTimeout(openProfileCompletion, 250);
  }

  function openPasswordChange() {
    pendingAction = null;
    loginForm.hidden = true;
    signupForm.hidden = true;
    passwordForm.hidden = false;
    identityPasswordResetForm.hidden = true;
    profileCompleteForm.hidden = true;
    document.querySelector(".auth-tabs").hidden = true;
    document.querySelector("#authTitle").textContent = "새 비밀번호 설정";
    modal.hidden = false;
    document.body.classList.add("auth-modal-open");
    setMessage("새로 사용할 비밀번호를 입력해주세요.");
    window.setTimeout(() => document.querySelector("#customerNewPassword")?.focus(), 0);
  }

  function closeModal(clearAction = true) {
    modal.hidden = true;
    document.body.classList.remove("auth-modal-open");
    setMessage("");
    if (clearAction) pendingAction = null;
  }

  function requireLogin(action = null) {
    if (session?.user) return true;
    openModal("login", action);
    setMessage("이 기능은 로그인 후 이용할 수 있어요.");
    return false;
  }

  async function loadProfile() {
    profile = null;
    window.motfCurrentUserId = session?.user?.id || "";
    window.motfCurrentUserEmail = session?.user?.email || "";
    if (!session?.user) {
      window.motfCurrentUserProfile = null;
      return;
    }
    const { data, error } = await client
      .from("profiles")
      .select("email, full_name, phone, birth_date, identity_verified_at, adult_verified_at, password_set_at, organization, role, status")
      .eq("id", session.user.id)
      .maybeSingle();
    if (!error) profile = data;
    window.motfCurrentUserProfile = profile;
  }

  function updateHeader() {
    const accountButton = document.querySelector('.top-nav [data-route="mypage"]');
    if (!accountButton) return;
    accountButton.setAttribute("aria-label", session?.user ? "마이페이지" : "로그인");
    accountButton.setAttribute("title", session?.user ? "마이페이지" : "로그인");
  }

  function updateAccountView() {
    const accountForm = document.querySelector("#myAccount form.tool-panel");
    const inputs = accountForm ? [...accountForm.querySelectorAll("input")] : [];
    if (inputs[0]) {
      inputs[0].value = session?.user?.email || "";
      inputs[0].readOnly = true;
    }
    if (inputs[1]) {
      inputs[1].value = "";
      inputs[1].placeholder = "비밀번호는 보안상 표시하지 않습니다";
      inputs[1].readOnly = true;
    }
    if (inputs[2]) {
      inputs[2].value = profile?.organization || "";
      inputs[2].placeholder = "학교 또는 소속을 입력해주세요";
    }
    if (inputs[3]) inputs[3].value = formatPhone(profile?.phone || "");

    const dangerPanel = document.querySelector("#myAccount .danger-panel");
    if (!dangerPanel) return;
    let note = dangerPanel.querySelector(".auth-session-note");
    if (!note) {
      note = document.createElement("p");
      note.className = "auth-session-note";
      dangerPanel.insertBefore(note, dangerPanel.querySelector("button"));
    }
    note.textContent = session?.user
      ? `${profile?.full_name || "이용자"}님 · ${session.user.email}`
      : "로그인이 필요합니다.";

    let logoutButton = dangerPanel.querySelector("[data-auth-logout]");
    if (!logoutButton) {
      logoutButton = document.createElement("button");
      logoutButton.className = "secondary-btn auth-logout-btn";
      logoutButton.type = "button";
      logoutButton.dataset.authLogout = "";
      logoutButton.innerHTML = '<i data-lucide="log-out"></i>로그아웃';
      dangerPanel.insertBefore(logoutButton, dangerPanel.querySelector("button"));
    }
    logoutButton.hidden = !session?.user;
    if (typeof window.refreshIcons === "function") window.refreshIcons();
  }

  async function refreshAuthUi() {
    await loadProfile();
    updateHeader();
    updateAccountView();
  }

  async function requestWelcomeEmail() {
    if (!session?.access_token || !session.user?.email_confirmed_at) return;
    const userId = session.user.id;
    if (welcomeEmailRequestUserId === userId && welcomeEmailRequestPromise) {
      return welcomeEmailRequestPromise;
    }

    welcomeEmailRequestUserId = userId;
    welcomeEmailRequestPromise = (async () => {
      try {
        const response = await fetch("/api/welcome-email", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ name: profile?.full_name || session.user.user_metadata?.full_name || "" }),
        });
        const result = await response.json().catch(() => null);
        if (!response.ok) {
          console.warn("가입 완료 안내 메일 요청이 처리되지 않았습니다.", result?.code || response.status);
        }
        return result;
      } catch (error) {
        console.warn("가입 완료 안내 메일을 요청하지 못했습니다.", error);
        return null;
      }
    })();

    return welcomeEmailRequestPromise;
  }

  async function blockInactiveUserSession() {
    if (!session?.user || !profile || profile.role !== "user" || profile.status === "approved") return false;
    const message = profile.status === "suspended"
      ? "탈퇴 처리되었거나 이용이 중지된 계정입니다."
      : "현재 이용할 수 없는 계정입니다.";
    await client.auth.signOut();
    session = null;
    profile = null;
    window.motfClearUserScopedState?.();
    await refreshAuthUi();
    showToast(message);
    return true;
  }

  async function unlinkOAuthIdentitiesForWithdrawal() {
    try {
      const { data, error } = await client.auth.getUserIdentities();
      if (error) return;
      const identities = Array.isArray(data?.identities) ? data.identities : [];
      for (const identity of identities) {
        if (!identity?.provider || identity.provider === "email") continue;
        await client.auth.unlinkIdentity(identity);
      }
    } catch {
      // Auth 이메일 익명화가 핵심 처리입니다. 소셜 identity 해제 실패는 탈퇴 완료를 막지 않습니다.
    }
  }

  async function finishLogin() {
    await refreshAuthUi();
    if (await blockInactiveUserSession()) return;
    const action = pendingAction;
    closeModal(false);
    pendingAction = null;
    showToast("로그인되었습니다.");
    if (typeof action === "function") action();
    maybePromptProfileCompletion();
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = loginForm.querySelector('[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = "로그인 중...";
    setMessage("");

    const { data, error } = await client.auth.signInWithPassword({
      email: document.querySelector("#customerLoginEmail").value.trim(),
      password: document.querySelector("#customerLoginPassword").value,
    });

    submitButton.disabled = false;
    submitButton.textContent = "이메일로 로그인";
    if (error) {
      const friendlyMessage = loginErrorMessage(error);
      const code = error?.code || "";
      const detail = String(error?.message || "").toLowerCase();
      if (code === "email_not_confirmed" || detail.includes("email not confirmed")) {
        alert(friendlyMessage);
      }
      setMessage(friendlyMessage, "error");
      return;
    }
    session = data.session;
    await finishLogin();
  });

  document.addEventListener("click", (event) => {
    const toggleButton = event.target.closest("[data-toggle-login-password]");
    if (!toggleButton) return;
    const passwordInput = document.querySelector("#customerLoginPassword");
    if (!passwordInput) return;
    const shouldShow = passwordInput.type === "password";
    passwordInput.type = shouldShow ? "text" : "password";
    toggleButton.innerHTML = `<i data-lucide="${shouldShow ? "eye-off" : "eye"}"></i>`;
    toggleButton.setAttribute("aria-label", shouldShow ? "비밀번호 숨기기" : "비밀번호 보기");
    window.refreshIcons?.();
  });

  document.addEventListener("click", (event) => {
    const legalButton = event.target.closest("[data-auth-legal-route]");
    if (!legalButton) return;
    closeModal(false);
    window.motfNavigate?.(legalButton.dataset.authLegalRoute);
  });

  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = document.querySelector("#customerSignupPassword").value;
    const passwordConfirm = document.querySelector("#customerSignupPasswordConfirm").value;
    if (!verifiedIdentity || verifiedIdentity.purpose !== "signup") {
      setMessage("휴대폰 본인인증을 먼저 완료해주세요.", "error");
      return;
    }
    if (!passwordIsValid(password)) {
      setMessage("비밀번호는 영문·숫자·특수문자를 포함한 8~12자리여야 합니다.", "error");
      return;
    }
    if (password !== passwordConfirm) {
      setMessage("두 비밀번호가 서로 다릅니다.", "error");
      return;
    }
    const submitButton = signupForm.querySelector('[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = "가입 처리 중...";
    setMessage("");

    const email = document.querySelector("#customerSignupEmail").value.trim();
    let result;
    try {
      result = await apiJson("/api/identity-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountType: "user",
          identityToken: verifiedIdentity.token,
          email,
          password,
          emailRedirectTo: `${window.location.origin}${window.location.pathname}`,
        }),
      });
    } catch (error) {
      submitButton.disabled = false;
      submitButton.textContent = "회원가입";
      setMessage(error.message || "회원가입에 실패했습니다.", "error");
      return;
    }

    submitButton.disabled = false;
    submitButton.textContent = "회원가입";
    signupForm.reset();
    verifiedIdentity = null;
    document.querySelector("#signupIdentityResult").hidden = true;
    switchTab("login");
    document.querySelector("#customerLoginEmail").value = email;
    const verificationMessage = `인증 메일을 보냈습니다.\n\n${email}로 보낸 인증 링크를 눌러야 최종 가입됩니다.\n인증 전에는 로그인할 수 없으니 스팸 메일함도 함께 확인해주세요.`;
    alert(verificationMessage);
    setMessage("인증 메일을 보냈습니다. 이메일 인증 후 로그인해 주세요.", "success");
  });

  identityPasswordResetForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = document.querySelector("#identityResetEmail").value.trim();
    const password = document.querySelector("#identityResetPassword").value;
    const confirm = document.querySelector("#identityResetPasswordConfirm").value;
    if (!passwordResetIdentity) return setMessage("휴대폰 본인인증을 먼저 완료해주세요.", "error");
    if (!passwordIsValid(password)) return setMessage("비밀번호는 영문·숫자·특수문자를 포함한 8~12자리여야 합니다.", "error");
    if (password !== confirm) return setMessage("두 비밀번호가 서로 다릅니다.", "error");
    const button = identityPasswordResetForm.querySelector('[type="submit"]');
    button.disabled = true;
    button.textContent = "변경 중...";
    try {
      await apiJson("/api/identity-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, identityToken: passwordResetIdentity.token }),
      });
      identityPasswordResetForm.reset();
      passwordResetIdentity = null;
      switchTab("login");
      setMessage("비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.", "success");
    } catch (error) {
      setMessage(error.message || "비밀번호를 변경하지 못했습니다.", "error");
    } finally {
      button.disabled = false;
      button.textContent = "비밀번호 변경";
    }
  });

  passwordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = document.querySelector("#customerNewPassword").value;
    const confirmPassword = document.querySelector("#customerNewPasswordConfirm").value;
    if (!passwordIsValid(password)) {
      setMessage("비밀번호는 영문·숫자·특수문자를 포함한 8~12자리여야 합니다.", "error");
      return;
    }
    if (password !== confirmPassword) {
      setMessage("두 비밀번호가 서로 다릅니다.", "error");
      return;
    }
    const submitButton = passwordForm.querySelector('[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = "저장 중...";
    const { error } = await client.auth.updateUser({ password });
    submitButton.disabled = false;
    submitButton.textContent = "새 비밀번호 저장";
    if (error) {
      setMessage(`비밀번호 변경에 실패했습니다: ${error.message}`, "error");
      return;
    }
    passwordForm.reset();
    closeModal();
    showToast("비밀번호가 변경되었습니다.");
  });

  profileCompleteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!session?.user) return;
    if (!profile?.identity_verified_at) {
      setMessage("휴대폰 본인인증을 먼저 완료해주세요.", "error");
      return;
    }
    const phone = normalizePhone(document.querySelector("#profileCompletePhone").value);
    const organization = document.querySelector("#profileCompleteOrganization").value.trim();
    const kakaoUser = (session.user.app_metadata?.providers || []).includes("kakao");
    const needsPassword = kakaoUser && !profile.password_set_at;
    const newPassword = document.querySelector("#profileCompletePassword").value;
    const passwordConfirm = document.querySelector("#profileCompletePasswordConfirm").value;
    if (needsPassword && (!passwordIsValid(newPassword) || newPassword !== passwordConfirm)) {
      setMessage("서비스 비밀번호를 영문·숫자·특수문자 8~12자리로 동일하게 입력해주세요.", "error");
      return;
    }
    if (phone && phone.replace(/\D/g, "").length < 9) {
      setMessage("연락처를 다시 확인해주세요.", "error");
      return;
    }
    if (!phone && !organization) {
      setMessage("전화번호 또는 학교/소속 중 하나 이상 입력해주세요.", "error");
      return;
    }

    const submitButton = profileCompleteForm.querySelector('[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = "저장 중...";
    if (needsPassword) {
      const { error: passwordError } = await client.auth.updateUser({ password:newPassword });
      if (passwordError) {
        submitButton.disabled = false;
        submitButton.textContent = "기본 정보 저장";
        setMessage(`서비스 비밀번호를 저장하지 못했습니다: ${passwordError.message}`, "error");
        return;
      }
    }
    const { data, error } = await client
      .from("profiles")
      .update({
        organization: organization || null,
        password_set_at: needsPassword ? new Date().toISOString() : profile.password_set_at,
        profile_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.user.id)
      .select("email, full_name, phone, birth_date, identity_verified_at, adult_verified_at, password_set_at, organization, role, status")
      .single();
    submitButton.disabled = false;
    submitButton.textContent = "기본 정보 저장";

    if (error) {
      setMessage(`기본 정보를 저장하지 못했습니다: ${error.message}`, "error");
      return;
    }
    profile = data;
    window.motfCurrentUserProfile = profile;
    window.localStorage.removeItem(profileCompletionDismissKey());
    updateAccountView();
    closeModal();
    showToast("기본 정보가 저장되었습니다.");
  });

  document.addEventListener("click", async (event) => {
    const closeButton = event.target.closest("[data-auth-close]");
    if (closeButton) {
      closeModal();
      return;
    }

    const tabButton = event.target.closest("[data-auth-tab]");
    if (tabButton) {
      switchTab(tabButton.dataset.authTab);
      return;
    }

    if (event.target.closest("[data-kakao-login]")) {
      await signInWithKakao(event.target.closest("[data-kakao-login]"));
      return;
    }

    const identityButton = event.target.closest("[data-identity-verify]");
    if (identityButton) {
      const purpose = identityButton.dataset.identityVerify;
      const originalText = identityButton.textContent;
      identityButton.disabled = true;
      identityButton.textContent = "인증창 여는 중...";
      setMessage("");
      try {
        const identity = await startIdentityVerification(purpose);
        if (purpose === "signup") {
          verifiedIdentity = identity;
          document.querySelector("#customerSignupName").value = identity.person.name;
          document.querySelector("#customerSignupPhone").value = formatPhone(identity.person.phone);
          document.querySelector("#customerSignupBirthDate").value = identity.person.birthDate;
          showIdentityResult("#signupIdentityResult", identity);
        } else if (purpose === "password_reset") {
          passwordResetIdentity = identity;
          showIdentityResult("#passwordIdentityResult", identity);
        } else if (purpose === "profile_upgrade") {
          const { data: sessionData } = await client.auth.getSession();
          await apiJson("/api/identity-attach", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionData.session?.access_token || ""}` },
            body: JSON.stringify({ identityToken: identity.token }),
          });
          document.querySelector("#profileCompletePhone").value = formatPhone(identity.person.phone);
          showIdentityResult("#profileIdentityResult", identity);
          await refreshAuthUi();
        }
        setMessage("본인인증이 완료되었습니다.", "success");
      } catch (error) {
        setMessage(error.message || "본인인증에 실패했습니다.", "error");
      } finally {
        identityButton.disabled = false;
        identityButton.textContent = originalText;
      }
      return;
    }

    if (event.target.closest("[data-password-reset]")) {
      const email = document.querySelector("#customerLoginEmail").value.trim();
      loginForm.hidden = true;
      signupForm.hidden = true;
      passwordForm.hidden = true;
      profileCompleteForm.hidden = true;
      identityPasswordResetForm.hidden = false;
      document.querySelector(".auth-tabs").hidden = true;
      document.querySelector("#authTitle").textContent = "비밀번호 재설정";
      document.querySelector("#identityResetEmail").value = email;
      setMessage("가입한 본인의 휴대폰 인증이 필요합니다.");
      return;
    }

    if (event.target.closest("[data-auth-back-login]")) {
      switchTab("login");
      return;
    }

    if (event.target.closest("[data-open-password-change]")) {
      if (!session?.user) {
        openModal("login");
        setMessage("로그인 후 비밀번호를 변경할 수 있어요.");
        return;
      }
      openPasswordChange();
      return;
    }

    if (event.target.closest("[data-profile-complete-later]")) {
      const key = profileCompletionDismissKey();
      if (key) window.localStorage.setItem(key, "1");
      closeModal();
      return;
    }

    if (event.target.closest("[data-auth-logout]")) {
      await client.auth.signOut();
      session = null;
      profile = null;
      await refreshAuthUi();
      if (typeof window.navigate === "function") window.navigate("home");
      showToast("로그아웃되었습니다.");
      return;
    }

    const accountWithdrawalButton = event.target.closest("[data-account-withdrawal]");
    if (accountWithdrawalButton) {
      if (!requireLogin()) return;

      const confirmed = window.confirm(
        "회원 탈퇴를 요청할까요?\n진행 중인 예약, 주문, 입금 대기 건이 있으면 탈퇴가 처리되지 않습니다.",
      );
      if (!confirmed) return;

      const reasonInput = window.prompt("탈퇴 사유를 남길 수 있어요. 건너뛰려면 빈칸으로 두세요.", "");
      if (reasonInput === null) return;

      const originalHtml = accountWithdrawalButton.innerHTML;
      accountWithdrawalButton.disabled = true;
      accountWithdrawalButton.textContent = "탈퇴 요청 중...";

      const { data: sessionData } = await client.auth.getSession();
      const activeAccessToken = sessionData?.session?.access_token;
      const response = await fetch("/api/account-withdrawal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(activeAccessToken ? { Authorization: `Bearer ${activeAccessToken}` } : {}),
        },
        body: JSON.stringify({
          reason: reasonInput.trim(),
        }),
      });
      const result = await response.json().catch(() => null);

      accountWithdrawalButton.disabled = false;
      accountWithdrawalButton.innerHTML = originalHtml;
      if (typeof window.refreshIcons === "function") window.refreshIcons();

      if (!response.ok || !result?.ok) {
        showToast(result?.message || "회원 탈퇴 요청을 처리하지 못했습니다.");
        return;
      }

      await unlinkOAuthIdentitiesForWithdrawal();
      await client.auth.signOut();
      session = null;
      profile = null;
      window.motfClearUserScopedState?.();
      await refreshAuthUi();
      if (typeof window.navigate === "function") window.navigate("home");
      showToast("회원 탈퇴 요청이 처리되었습니다. 이용해주셔서 감사합니다.");
      return;
    }

    const accountSaveButton = event.target.closest("[data-account-save]");
    if (accountSaveButton) {
      if (!requireLogin()) return;
      const accountForm = document.querySelector("#accountForm");
      const inputs = [...accountForm.querySelectorAll("input")];
      const newPassword = inputs[1]?.value || "";
      const organization = inputs[2]?.value.trim() || "";
      const phone = normalizePhone(inputs[3]?.value || "");
      if (phone && phone.replace(/\D/g, "").length < 9) {
        showToast("연락처를 다시 확인해주세요.");
        inputs[3]?.focus();
        return;
      }

      const originalHtml = accountSaveButton.innerHTML;
      accountSaveButton.disabled = true;
      accountSaveButton.textContent = "저장 중...";
      if (newPassword && !passwordIsValid(newPassword)) {
        accountSaveButton.disabled = false;
        accountSaveButton.innerHTML = originalHtml;
        showToast("새 비밀번호는 영문·숫자·특수문자를 포함한 8~12자리여야 합니다.");
        return;
      }
      if (newPassword) {
        const { error: passwordError } = await client.auth.updateUser({ password: newPassword });
        if (passwordError) {
          accountSaveButton.disabled = false;
          accountSaveButton.innerHTML = originalHtml;
          showToast("비밀번호를 변경하지 못했습니다. 다시 로그인한 뒤 시도해주세요.");
          return;
        }
        inputs[1].value = "";
      }
      const { data, error } = await client
        .from("profiles")
        .update({
          organization: organization || null,
          phone: phone || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", session.user.id)
        .select("email, full_name, phone, organization, role, status")
        .single();
      accountSaveButton.disabled = false;
      accountSaveButton.innerHTML = originalHtml;
      if (typeof window.refreshIcons === "function") window.refreshIcons();

      if (error) {
        showToast("회원정보를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.");
        return;
      }
      profile = data;
      updateAccountView();
      showToast("회원정보가 저장되었습니다.");
    }
  });

  document.addEventListener("input", (event) => {
    const target = event.target;
    if (!target?.matches?.('input[type="tel"], #bookingPhone')) return;
    applyPhoneMask(target);
  });

  document.addEventListener("click", (event) => {
    if (session?.user) return;

    const routeButton = event.target.closest("[data-route]");
    const route = routeButton?.dataset.route;
    if (route && protectedRoutes.has(route)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      requireLogin(() => window.navigate?.(route));
      return;
    }

    const chatButton = event.target.closest("[data-open-chat]");
    if (chatButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const title = chatButton.dataset.openChat;
      requireLogin(() => window.ensureChat?.(title));
      return;
    }

    const protectedAction = event.target.closest(
      "[data-community-write], [data-open-recreation-form], [data-like-activity], [data-like-post], [data-focus-activity-comment], [data-focus-post-comment]",
    );
    if (protectedAction) {
      event.preventDefault();
      event.stopImmediatePropagation();
      requireLogin();
    }
  }, true);

  document.addEventListener("submit", (event) => {
    if (session?.user || !protectedFormIds.has(event.target.id)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    requireLogin();
  }, true);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) closeModal();
  });

  client.auth.onAuthStateChange((event, nextSession) => {
    const previousUserId = lastUserId;
    session = nextSession;
    const nextUserId = nextSession?.user?.id || null;
    lastUserId = nextUserId;
    window.motfCurrentUserId = nextUserId || "";
    window.motfCurrentUserEmail = nextSession?.user?.email || "";
    if (event === "SIGNED_OUT" || event === "SIGNED_IN" || (previousUserId && previousUserId !== nextUserId)) {
      profile = null;
      window.motfCurrentUserProfile = null;
      window.motfClearUserScopedState?.();
    }
    if (event === "PASSWORD_RECOVERY") {
      window.setTimeout(openPasswordChange, 0);
    }
    window.setTimeout(async () => {
      await refreshAuthUi();
      if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        maybePromptProfileCompletion();
        requestWelcomeEmail();
      }
    }, 0);
  });

  (async function initializeAuth() {
    const { data } = await client.auth.getSession();
    session = data.session;
    lastUserId = session?.user?.id || null;
    window.motfCurrentUserId = lastUserId || "";
    window.motfCurrentUserEmail = session?.user?.email || "";
    await refreshAuthUi();
    await blockInactiveUserSession();
    maybePromptProfileCompletion();
    requestWelcomeEmail();

    const activeRoute = typeof window.currentRoute === "function" ? window.currentRoute() : "home";
    if (!session?.user && protectedRoutes.has(activeRoute)) {
      window.navigate?.("home", { record: false, replace: true });
      openModal("login", () => window.navigate?.(activeRoute));
      setMessage("이 기능은 로그인 후 이용할 수 있어요.");
    }
  })();
})();
