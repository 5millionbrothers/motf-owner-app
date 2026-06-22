# moTF 사장님·운영팀 웹

하나의 로그인 화면에서 계정 역할에 따라 사장님 대시보드와 운영팀 대시보드를 분리하는 앱입니다.

## 현재 운영 화면

- 현재 Vercel 운영 화면의 기준 원본은 `public/owner/index.html`과 `public/owner/owner-data.js`입니다.
- `/` 접속은 `next.config.ts`에 의해 `/owner/index.html`로 이동합니다.
- `src/`의 Next.js 화면은 기능 이전을 위한 차기 구조이며 현재 운영 화면이 아닙니다.
- 기능 안정화 기간에는 같은 기능을 두 구조에 중복 구현하지 않습니다.

자세한 기준은 [`docs/owner-ui-architecture.md`](docs/owner-ui-architecture.md)를 확인합니다.

## 권한

- `partner / approved`: 자기 업장 정보, 거래, 채팅 관리
- `admin / approved`: 전체 업장, 회원, 거래, 문의 모니터링과 처리
- 일반 이용자 계정은 이 앱의 대시보드에 들어갈 수 없습니다.

공개 데모 계정 우회는 제거되어 있으며 Supabase 인증과 실제 데이터만 사용합니다.

## 로컬 실행

```bash
pnpm install --frozen-lockfile
pnpm dev
```

`.env.local`:

```text
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

비밀 키와 `service_role` 키는 이 앱에 넣지 않습니다. DB 변경 원본은
[motf-database](https://github.com/5millionbrothers/motf-database)에서만 관리합니다.

## 배포 절차

1. 기능별 브랜치에서 수정합니다.
2. Pull Request를 만들고 `lint`와 `build` 검사를 통과시킵니다.
3. 친구가 변경 내용을 확인한 뒤 `main`에 합칩니다.
4. Vercel Preview에서 역할별 로그인을 시험한 후 운영 배포를 확인합니다.

## 남은 구조 정리

현재 운영 중인 `public/owner/` 기능을 목록화하고 Next.js로 한 화면씩 이전합니다. 인증, 업장 관리,
거래, 채팅, 문의 기능이 모두 이전되고 역할별 회귀 테스트를 통과한 뒤에만 루트 리다이렉트를 제거합니다.
