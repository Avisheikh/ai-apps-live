import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Hash format: <salt_hex>$<derived_key_hex>
 * Uses scryptSync with recommended parameters.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, 64).toString("hex");
  return `${salt}$${derivedKey}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const [salt, expectedKey] = storedHash.split("$");
    if (!salt || !expectedKey) return false;
    const actualKey = scryptSync(password, salt, 64);
    const expectedBuffer = Buffer.from(expectedKey, "hex");
    if (actualKey.length !== expectedBuffer.length) return false;
    return timingSafeEqual(actualKey, expectedBuffer);
  } catch {
    return false;
  }
}

// CLI usage: npm run admin:hash [password]
if (require.main === module || (typeof process !== "undefined" && process.argv[1]?.includes("hash.ts"))) {
  const inputPassword = process.argv[2] || "admin123456";
  const hash = hashPassword(inputPassword);
  console.log(`Password: ${inputPassword}`);
  console.log(`ADMIN_PASSWORD_HASH=${hash}`);
}
