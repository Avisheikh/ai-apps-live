import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import { getDb } from "@/lib/db/index";
import { Repository } from "@/lib/db/repo";

export interface TrendsImportMetadata {
  geo: string;                // e.g. 'US' or 'WORLD'
  geo_label: string;          // e.g. 'United States'
  search_type: "web" | "image" | "news" | "youtube" | "shopping";
  entity_mode: "search_term" | "topic";
  category?: string;          // default: 'All categories'
  time_range_label: string;   // e.g. 'Past 30 days'
  granularity: "hourly" | "daily" | "weekly" | "monthly";
  exported_at: string;        // YYYY-MM-DD
  original_filename: string;
}

export interface ParsedBucket {
  bucketStart: string;
  isPartial: boolean;
  values: Array<{
    appId: number;
    termLabel: string;
    valueRaw: string;
    valueIndex: number | null;
  }>;
}

export interface TrendsValidationSuccess {
  valid: true;
  fileSha256: string;
  terms: string[];
  matchedApps: Array<{ id: number; name: string; trendsLabel: string }>;
  periodStart: string;
  periodEnd: string;
  buckets: ParsedBucket[];
}

export interface TrendsValidationFailure {
  valid: false;
  fileSha256: string;
  errors: string[];
}

export type TrendsValidationResult = TrendsValidationSuccess | TrendsValidationFailure;

export function parseAndValidateTrendsCsv(
  rawBytes: Buffer,
  metadata: TrendsImportMetadata,
  db: Database.Database = getDb()
): TrendsValidationResult {
  const errors: string[] = [];

  // 1. Max 2 MB check
  if (rawBytes.length > 2 * 1024 * 1024) {
    return {
      valid: false,
      fileSha256: createHash("sha256").update(rawBytes).digest("hex"),
      errors: ["File exceeds the 2 MB maximum size limit."],
    };
  }

  const fileSha256 = createHash("sha256").update(rawBytes).digest("hex");

  // 2. Duplicate file SHA-256 detection
  const existingImport = db
    .prepare("SELECT id, status FROM search_interest_imports WHERE file_sha256 = ?")
    .get(fileSha256) as { id: number; status: string } | undefined;

  if (existingImport) {
    return {
      valid: false,
      fileSha256,
      errors: [`Duplicate file: this exact file has already been imported (import #${existingImport.id}, status: ${existingImport.status}).`],
    };
  }

  // 3. String decode & UTF-8 / BOM stripping
  let content = rawBytes.toString("utf-8");
  if (content.charCodeAt(0) === 0xfeff) {
    content = content.slice(1);
  }

  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return {
      valid: false,
      fileSha256,
      errors: ["File is empty or contains insufficient data rows."],
    };
  }

  // 4. Locate the "Interest over time" header row
  // Reject regional or related query files explicitly
  let headerIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.toLowerCase().startsWith("subregion,") || line.toLowerCase().startsWith("region,")) {
      return {
        valid: false,
        fileSha256,
        errors: ["Rejected: this is a regional export ('By region'), not an 'Interest over time' export."],
      };
    }
    if (line.toLowerCase().includes("related queries") || line.toLowerCase().includes("related topics")) {
      return {
        valid: false,
        fileSha256,
        errors: ["Rejected: this is a related queries/topics export, not an 'Interest over time' export."],
      };
    }

    const firstCell = line.split(",")[0].trim().toLowerCase();
    if (["time", "day", "week", "month"].includes(firstCell)) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) {
    return {
      valid: false,
      fileSha256,
      errors: ["Could not find a valid time header column (expected 'Time', 'Day', 'Week', or 'Month')."],
    };
  }

  // Parse header terms
  const headerCols = lines[headerIndex].split(",").map((c) => c.trim());
  const termCols = headerCols.slice(1);

  if (termCols.length === 0) {
    return {
      valid: false,
      fileSha256,
      errors: ["CSV header contains no search term columns."],
    };
  }

  if (termCols.length > 5) {
    return {
      valid: false,
      fileSha256,
      errors: [`Google Trends comparison set allows at most 5 terms; found ${termCols.length}.`],
    };
  }

  // Load active apps to match trends_label
  const activeApps = db.prepare("SELECT id, display_name, trends_label FROM apps WHERE is_active = 1").all() as Array<{
    id: number;
    display_name: string;
    trends_label: string | null;
  }>;

  const matchedApps: Array<{ id: number; name: string; trendsLabel: string }> = [];
  const parsedTerms: string[] = [];

  for (const col of termCols) {
    // Expected format: "ChatGPT: (United States)" or "ChatGPT"
    const match = col.match(/^(.+?)(?:: \((.+?)\))?$/);
    const termName = match ? match[1].trim() : col;
    const termGeo = match && match[2] ? match[2].trim() : null;

    if (termGeo && metadata.geo_label) {
      if (termGeo.toLowerCase() !== metadata.geo_label.toLowerCase()) {
        errors.push(`Header geography '${termGeo}' does not match form declared geography '${metadata.geo_label}' for term '${termName}'.`);
      }
    }

    // Match exactly one active app's trends_label
    const matching = activeApps.filter(
      (a) => a.trends_label && a.trends_label.toLowerCase() === termName.toLowerCase()
    );

    if (matching.length === 0) {
      errors.push(`Term '${termName}' does not match any active app's configured trends_label in the registry.`);
    } else if (matching.length > 1) {
      errors.push(`Term '${termName}' is ambiguous; matches multiple active apps: ${matching.map((m) => m.display_name).join(", ")}.`);
    } else {
      matchedApps.push({
        id: matching[0].id,
        name: matching[0].display_name,
        trendsLabel: matching[0].trends_label!,
      });
      parsedTerms.push(termName);
    }
  }

  if (errors.length > 0) {
    return { valid: false, fileSha256, errors };
  }

  // Parse data rows
  const dataLines = lines.slice(headerIndex + 1);
  if (dataLines.length === 0) {
    return {
      valid: false,
      fileSha256,
      errors: ["CSV contains header but no data rows."],
    };
  }

  const buckets: ParsedBucket[] = [];
  let prevDateMs = 0;
  let periodStart = "";
  let periodEnd = "";

  const exportDate = new Date(metadata.exported_at).getTime();

  for (let r = 0; r < dataLines.length; r++) {
    const rowNum = headerIndex + 2 + r;
    const rowCells = dataLines[r].split(",").map((c) => c.trim());

    if (rowCells.length !== headerCols.length) {
      errors.push(`Row ${rowNum}: expected ${headerCols.length} columns, found ${rowCells.length}.`);
      continue;
    }

    const dateStr = rowCells[0];
    const rowDate = new Date(dateStr);
    const rowDateMs = rowDate.getTime();

    if (isNaN(rowDateMs)) {
      errors.push(`Row ${rowNum}: invalid date format '${dateStr}'.`);
      continue;
    }

    if (prevDateMs > 0 && rowDateMs <= prevDateMs) {
      errors.push(`Row ${rowNum}: date '${dateStr}' is not strictly ascending after previous row.`);
    }
    prevDateMs = rowDateMs;

    if (r === 0) periodStart = dateStr;
    periodEnd = dateStr;

    // Check cells for each term
    const bucketValues: ParsedBucket["values"] = [];
    for (let c = 0; c < termCols.length; c++) {
      const cellVal = rowCells[c + 1];
      const matchedApp = matchedApps[c];

      if (cellVal === "" || cellVal === undefined) {
        errors.push(`Row ${rowNum}, term '${matchedApp.trendsLabel}': cell is empty. Missing data cannot be inferred as zero.`);
        continue;
      }

      if (cellVal === "<1") {
        bucketValues.push({
          appId: matchedApp.id,
          termLabel: matchedApp.trendsLabel,
          valueRaw: "<1",
          valueIndex: null,
        });
      } else if (/^\d+$/.test(cellVal)) {
        const num = parseInt(cellVal, 10);
        if (num < 0 || num > 100) {
          errors.push(`Row ${rowNum}, term '${matchedApp.trendsLabel}': index value ${num} is out of bounds (must be 0-100 or '<1').`);
        } else {
          bucketValues.push({
            appId: matchedApp.id,
            termLabel: matchedApp.trendsLabel,
            valueRaw: cellVal,
            valueIndex: num,
          });
        }
      } else {
        errors.push(`Row ${rowNum}, term '${matchedApp.trendsLabel}': invalid non-numeric value '${cellVal}'.`);
      }
    }

    // Determine if bucket is partial (ends after export date)
    const isPartial = r === dataLines.length - 1 && !isNaN(exportDate) && rowDateMs > exportDate;

    buckets.push({
      bucketStart: dateStr,
      isPartial,
      values: bucketValues,
    });
  }

  if (errors.length > 0) {
    return { valid: false, fileSha256, errors };
  }

  return {
    valid: true,
    fileSha256,
    terms: parsedTerms,
    matchedApps,
    periodStart,
    periodEnd,
    buckets,
  };
}

export function commitTrendsImport(
  rawBytes: Buffer,
  metadata: TrendsImportMetadata,
  importedBy: string,
  db: Database.Database = getDb()
): { success: boolean; importId: number; error?: string } {
  const repo = new Repository(db);
  const dataSource = repo.getDataSourceByKey("google_trends_csv");
  if (!dataSource) {
    throw new Error("Data source 'google_trends_csv' not found");
  }

  const validation = parseAndValidateTrendsCsv(rawBytes, metadata, db);
  const now = new Date().toISOString();

  if (!validation.valid) {
    // Record an auditable REJECTED import row per Section 6.2
    const rejectReason = validation.errors.join("; ");
    const info = db
      .prepare(
        `INSERT INTO search_interest_imports (
           source_id, original_filename, file_sha256, raw_file, imported_at, imported_by,
           exported_at, geo, geo_label, search_type, entity_mode, category, time_range_label,
           granularity, period_start, period_end, header_terms_json, status, reject_reason, is_current
         ) VALUES (
           ?, ?, ?, ?, ?, ?,
           ?, ?, ?, ?, ?, ?, ?,
           ?, ?, ?, ?, 'REJECTED', ?, 0
         )`
      )
      .run(
        dataSource.id,
        metadata.original_filename,
        validation.fileSha256,
        rawBytes,
        now,
        importedBy,
        metadata.exported_at,
        metadata.geo,
        metadata.geo_label,
        metadata.search_type,
        metadata.entity_mode,
        metadata.category || "All categories",
        metadata.time_range_label,
        metadata.granularity,
        "",
        "",
        "[]",
        rejectReason
      );

    return {
      success: false,
      importId: Number(info.lastInsertRowid),
      error: rejectReason,
    };
  }

  // Single atomic transaction to insert ACCEPTED import and data rows
  let importId = 0;
  const commitTx = db.transaction(() => {
    // De-activate previous current imports with the exact same geo and search_type
    db.prepare(
      `UPDATE search_interest_imports SET is_current = 0
       WHERE geo = ? AND search_type = ? AND is_current = 1`
    ).run(metadata.geo, metadata.search_type);

    const info = db
      .prepare(
        `INSERT INTO search_interest_imports (
           source_id, original_filename, file_sha256, raw_file, imported_at, imported_by,
           exported_at, geo, geo_label, search_type, entity_mode, category, time_range_label,
           granularity, period_start, period_end, header_terms_json, status, is_current
         ) VALUES (
           ?, ?, ?, ?, ?, ?,
           ?, ?, ?, ?, ?, ?, ?,
           ?, ?, ?, ?, 'ACCEPTED', 1
         )`
      )
      .run(
        dataSource.id,
        metadata.original_filename,
        validation.fileSha256,
        rawBytes,
        now,
        importedBy,
        metadata.exported_at,
        metadata.geo,
        metadata.geo_label,
        metadata.search_type,
        metadata.entity_mode,
        metadata.category || "All categories",
        metadata.time_range_label,
        metadata.granularity,
        validation.periodStart,
        validation.periodEnd,
        JSON.stringify(validation.terms)
      );
    importId = Number(info.lastInsertRowid);

    const insertInterest = db.prepare(
      `INSERT INTO search_interest (import_id, app_id, term_label, bucket_start, value_raw, value_index, is_partial)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    for (const b of validation.buckets) {
      for (const val of b.values) {
        insertInterest.run(
          importId,
          val.appId,
          val.termLabel,
          b.bucketStart,
          val.valueRaw,
          val.valueIndex,
          b.isPartial ? 1 : 0
        );
      }
    }

    // Emit stream event for real-time broadcast update
    repo.insertStreamEvent("disclosure_update", {
      type: "search_interest_imported",
      importId,
      geo: metadata.geo,
      searchType: metadata.search_type,
      terms: validation.terms,
    });

    // Write audit log
    repo.insertAuditLog({
      at: now,
      actor: importedBy,
      action: "IMPORT_SEARCH_INTEREST",
      entity: "search_interest_imports",
      entity_id: String(importId),
      before_json: null,
      after_json: JSON.stringify({
        filename: metadata.original_filename,
        terms: validation.terms,
        rows: validation.buckets.length,
      }),
    });
  });

  commitTx();

  return { success: true, importId };
}
