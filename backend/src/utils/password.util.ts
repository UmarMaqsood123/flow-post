import * as argon2 from "argon2";

/** OWASP-recommended argon2id baseline (19 MiB memory, 2 iterations, 1 lane). */
const HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export const hashPassword = (password: string): Promise<string> =>
  argon2.hash(password, HASH_OPTIONS);

export const verifyPassword = async (hash: string, password: string): Promise<boolean> => {
  try {
    return await argon2.verify(hash, password);
  } catch {
    // Malformed hash — treat as a failed match rather than a server error.
    return false;
  }
};

/** True when a stored hash was created with weaker parameters and should be upgraded. */
export const passwordNeedsRehash = (hash: string): boolean =>
  argon2.needsRehash(hash, HASH_OPTIONS);

let dummyHash: Promise<string> | undefined;

/**
 * Burns the same CPU/memory as a real verification. Used when the account does
 * not exist so response timing does not reveal which emails are registered.
 */
export const verifyAgainstDummyHash = async (password: string): Promise<void> => {
  dummyHash ??= hashPassword("timing-equalization-placeholder");
  await verifyPassword(await dummyHash, password);
};
