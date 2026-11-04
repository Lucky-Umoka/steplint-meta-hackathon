import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  { rules: { "@typescript-eslint/no-explicit-any": "error" } },
  globalIgnores([
    // Agent worktrees are separate checkouts, not project source.
    ".claude/**",
    ".next/**",
    ".next-production/**",
    ".next-verify/**",
    ".next-local-qa/**",
    "next-env.d.ts",
    "coverage/**",
    ".media-lab/**",
    "public/mediapipe-wasm/**",
  ]),
]);
