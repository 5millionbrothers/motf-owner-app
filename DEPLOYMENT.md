# moTF 배포 순서

## 1. GitHub 저장소 만들기

1. GitHub에서 **New repository**를 선택합니다.
2. 저장소 이름을 `motf-app`으로 입력합니다.
3. 공개 전이라면 **Private**을 권장합니다.
4. README, .gitignore, License 자동 추가는 선택하지 않고 저장소를 생성합니다.
5. 이 프로젝트의 파일을 저장소 최상위에 업로드합니다.

업로드에서 제외해야 하는 항목:

- `node_modules`
- `.next`
- `.env.local`

## 2. Vercel 배포

1. Vercel에 GitHub 계정으로 로그인합니다.
2. **Add New → Project**에서 `motf-app` 저장소를 선택합니다.
3. Framework Preset이 `Next.js`인지 확인합니다.
4. Environment Variables에 다음 값을 등록합니다.

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

5. **Deploy**를 선택합니다.

## 3. Supabase 주소 변경

Vercel 배포 주소가 발급되면 Supabase의 **Authentication → URL Configuration**에서:

- Site URL: Vercel 배포 주소
- Redirect URLs: `https://발급주소.vercel.app/**`

로 변경합니다. 개발용 `http://localhost:3000/**`은 그대로 남겨도 됩니다.

## 4. 최종 시험

- 회원가입
- 이메일 인증
- 일반 로그인
- 운영팀 로그인
- 사장님 가입 승인
- 로그아웃
- 모바일 화면

을 실제 Vercel 주소에서 확인합니다.
