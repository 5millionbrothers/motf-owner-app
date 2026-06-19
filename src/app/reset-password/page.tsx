"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const supabase = getSupabaseClient();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => setReady(Boolean(data.session)));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setReady(true);
    });
    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
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
      setLoading(false);
      return;
    }

    await supabase.auth.signOut();
    router.replace("/?passwordChanged=1");
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand-area"><div className="brand">moTF</div><p>안전한 계정 복구</p></div>
        <div className="auth-content">
          <h1>새 비밀번호 설정</h1>
          <p className="subtitle">앞으로 사용할 새 비밀번호를 입력해 주세요.</p>
          {error && <div className="notice error-notice">{error}</div>}
          {!ready ? (
            <div className="notice error-notice">재설정 링크를 확인하고 있습니다. 계속 표시되면 새 재설정 메일을 받아주세요.</div>
          ) : (
            <form className="auth-form" onSubmit={updatePassword}>
              <label>새 비밀번호<input name="password" type="password" minLength={8} required autoComplete="new-password" /></label>
              <label>새 비밀번호 확인<input name="passwordConfirm" type="password" minLength={8} required autoComplete="new-password" /></label>
              <button className="primary-button" disabled={loading}>{loading ? "변경 중..." : "새 비밀번호 저장"}</button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
