# moTF 사장님 앱 배포

1. GitHub의 `5millionbrothers/motf-owner-app`에서 작업 브랜치를 만듭니다.
2. Pull Request의 자동 검사와 Vercel Preview를 확인합니다.
3. Vercel 환경변수에 아래 공개 설정을 등록합니다.

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NAVER_MAP_KEY_ID
```

4. Supabase Authentication의 Site URL과 Redirect URLs에 실제 Vercel 주소와
   `https://motfowner.co.kr/**`, `https://www.motfowner.co.kr/**`,
   `http://localhost:3000/**`을 등록합니다.
5. 네이버 클라우드 Maps 애플리케이션에 `Web Dynamic Map`과 `Geocoding`을 활성화하고
   아래 Web 서비스 URL을 등록합니다.

```text
https://motfowner.co.kr
https://www.motfowner.co.kr
```

6. 일반 이용자, 승인 전 파트너, 승인 파트너, 관리자 계정으로 각각 접근 권한을 시험합니다.
7. 승인 파트너 계정에서 주소 검색, 주소 위치 확인, 저장 후 이용자 지도 마커 표시를 확인합니다.

`.env.local`, Supabase `service_role`, 결제 비밀 키는 GitHub에 올리지 않습니다.
