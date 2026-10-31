import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { SESSION_MS } from "../../teach/schema";

export class TeachError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
function secret() {
  const token = process.env.TEACH_ACCESS_TOKEN;
  if (!token || token.length < 32) throw new TeachError(503, "Teach is not configured. Set a private TEACH_ACCESS_TOKEN of at least 32 characters on the server.");
  return token;
}
function equal(a: string, b: string) { return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest()); }
export function matchesAccessToken(value: string) { return equal(value, secret()); }
function key() { return createHash("sha256").update(`steplint-teach-v1:${secret()}`).digest(); }
export function seal(value: unknown, purpose: string, session: string, ttlMs = SESSION_MS) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(purpose));
  const data = Buffer.concat([cipher.update(JSON.stringify({ value, session, expiresAt: Date.now() + ttlMs })), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url");
}
export function unseal(token: string, purpose: string, session: string, allowExpired = false): unknown {
  if (token.length > 1_000_000) throw new TeachError(400, "Lesson reference too large.");
  try {
    const data = Buffer.from(token, "base64url");
    if (data.toString("base64url") !== token || data.length < 29) throw new Error("Noncanonical reference");
    const decipher = createDecipheriv("aes-256-gcm", key(), data.subarray(0, 12));
    decipher.setAAD(Buffer.from(purpose)); decipher.setAuthTag(data.subarray(12, 28));
    const decoded: unknown = JSON.parse(Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString());
    if (!decoded || typeof decoded !== "object" || !("session" in decoded) || !("expiresAt" in decoded) || !("value" in decoded) || decoded.session !== session || typeof decoded.expiresAt !== "number" || (!allowExpired && decoded.expiresAt < Date.now())) throw new Error("Invalid reference");
    return decoded.value;
  } catch { throw new TeachError(401, "Lesson reference is invalid, expired, or belongs to another session."); }
}
export function requireSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const url = new URL(request.url);
  const allowed = new Set([url.origin, `${url.protocol}//${request.headers.get("host") ?? url.host}`]);
  // Trust only exact origins derived from server configuration, never arbitrary proxy headers.
  const configured = process.env.TEACH_PUBLIC_ORIGIN;
  if (configured) {
    let parsed: URL;
    try { parsed = new URL(configured); } catch { throw new TeachError(503, "TEACH_PUBLIC_ORIGIN must be an exact HTTP(S) origin."); }
    if (!["http:", "https:"].includes(parsed.protocol) || configured !== parsed.origin) throw new TeachError(503, "TEACH_PUBLIC_ORIGIN must be an exact HTTP(S) origin without a path.");
    allowed.add(parsed.origin);
  }
  const codespace = process.env.CODESPACE_NAME;
  const domain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
  if (codespace && domain && /^[a-z0-9-]+$/i.test(codespace) && /^[a-z0-9.-]+$/i.test(domain)) {
    allowed.add(`https://${codespace}-${url.port || process.env.PORT || "3000"}.${domain}`);
  }
  for (const host of [process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]) {
    if (host && /^[a-z0-9.-]+$/i.test(host)) allowed.add(`https://${host}`);
  }
  // Browsers reserve Sec-* headers: page JavaScript cannot forge same-origin.
  // A TLS/preview proxy can rewrite Host and the URL without changing this signal.
  const site = request.headers.get("sec-fetch-site");
  if (site === "cross-site" || site === "same-site") throw new TeachError(403, "Cross-origin Teach requests are not allowed.");
  if (site === "same-origin" && origin) {
    try {
      const browserOrigin = new URL(origin);
      if (["http:", "https:"].includes(browserOrigin.protocol) && browserOrigin.origin === origin) return;
    } catch { /* Invalid/opaque Origin still fails the explicit allowlist below. */ }
  }
  if (origin && !allowed.has(origin)) throw new TeachError(403, "Cross-origin Teach requests are not allowed.");
}
export class TeachStageError extends TeachError {
  readonly stage: string;
  constructor(stage: string, error: unknown) {
    const safe = safeError(error);
    super(safe.status, `${stage}: ${safe.message}`);
    this.stage = stage;
    this.cause = error;
  }
}
export function authorize(request: Request) {
  requireSameOrigin(request);
  const bearer = request.headers.get("authorization");
  if (bearer && matchesAccessToken(bearer.replace(/^Bearer /, ""))) return "owner-cli";
  const cookie = request.headers.get("cookie")?.split(";").map((c) => c.trim()).find((c) => c.startsWith("steplint-teach="))?.slice("steplint-teach=".length);
  if (!cookie) throw new TeachError(401, "Unlock your private Teach workspace first.");
  const session = unseal(cookie, "access", "owner");
  if (typeof session !== "string") throw new TeachError(401, "Invalid workspace session.");
  return session;
}
export function safeError(error: unknown): { status: number; message: string } {
  if (error instanceof TeachError) return { status: error.status, message: error.message };
  if (error instanceof Error && error.message === "MODEL_API_KEY is required for model requests.") return { status: 503, message: "Model credentials are not configured on this server." };
  if (error instanceof Error && ["APIConnectionError", "APIConnectionTimeoutError", "TimeoutError", "AbortError"].includes(error.name)) return { status: 502, message: "Meta connection failed or timed out. No automatic retry was made." };
  if (error && typeof error === "object" && "status" in error && typeof error.status === "number") return { status: error.status === 429 ? 429 : 502, message: error.status === 429 ? "Meta rate limit reached. No automatic retry was made." : `Meta request failed (HTTP ${error.status}). No automatic retry was made.` };
  return { status: 422, message: "Lesson processing or validation failed. Review the clip, selections, or draft; no success was assumed." };
}
