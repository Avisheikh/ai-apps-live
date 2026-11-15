import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { SnapshotService } from "@/lib/snapshot/service";

describe("Phase 10: Poison-List Accuracy Scan (Section 13)", () => {
  it("fails if any source template or component pairs 'concurrent' or 'live users' with numeric digits", () => {
    const srcDir = path.join(process.cwd(), "src");

    function getFiles(dir: string): string[] {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const files: string[] = [];
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...getFiles(fullPath));
        } else if (entry.isFile() && (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts"))) {
          files.push(fullPath);
        }
      }
      return files;
    }

    const files = getFiles(srcDir);
    const violations: Array<{ file: string; line: number; match: string }> = [];

    // Regex to detect "concurrent" or "live users" associated with numbers
    // e.g. "concurrent: 100", "500 concurrent users", "concurrent users: 0"
    const poisonPatterns = [
      /\b(?:concurrent|concurrency|live\s+users?)\s*[:=]\s*\d+/i,
      /\b\d+\s+(?:concurrent|concurrency|live\s+users?)\b/i,
      /\b(?:concurrent\s+users?)\s+is\s+\d+/i,
    ];

    for (const file of files) {
      const content = fs.readFileSync(file, "utf8");
      const lines = content.split("\n");

      lines.forEach((lineText, idx) => {
        // Exclude metric key identifiers or comments explaining the lock
        if (lineText.includes("CONCURRENT_USERS") || lineText.includes("Metric 4") || lineText.includes("zero numbers") || lineText.includes("never turn")) {
          return;
        }

        for (const pattern of poisonPatterns) {
          if (pattern.test(lineText)) {
            violations.push({
              file: path.relative(process.cwd(), file),
              line: idx + 1,
              match: lineText.trim(),
            });
          }
        }
      });
    }

    expect(
      violations,
      `Poison-list scan failed! Found potential pairing of concurrent metrics with numeric values: ${JSON.stringify(
        violations,
        null,
        2
      )}`
    ).toHaveLength(0);
  });

  it("verifies public snapshot concurrentUsers section strictly contains available:false and zero digits", () => {
    const service = new SnapshotService();
    const snapshot = service.getSnapshot("us");

    expect(snapshot.concurrentUsers.available).toBe(false);
    expect(snapshot.concurrentUsers.message).toBe("Concurrent user data unavailable.");
    expect(snapshot.concurrentUsers.explanation).toBe("No public source reports this.");

    const jsonStr = JSON.stringify(snapshot.concurrentUsers);
    // Assert absolutely no numeric digits appear in the concurrent users JSON
    expect(jsonStr).not.toMatch(/\d/);
  });
});
