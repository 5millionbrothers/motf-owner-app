# moTF 사장님·운영팀 웹

하나의 로그인 화면에서 계정 역할에 따라 사장님 대시보드와 운영팀 대시보드를 분리하는 Next.js 앱입니다.

## 권한

- `partner / approved`: 자기 업장 정보, 거래, 채팅 관리
- `admin / approved`: 전체 업장, 회원, 거래, 문의 모니터링과 처리
- 일반 이용자 계정은 이 앱의 대시보드에 들어갈 수 없습니다.

최종 앱은 `src/`의 Next.js 구현입니다. `public/owner/`는 기능 이전 중인 레거시 화면이며,
공개 데모 계정 우회는 제거되었습니다. 새 기능은 레거시에 추가하지 않습니다.

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

레거시 `public/owner/`에만 있는 상품·이미지·공판장 주문 관리 기능을 Next.js로 옮긴 뒤
레거시 폴더를 삭제합니다. 기능 이전 전에는 폴더를 먼저 삭제하지 않습니다.
