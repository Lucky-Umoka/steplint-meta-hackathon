import type { NextConfig } from "next";
import { readFileSync } from "node:fs";
import { devOrigins } from "./src/config/dev-origins";

// The displayed version always comes from package.json (only the number is exposed).
const appVersion = (
  JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
    version: string;
  }
).version;

const config: NextConfig = {
  poweredByHeader: false,
  // Public transport policy only; never expose provider keys.
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
    NEXT_PUBLIC_TEACH_UPLOAD_PROFILE:
      process.env.VERCEL === "1"
        ? "vercel"
        : process.env.NEXT_PUBLIC_TEACH_UPLOAD_PROFILE || "standard",
  },
  // Vercel's Next.js adapter expects .next. Keep local test builds isolated
  // so rebuilding never replaces files served by the development server.
  distDir:
    process.env.VERCEL === "1" || process.env.NODE_ENV === "development"
      ? ".next"
      : process.env.STEPLINT_LOCAL_BUILD === "1"
        ? ".next-local-qa"
        : process.env.STEPLINT_VERIFY_BUILD === "1"
          ? ".next-verify"
          : ".next-production",
  allowedDevOrigins: devOrigins(process.env),
};
export default config;
