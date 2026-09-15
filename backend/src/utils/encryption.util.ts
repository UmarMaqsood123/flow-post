import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "../config/env";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const FORMAT_VERSION = "v1";

export class SecretDecryptionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SecretDecryptionError";
  }
}

/** Parses a base64 (or base64url) 32-byte key. */
export const parseEncryptionKey = (value: string): Buffer => {
  const key = Buffer.from(value.trim(), "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error("Encryption keys must be 32 random bytes, base64-encoded");
  }
  return key;
};

/** Short, non-reversible key fingerprint stored with each ciphertext to pick the key for decryption. */
const keyIdFor = (key: Buffer) => createHash("sha256").update(key).digest("hex").slice(0, 8);

export interface SecretBox {
  /** `context` is authenticated but not stored: decryption must pass the same value. */
  encrypt(plaintext: string, context: string): string;
  decrypt(payload: string, context: string): string;
  /** True when the payload was encrypted with a previous key and should be re-encrypted. */
  needsRotation(payload: string): boolean;
}

/**
 * Authenticated encryption for secrets at rest (AES-256-GCM, random 96-bit IV).
 *
 * `context` is bound as additional authenticated data, so a ciphertext copied into
 * another record or field fails to decrypt. Format: `v1.<keyId>.<iv>.<tag>.<ciphertext>`.
 * Previous keys decrypt old values during rotation; new values always use the current key.
 */
export const createSecretBox = ({
  currentKey,
  previousKeys = [],
}: {
  currentKey: string;
  previousKeys?: string[];
}): SecretBox => {
  const current = parseEncryptionKey(currentKey);
  const currentId = keyIdFor(current);
  const keys = new Map<string, Buffer>();
  for (const key of [current, ...previousKeys.map(parseEncryptionKey)]) {
    const id = keyIdFor(key);
    if (!keys.has(id)) keys.set(id, key);
  }

  return {
    encrypt(plaintext, context) {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv(ALGORITHM, current, iv, { authTagLength: AUTH_TAG_BYTES });
      cipher.setAAD(Buffer.from(context, "utf8"));
      const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      return [
        FORMAT_VERSION,
        currentId,
        iv.toString("base64url"),
        cipher.getAuthTag().toString("base64url"),
        ciphertext.toString("base64url"),
      ].join(".");
    },

    decrypt(payload, context) {
      const parts = payload.split(".");
      const [version, keyId, iv, tag, ciphertext] = parts;
      if (
        parts.length !== 5 ||
        version !== FORMAT_VERSION ||
        !keyId ||
        !iv ||
        !tag ||
        ciphertext === undefined
      ) {
        throw new SecretDecryptionError("Unrecognized encrypted value");
      }
      const key = keys.get(keyId);
      if (!key) throw new SecretDecryptionError("Value was encrypted with an unknown key");

      try {
        const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, "base64url"), {
          authTagLength: AUTH_TAG_BYTES,
        });
        decipher.setAAD(Buffer.from(context, "utf8"));
        decipher.setAuthTag(Buffer.from(tag, "base64url"));
        return Buffer.concat([
          decipher.update(Buffer.from(ciphertext, "base64url")),
          decipher.final(),
        ]).toString("utf8");
      } catch (cause) {
        throw new SecretDecryptionError("Encrypted value failed authentication", { cause });
      }
    },

    needsRotation(payload) {
      return payload.split(".")[1] !== currentId;
    },
  };
};

let tokenSecretBox: SecretBox | null | undefined;

/** Secret box for OAuth tokens (TOKEN_ENCRYPTION_KEY), or null when no key is configured. */
export const getTokenSecretBox = (): SecretBox | null => {
  if (tokenSecretBox === undefined) {
    tokenSecretBox = env.TOKEN_ENCRYPTION_KEY
      ? createSecretBox({
          currentKey: env.TOKEN_ENCRYPTION_KEY,
          previousKeys: env.TOKEN_ENCRYPTION_PREVIOUS_KEYS,
        })
      : null;
  }
  return tokenSecretBox;
};
