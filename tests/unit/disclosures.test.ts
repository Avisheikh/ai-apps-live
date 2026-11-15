import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "@/lib/db/migrate";
import { DisclosureService, CreateDisclosureInput } from "@/lib/disclosures/service";

describe("Company Disclosures Management (Phase 5)", () => {
  let db: Database.Database;
  let service: DisclosureService;

  const sampleInput: CreateDisclosureInput = {
    app_id: 1, // ChatGPT
    metric_type: "WAU",
    metric_label: "Weekly active users",
    value_numeric: 250000000,
    value_qualifier: "ABOUT",
    unit: "users",
    geography: "GLOBAL",
    reporting_period_end: "2026-10-31",
    disclosed_at: "2026-11-05",
    source_kind: "COMPANY_BLOG",
    source_url: "https://openai.com/index/growth-update-2026",
    source_locator: "Section 2, Paragraph 1: 'Over 250 million weekly active users'",
  };

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    runMigrations(db);
    service = new DisclosureService(db);
  });

  afterEach(() => {
    db.close();
  });

  it("creates a DRAFT disclosure that is NEVER public", () => {
    const draft = service.createDraft(sampleInput, "operator_sam");
    expect(draft.id).toBeGreaterThan(0);
    expect(draft.verification_status).toBe("DRAFT");
    expect(draft.verified_by).toBeNull();
    expect(draft.verified_at).toBeNull();

    // Must be completely absent from public verified listings!
    const publicList = service.getPublicVerified();
    expect(publicList).toHaveLength(0);
  });

  it("requires HTTPS source_url and non-empty locator", () => {
    expect(() => {
      service.createDraft({ ...sampleInput, source_url: "http://insecure.test/blog" }, "operator");
    }).toThrow(/valid HTTPS URL/);

    expect(() => {
      service.createDraft({ ...sampleInput, source_locator: "   " }, "operator");
    }).toThrow(/Source locator/);

    expect(() => {
      service.createDraft({ ...sampleInput, value_numeric: -100 }, "operator");
    }).toThrow(/greater than zero/);
  });

  it("verifies a draft disclosure with mandatory note and makes it public", () => {
    const draft = service.createDraft(sampleInput, "operator_sam");

    // Fails without verifier note
    expect(() => {
      service.verifyDisclosure(draft.id, "senior_editor", "");
    }).toThrow(/verifier note is required/);

    const verified = service.verifyDisclosure(
      draft.id,
      "senior_editor",
      "Confirmed: OpenAI official blog post explicitly stated 250M weekly active users as of Oct 31 2026."
    );

    expect(verified.verification_status).toBe("VERIFIED");
    expect(verified.verified_by).toBe("senior_editor");
    expect(verified.verified_at).toBeDefined();

    // Appears in public verified list
    const publicList = service.getPublicVerified();
    expect(publicList).toHaveLength(1);
    expect(publicList[0].app_name).toBe("ChatGPT");
    expect(publicList[0].value_numeric).toBe(250000000);
  });

  it("enforces database-level immutability once verified (trigger check)", () => {
    const draft = service.createDraft(sampleInput, "operator_sam");
    service.verifyDisclosure(draft.id, "senior_editor", "Primary source match confirmed.");

    // Direct SQL update attempt must fail via database trigger
    expect(() => {
      db.prepare("UPDATE company_disclosures SET value_numeric = 300000000 WHERE id = ?").run(draft.id);
    }).toThrow(/verified disclosures are immutable; create a superseding record/);

    expect(() => {
      db.prepare("UPDATE company_disclosures SET metric_label = 'Changed label' WHERE id = ?").run(draft.id);
    }).toThrow(/verified disclosures are immutable; create a superseding record/);
  });

  it("implements superseding workflow: old remains current until new is verified", () => {
    // 1. Initial verified disclosure
    const draft1 = service.createDraft(sampleInput, "operator");
    const v1 = service.verifyDisclosure(draft1.id, "verifier", "Verified v1");

    expect(service.getPublicVerified()).toHaveLength(1);
    expect(service.getPublicVerified()[0].value_numeric).toBe(250000000);

    // 2. Create superseding draft with updated 300M figure
    const newInput: CreateDisclosureInput = {
      ...sampleInput,
      value_numeric: 300000000,
      reporting_period_end: "2026-11-15",
      disclosed_at: "2026-11-15",
      source_locator: "Press conference slide 4",
    };

    const draft2 = service.supersedeDisclosure(v1.id, newInput, "operator");
    expect(draft2.supersedes_id).toBe(v1.id);
    expect(draft2.verification_status).toBe("DRAFT");

    // While draft2 is DRAFT, v1 remains current and visible!
    const midPublic = service.getPublicVerified();
    expect(midPublic).toHaveLength(1);
    expect(midPublic[0].id).toBe(v1.id);
    expect(midPublic[0].value_numeric).toBe(250000000);

    // 3. Verify draft2 -> atomically retires v1 (is_current = 0) and activates draft2 (is_current = 1)
    const v2 = service.verifyDisclosure(draft2.id, "verifier", "Verified updated Q4 milestone");
    expect(v2.is_current).toBe(1);

    const retiredV1 = service.getById(v1.id)!;
    expect(retiredV1.is_current).toBe(0);

    // Public list now reflects only v2!
    const finalPublic = service.getPublicVerified();
    expect(finalPublic).toHaveLength(1);
    expect(finalPublic[0].id).toBe(v2.id);
    expect(finalPublic[0].value_numeric).toBe(300000000);
  });

  it("withdraws a disclosure cleanly without deleting it from historical audit", () => {
    const draft = service.createDraft(sampleInput, "operator");
    const verified = service.verifyDisclosure(draft.id, "verifier", "Verified");
    expect(service.getPublicVerified()).toHaveLength(1);

    const withdrawn = service.withdrawDisclosure(verified.id, "admin", "Company retracted statement in filing 8-K");
    expect(withdrawn.verification_status).toBe("WITHDRAWN");
    expect(withdrawn.is_current).toBe(0);

    // Completely absent from public listings
    expect(service.getPublicVerified()).toHaveLength(0);

    // Preserved in database
    expect(service.getById(verified.id)).toBeDefined();
  });
});
