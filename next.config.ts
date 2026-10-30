import type { NextConfig } from "next";
import { devOrigins } from "./src/config/dev-origins";
const config: NextConfig = { poweredByHeader: false, distDir: process.env.NODE_ENV === "development" ? ".next" : process.env.STEPLINT_VERIFY_BUILD === "1" ? ".next-verify" : ".next-production", allowedDevOrigins: devOrigins(process.env) };
export default config;
