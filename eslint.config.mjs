import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Supabase 초기 조회는 effect 안에서 상태를 채우는 현재 앱 구조를 사용한다.
      // 데이터 계층을 별도 훅으로 분리할 때 다시 활성화한다.
      "react-hooks/set-state-in-effect": "off",
      // 관리자 화면의 서로 다른 테이블 행을 공통 렌더러로 다루는 동안 경고로 유지한다.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
