import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createSecretBox,
  getTokenSecretBox,
  parseEncryptionKey,
  SecretDecryptionError,
} from "../src/utils/encryption.util";

const newKey = () => randomBytes(32).toString("base64");
const tamper = (value: string) => (value.startsWith("A") ? "B" : "A") + value.slice(1);

describe("createSecretBox", () => {
  it("round-trips values with a fresh IV each time", () => {
    const box = createSecretBox({ currentKey: newKey() });
    const first = box.encrypt("secret-token", "context");
    const second = box.encrypt("secret-token", "context");

    expect(first).not.toBe(second);
    expect(first).not.toContain("secret-token");
    expect(first.split(".")).toHaveLength(5);
    expect(first.startsWith("v1.")).toBe(true);
    expect(box.decrypt(first, "context")).toBe("secret-token");
    expect(box.decrypt(second, "context")).toBe("secret-token");

    for (const value of ["", "🔐 ünïcode · 秘密"]) {
      expect(box.decrypt(box.encrypt(value, "context"), "context")).toBe(value);
    }
  });

  it("only decrypts with the same context", () => {
    const box = createSecretBox({ currentKey: newKey() });
    const encrypted = box.encrypt("secret-token", "account-a:access");
    expect(() => box.decrypt(encrypted, "account-b:access")).toThrow(SecretDecryptionError);
  });

  it("detects tampering and malformed values", () => {
    const box = createSecretBox({ currentKey: newKey() });
    const [version, keyId, iv, tag, ciphertext] = box.encrypt("secret-token", "ctx").split(".");

    const tampered = [
      [version, keyId, iv, tag, tamper(ciphertext ?? "")],
      [version, keyId, iv, tamper(tag ?? ""), ciphertext],
      [version, keyId, tamper(iv ?? ""), tag, ciphertext],
      [version, keyId, iv, tag?.slice(0, 8), ciphertext],
    ].map((parts) => parts.join("."));

    for (const value of [...tampered, "garbage", "v2.a.b.c.d", ""]) {
      expect(() => box.decrypt(value, "ctx")).toThrow(SecretDecryptionError);
    }
  });

  it("rejects values encrypted with an unknown key", () => {
    const encrypted = createSecretBox({ currentKey: newKey() }).encrypt("secret", "ctx");
    expect(() => createSecretBox({ currentKey: newKey() }).decrypt(encrypted, "ctx")).toThrow(
      /unknown key/,
    );
  });

  it("decrypts with previous keys during rotation and flags old values", () => {
    const oldKey = newKey();
    const oldBox = createSecretBox({ currentKey: oldKey });
    const legacy = oldBox.encrypt("secret-token", "ctx");

    const rotated = createSecretBox({ currentKey: newKey(), previousKeys: [oldKey] });
    expect(rotated.decrypt(legacy, "ctx")).toBe("secret-token");
    expect(rotated.needsRotation(legacy)).toBe(true);
    expect(rotated.needsRotation(rotated.encrypt("secret-token", "ctx"))).toBe(false);
  });

  it("requires 32-byte keys", () => {
    expect(() => parseEncryptionKey("too-short")).toThrow(/32 random bytes/);
    expect(() => parseEncryptionKey(randomBytes(16).toString("base64"))).toThrow(/32 random bytes/);
    expect(parseEncryptionKey(randomBytes(32).toString("base64url"))).toHaveLength(32);
  });

  it("builds the app's token box from TOKEN_ENCRYPTION_KEY", () => {
    const box = getTokenSecretBox();
    expect(box).not.toBeNull();
    expect(box?.decrypt(box.encrypt("token", "ctx"), "ctx")).toBe("token");
  });
});
