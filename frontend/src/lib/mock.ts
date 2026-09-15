/** Helpers for temporary mock services. Remove with the mocks. */

export const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** FNV-1a hash — turns a string into a stable numeric seed. */
export const hashString = (value: string): number => {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

/** Seeded pseudo-random generator (mulberry32), so sample data is stable for a seed. */
export const createRandom = (seed: number) => {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};
