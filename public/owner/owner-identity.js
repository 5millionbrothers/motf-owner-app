(function setupOwnerIdentity() {
  const API_BASE = "https://motf.co.kr";
  let signupIdentity = null;
  let resetIdentity = null;

  function passwordIsValid(value) {
    return /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d\s]).{8,12}$/.test(String(value || ""));
  }

  function formatPhone(value) {
    const digits = String(value || "").replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }

  async function api(path, body) {
    const response = await fetch(`${API_BASE}${path}`, { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify(body) });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) throw new Error(result?.message || "요청을 처리하지 못했습니다.");
    return result;
  }

  async function verify(purpose) {
    const email = purpose === "password_reset"
      ? document.getElementById("ownerResetEmail").value.trim()
      : document.getElementById("signupId").value.trim();
    if (purpose === "password_reset" && !email) throw new Error("가입 이메일을 먼저 입력해주세요.");
    const start = await api("/api/identity-start", { purpose, email, accountType:"partner", returnUrl:location.href, mobile:innerWidth<720 });
    const popup = window.open("", "motf_identity", "width=430,height=640,toolbar=no,menubar=no,scrollbars=yes,resizable=yes");
    if (!popup) throw new Error("팝업을 허용해주세요.");
    const form = document.createElement("form");
    form.method="POST"; form.action=start.callUrl; form.target="motf_identity";
    Object.entries(start.form || {}).forEach(([name,value]) => { const input=document.createElement("input"); input.type="hidden"; input.name=name; input.value=value; form.appendChild(input); });
    document.body.appendChild(form); form.submit(); form.remove();
    return new Promise((resolve,reject) => {
      const timer=setTimeout(() => { cleanup(); reject(new Error("인증 시간이 만료되었습니다.")); },600000);
      const listener=async(event) => {
        if(event.origin!==API_BASE) return;
        if(event.data?.type!=="motf:kcp-identity") return;
        cleanup();
        if(!event.data.ok) return reject(new Error(event.data.message||"본인인증에 실패했습니다."));
        try { resolve(await api("/api/identity-status",{ identityToken:start.identityToken,purpose }).then(result=>({token:start.identityToken,person:result.person}))); } catch(error){ reject(error); }
      };
      function cleanup(){ clearTimeout(timer); removeEventListener("message",listener); }
      addEventListener("message",listener);
    });
  }

  window.startOwnerIdentity = async function(purpose) {
    try {
      const identity=await verify(purpose);
      const target=document.getElementById(purpose==="owner_signup"?"ownerSignupIdentityResult":"ownerPasswordIdentityResult");
      target.hidden=false; target.textContent=`본인인증 완료 · ${identity.person.name} · ${formatPhone(identity.person.phone)} · ${identity.person.birthDate}`;
      if(purpose==="owner_signup") {
        signupIdentity=identity;
        document.getElementById("signupOwnerName").value=identity.person.name;
        document.getElementById("signupPhone").value=formatPhone(identity.person.phone);
        document.getElementById("signupBirthDate").value=identity.person.birthDate;
      } else resetIdentity=identity;
    } catch(error) { alert(error.message||"본인인증에 실패했습니다."); }
  };

  window.handleSignup = async function(event) {
    event.preventDefault();
    if(!signupIdentity) return alert("휴대폰 본인인증을 먼저 완료해주세요.");
    const password=document.getElementById("signupPassword").value;
    if(!passwordIsValid(password)) return alert("비밀번호는 영문·숫자·특수문자를 포함한 8~12자리여야 합니다.");
    if(password!==document.getElementById("signupPasswordConfirm").value) return alert("비밀번호 확인이 일치하지 않습니다.");
    const button=event.submitter; button.disabled=true; button.textContent="가입 처리 중...";
    try {
      const email=document.getElementById("signupId").value.trim();
      await api("/api/identity-signup",{
        accountType:"partner", identityToken:signupIdentity.token, email, password,
        businessType:document.getElementById("signupRole").value,
        businessName:document.getElementById("signupBusinessName").value.trim(),
        emailRedirectTo:`${location.origin}/`,
      });
      document.getElementById("ownerId").value=email;
      closeSignupModal(); document.getElementById("signupForm").reset(); signupIdentity=null;
      alert("인증 메일을 보냈습니다. 이메일 인증 후 로그인해주세요.");
    } catch(error) { alert(error.message||"회원가입에 실패했습니다."); }
    finally { button.disabled=false; button.textContent="가입 완료"; }
  };

  window.openOwnerPasswordReset = function(){ document.getElementById("ownerPasswordResetModal").classList.add("active"); document.getElementById("ownerResetEmail").value=document.getElementById("ownerId").value.trim(); };
  window.closeOwnerPasswordReset = function(){ document.getElementById("ownerPasswordResetModal").classList.remove("active"); };
  window.submitOwnerPasswordReset = async function(event){
    event.preventDefault();
    if(!resetIdentity) return alert("휴대폰 본인인증을 먼저 완료해주세요.");
    const password=document.getElementById("ownerResetPassword").value;
    if(!passwordIsValid(password)) return alert("비밀번호는 영문·숫자·특수문자를 포함한 8~12자리여야 합니다.");
    if(password!==document.getElementById("ownerResetPasswordConfirm").value) return alert("비밀번호 확인이 일치하지 않습니다.");
    try {
      await api("/api/identity-password-reset",{ email:document.getElementById("ownerResetEmail").value.trim(),password,identityToken:resetIdentity.token });
      closeOwnerPasswordReset(); event.target.reset(); resetIdentity=null; alert("비밀번호가 변경되었습니다.");
    } catch(error){ alert(error.message||"비밀번호를 변경하지 못했습니다."); }
  };
})();
