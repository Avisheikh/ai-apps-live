import { randomBytes } from "node:crypto";
import { verifyPassword } from "./hash";

export interface SessionData {
  token: string;
  csrfToken: string;
  createdAt: number;
  expiresAt: number;
}

// In-memory active sessions (TTL 12 hours)
const sessions = new Map<string, SessionData>();

// In-memory login rate limiter: 5 attempts per 15 minutes per IP
interface RateLimitEntry {
  attempts: number;
  resetAt: number;
}
const loginRateLimits = new Map<string, RateLimitEntry>();

export function checkLoginRateLimit(ip: string): { allowed: boolean; remainingAttempts: number; retryAfterSeconds?: number } {
  const now = Date.now();
  const entry = loginRateLimits.get(ip);

  if (!entry || now > entry.resetAt) {
    loginRateLimits.set(ip, { attempts: 1, resetAt: now + 15 * 60 * 1000 });
    return { allowed: true, remainingAttempts: 4 };
  }

  if (entry.attempts >= 5) {
    const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, remainingAttempts: 0, retryAfterSeconds };
  }

  entry.attempts += 1;
  return { allowed: true, remainingAttempts: 5 - entry.attempts };
}

export function resetLoginRateLimit(ip: string): void {
  loginRateLimits.delete(ip);
}

export function createSession(): SessionData {
  const token = randomBytes(32).toString("hex");
  const csrfToken = randomBytes(24).toString("hex");
  const now = Date.now();
  const expiresAt = now + 12 * 60 * 60 * 1000; // 12 hours

  const session: SessionData = {
    token,
    csrfToken,
    createdAt: now,
    expiresAt,
  };

  sessions.set(token, session);
  return session;
}

export function getSession(token?: string | null): SessionData | null {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;

  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }

  return session;
}

export function deleteSession(token: string): void {
  sessions.delete(token);
}

export function verifyAdminCredentials(password: string): boolean {
  const expectedHash = process.env.ADMIN_PASSWORD_HASH;
  if (!expectedHash) {
    console.error("[Auth] ADMIN_PASSWORD_HASH is unset. Access refused.");
    return false;
  }
  return verifyPassword(password, expectedHash);
}

export function validateAdminRequest(request: Request): { authorized: boolean; error?: string; session?: SessionData } {
  const cookies = request.headers.get("cookie") || "";
  const match = cookies.match(/ai_apps_session=([a-zA-Z0-9]+)/);
  const token = match ? match[1] : null;

  const session = getSession(token);
  if (!session) {
    return { authorized: false, error: "Authentication required" };
  }

  // State-changing requests (POST, PATCH, PUT, DELETE) require CSRF token validation
  const method = request.method.toUpperCase();
  if (["POST", "PATCH", "PUT", "DELETE"].includes(method)) {
    const providedCsrf = request.headers.get("x-csrf-token");
    if (!providedCsrf || providedCsrf !== session.csrfToken) {
      return { authorized: false, error: "Invalid or missing CSRF token" };
    }
  }

  return { authorized: true, session };
}
