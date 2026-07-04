import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // ★セッション分離の構造的ガード（本バッチの本丸）。
  //   auth cookie を持つ Supabase クライアント（createBrowserClient/createServerClient）は
  //   surface→cookie名を強制注入する中央factory（lib/supabase/client.ts・server.ts）と proxy.ts でのみ構築できる。
  //   これ以外のファイルからの @supabase/ssr 直接importを禁止＝新規の認証入口が surface 分離をバイパスすることが
  //   「構造的に不可能」になる（過去に app/auth/magic 等が生 createBrowserClient で分離を破って再発した根本の封鎖）。
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs}"],
    ignores: [
      "lib/supabase/**",
      "proxy.ts",
    ],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [{
          name: "@supabase/ssr",
          importNames: ["createBrowserClient", "createServerClient"],
          message: "認証クライアントは lib/supabase の中央factory（createClient / makeSurfaceServerClient）経由で構築すること。surface別cookie名の取り違え＝3面セッション奪い合いの再発を防ぐための構造ガード。",
        }],
      }],
    },
  },
]);

export default eslintConfig;
