# moTF 사장님 앱 배포

1. GitHub의 `5millionbrothers/motf-owner-app`에서 작업 브랜치를 만듭니다.
2. Pull Request의 자동 검사와 Vercel Preview를 확인합니다.
3. Vercel 환경변수에 아래 공개 설정을 등록합니다.

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

4. Supabase Authentication의 Site URL과 Redirect URLs에 실제 Vercel 주소와
   `http://localhost:3000/**`을 등록합니다.
5. 일반 이용자, 승인 전 파트너, 승인 파트너, 관리자 계정으로 각각 접근 권한을 시험합니다.

`.env.local`, Supabase `service_role`, 결제 비밀 키는 GitHub에 올리지 않습니다.
