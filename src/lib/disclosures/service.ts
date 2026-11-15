import Database from "better-sqlite3";
import { getDb } from "@/lib/db/index";
import { Repository } from "@/lib/db/repo";

export interface CompanyDisclosureRecord {
  id: number;
  app_id: number;
  metric_type: "DAU" | "WAU" | "MAU" | "OTHER";
  metric_label: string;
  value_numeric: number;
  value_qualifier: "EXACT" | "AT_LEAST" | "ABOUT";
  unit: string;
  geography: string;
  reporting_period_start: string | null;
  reporting_period_end: string;
  disclosed_at: string;
  source_kind:
    | "EARNINGS_CALL"
    | "EARNINGS_RELEASE"
    | "COMPANY_BLOG"
    | "EXECUTIVE_STATEMENT"
    | "REGULATORY_FILING"
    | "OTHER_OFFICIAL";
  source_url: string;
  source_locator: string;
  entered_by: string;
  entered_at: string;
  verification_status: "DRAFT" | "VERIFIED" | "REJECTED" | "WITHDRAWN";
  verified_by: string | null;
  verified_at: string | null;
  verifier_note: string | null;
  supersedes_id: number | null;
  is_current: number;
}

export interface CreateDisclosureInput {
  app_id: number;
  metric_type: "DAU" | "WAU" | "MAU" | "OTHER";
  metric_label: string;
  value_numeric: number;
  value_qualifier?: "EXACT" | "AT_LEAST" | "ABOUT";
  unit?: string;
  geography?: string;
  reporting_period_start?: string | null;
  reporting_period_end: string;
  disclosed_at: string;
  source_kind: CompanyDisclosureRecord["source_kind"];
  source_url: string;
  source_locator: string;
  supersedes_id?: number | null;
}

export class DisclosureService {
  private repo: Repository;

  constructor(private db: Database.Database = getDb()) {
    this.repo = new Repository(this.db);
  }

  createDraft(input: CreateDisclosureInput, enteredBy: string): CompanyDisclosureRecord {
    // Validation
    if (!input.source_url.startsWith("https://")) {
      throw new Error("Source URL must be a valid HTTPS URL (e.g. https://...)");
    }
    if (!input.source_locator || input.source_locator.trim().length === 0) {
      throw new Error("Source locator (page, slide, timestamp, or short quote) is required");
    }
    if (input.value_numeric <= 0) {
      throw new Error("Numeric value must be greater than zero");
    }

    const app = this.repo.getAppById(input.app_id);
    if (!app) {
      throw new Error(`App with ID ${input.app_id} does not exist`);
    }

    const now = new Date().toISOString();
    const info = this.db
      .prepare(
        `INSERT INTO company_disclosures (
           app_id, metric_type, metric_label, value_numeric, value_qualifier, unit,
           geography, reporting_period_start, reporting_period_end, disclosed_at,
           source_kind, source_url, source_locator, entered_by, entered_at,
           verification_status, supersedes_id, is_current
         ) VALUES (
           ?, ?, ?, ?, ?, ?,
           ?, ?, ?, ?,
           ?, ?, ?, ?, ?,
           'DRAFT', ?, 1
         )`
      )
      .run(
        input.app_id,
        input.metric_type,
        input.metric_label,
        input.value_numeric,
        input.value_qualifier || "EXACT",
        input.unit || "users",
        input.geography || "GLOBAL",
        input.reporting_period_start || null,
        input.reporting_period_end,
        input.disclosed_at,
        input.source_kind,
        input.source_url,
        input.source_locator,
        enteredBy,
        now,
        input.supersedes_id || null
      );

    const createdId = Number(info.lastInsertRowid);

    this.repo.insertAuditLog({
      at: now,
      actor: enteredBy,
      action: "CREATE_DISCLOSURE_DRAFT",
      entity: "company_disclosures",
      entity_id: String(createdId),
      before_json: null,
      after_json: JSON.stringify(input),
    });

    return this.getById(createdId)!;
  }

  verifyDisclosure(id: number, verifiedBy: string, verifierNote: string): CompanyDisclosureRecord {
    const disclosure = this.getById(id);
    if (!disclosure) throw new Error(`Disclosure #${id} not found`);

    if (disclosure.verification_status === "VERIFIED") {
      throw new Error(`Disclosure #${id} is already verified and immutable`);
    }

    if (!verifierNote || verifierNote.trim().length === 0) {
      throw new Error("A verifier note is required to confirm primary source matching");
    }

    const now = new Date().toISOString();

    const verifyTx = this.db.transaction(() => {
      // If this disclosure supersedes an existing one, mark the superseded row is_current = 0
      if (disclosure.supersedes_id) {
        this.db
          .prepare("UPDATE company_disclosures SET is_current = 0 WHERE id = ?")
          .run(disclosure.supersedes_id);
      }

      this.db
        .prepare(
          `UPDATE company_disclosures SET
           verification_status = 'VERIFIED',
           verified_by = ?,
           verified_at = ?,
           verifier_note = ?,
           is_current = 1
           WHERE id = ?`
        )
        .run(verifiedBy, now, verifierNote, id);

      // Emit stream event
      this.repo.insertStreamEvent("disclosure_update", {
        type: "official_user_verified",
        disclosureId: id,
        appId: disclosure.app_id,
        metricType: disclosure.metric_type,
        valueNumeric: disclosure.value_numeric,
      });

      this.repo.insertAuditLog({
        at: now,
        actor: verifiedBy,
        action: "VERIFY_DISCLOSURE",
        entity: "company_disclosures",
        entity_id: String(id),
        before_json: JSON.stringify({ status: disclosure.verification_status }),
        after_json: JSON.stringify({ status: "VERIFIED", verified_by: verifiedBy, note: verifierNote }),
      });
    });

    verifyTx();

    return this.getById(id)!;
  }

  supersedeDisclosure(oldId: number, newInput: CreateDisclosureInput, enteredBy: string): CompanyDisclosureRecord {
    const oldDisclosure = this.getById(oldId);
    if (!oldDisclosure) throw new Error(`Disclosure #${oldId} not found`);

    // Creates draft referencing oldId. Old row stays current until the new draft is verified!
    return this.createDraft(
      {
        ...newInput,
        supersedes_id: oldId,
      },
      enteredBy
    );
  }

  withdrawDisclosure(id: number, actor: string, reason: string): CompanyDisclosureRecord {
    const disclosure = this.getById(id);
    if (!disclosure) throw new Error(`Disclosure #${id} not found`);

    const now = new Date().toISOString();

    this.db
      .prepare(
        `UPDATE company_disclosures SET
         verification_status = 'WITHDRAWN',
         is_current = 0
         WHERE id = ?`
      )
      .run(id);

    this.repo.insertStreamEvent("disclosure_update", {
      type: "official_user_withdrawn",
      disclosureId: id,
      appId: disclosure.app_id,
    });

    this.repo.insertAuditLog({
      at: now,
      actor,
      action: "WITHDRAW_DISCLOSURE",
      entity: "company_disclosures",
      entity_id: String(id),
      before_json: JSON.stringify({ status: disclosure.verification_status, is_current: disclosure.is_current }),
      after_json: JSON.stringify({ status: "WITHDRAWN", is_current: 0, reason }),
    });

    return this.getById(id)!;
  }

  getById(id: number): CompanyDisclosureRecord | undefined {
    return this.db.prepare("SELECT * FROM company_disclosures WHERE id = ?").get(id) as
      | CompanyDisclosureRecord
      | undefined;
  }

  getAll(): CompanyDisclosureRecord[] {
    return this.db
      .prepare("SELECT * FROM company_disclosures ORDER BY disclosed_at DESC, id DESC")
      .all() as CompanyDisclosureRecord[];
  }

  /**
   * Only VERIFIED and is_current = 1 disclosures ever reach the public dashboard or public API.
   */
  getPublicVerified(): (CompanyDisclosureRecord & { app_slug: string; app_name: string })[] {
    return this.db
      .prepare(
        `SELECT cd.*, a.slug as app_slug, a.display_name as app_name
         FROM company_disclosures cd
         JOIN apps a ON a.id = cd.app_id
         WHERE cd.verification_status = 'VERIFIED' AND cd.is_current = 1
         ORDER BY a.sort_order ASC, cd.disclosed_at DESC`
      )
      .all() as (CompanyDisclosureRecord & { app_slug: string; app_name: string })[];
  }
}
