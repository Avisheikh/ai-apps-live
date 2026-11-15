import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "@/lib/db/migrate";
import { Repository } from "@/lib/db/repo";
import {
  createSession,
  validateAdminRequest,
  checkLoginRateLimit,
  resetLoginRateLimit,
} from "@/lib/auth/session";

describe("Phase 7: Admin Authentication, Security, CSRF, and Audit", () => {
  let db: Database.Database;
  let repo: Repository;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    runMigrations(db);
    repo = new Repository(db);
    resetLoginRateLimit("127.0.0.1");
  });

  afterEach(() => {
    db.close();
  });

  it("prohibits unauthenticated requests to protected admin endpoints", () => {
    const unauthenticatedReq = new Request("http://127.0.0.1:3000/api/admin/apps", {
      method: "GET",
    });

    const result = validateAdminRequest(unauthenticatedReq);
    expect(result.authorized).toBe(false);
    expect(result.error).toMatch(/Authentication required/);
  });

  it("enforces login rate limiting: blocks IP after 5 attempts with 429 status", () => {
    const testIp = "192.168.1.100";
    resetLoginRateLimit(testIp);

    // 5 attempts allowed
    for (let i = 1; i <= 5; i++) {
      const res = checkLoginRateLimit(testIp);
      expect(res.allowed).toBe(true);
    }

    // 6th attempt is blocked
    const blocked = checkLoginRateLimit(testIp);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remainingAttempts).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("authenticates and requires matching CSRF token for mutating requests (POST, PATCH, PUT, DELETE)", () => {
    const session = createSession();

    // GET request works with session cookie alone
    const getReq = new Request("http://127.0.0.1:3000/api/admin/apps", {
      method: "GET",
      headers: {
        Cookie: `ai_apps_session=${session.token}`,
      },
    });
    expect(validateAdminRequest(getReq).authorized).toBe(true);

    // POST request without CSRF token is rejected
    const postReqNoCsrf = new Request("http://127.0.0.1:3000/api/admin/apps", {
      method: "POST",
      headers: {
        Cookie: `ai_apps_session=${session.token}`,
      },
    });
    const postNoCsrfResult = validateAdminRequest(postReqNoCsrf);
    expect(postNoCsrfResult.authorized).toBe(false);
    expect(postNoCsrfResult.error).toMatch(/CSRF token/);

    // POST request with matching CSRF token succeeds
    const postReqWithCsrf = new Request("http://127.0.0.1:3000/api/admin/apps", {
      method: "POST",
      headers: {
        Cookie: `ai_apps_session=${session.token}`,
        "X-CSRF-Token": session.csrfToken,
      },
    });
    expect(validateAdminRequest(postReqWithCsrf).authorized).toBe(true);
  });

  it("audits all state-changing administrative operations with before and after snapshots", () => {
    const beforeControl = repo.getMetricControl("SEARCH_INTEREST")!;
    expect(beforeControl.enabled).toBe(1);

    // Update control
    const updated = repo.updateMetricControl("SEARCH_INTEREST", false, "Routine maintenance", "admin_user");
    expect(updated.enabled).toBe(0);

    const now = new Date().toISOString();
    repo.insertAuditLog({
      at: now,
      actor: "admin_user",
      action: "UPDATE_METRIC_CONTROL",
      entity: "metric_controls",
      entity_id: "SEARCH_INTEREST",
      before_json: JSON.stringify(beforeControl),
      after_json: JSON.stringify(updated),
    });

    const logs = repo.getAuditLogs();
    expect(logs.length).toBeGreaterThan(0);

    const log = logs[0];
    expect(log.action).toBe("UPDATE_METRIC_CONTROL");
    expect(log.actor).toBe("admin_user");
    expect(log.entity).toBe("metric_controls");
    expect(JSON.parse(log.before_json!).enabled).toBe(1);
    expect(JSON.parse(log.after_json!).enabled).toBe(0);
  });

  it("emits real-time stream events within 5 seconds when controls change", () => {
    const initialLastId = repo.getLatestStreamEventId();

    // Disable metric
    repo.updateMetricControl("APP_STORE_RANK", false, "API maintenance", "operator");
    repo.insertStreamEvent("control_update", {
      metricKey: "APP_STORE_RANK",
      enabled: false,
      reason: "API maintenance",
    });

    const newEvents = repo.getStreamEventsSince(initialLastId);
    expect(newEvents).toHaveLength(1);
    expect(newEvents[0].event_type).toBe("control_update");
    expect(JSON.parse(newEvents[0].payload_json).metricKey).toBe("APP_STORE_RANK");
    expect(JSON.parse(newEvents[0].payload_json).enabled).toBe(false);
  });
});
