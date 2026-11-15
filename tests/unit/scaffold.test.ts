import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/hash";

describe("Scaffold Verification", () => {
  it("authenticates password hashing and verification accurately with scrypt", () => {
    const password = "supersecretpassword";
    const hash = hashPassword(password);
    expect(hash).toContain("$");
    expect(verifyPassword(password, hash)).toBe(true);
    expect(verifyPassword("wrongpassword", hash)).toBe(false);
  });
});
