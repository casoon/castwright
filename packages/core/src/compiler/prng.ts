// Seeded PRNG for `jitter` — see "Determinism" in meta/constraints.md. The
// parser rejects `jitter > 0` without a top-level `seed`, so this is the only
// source of randomness anywhere in the compile path, and it is fully
// reproducible from that one number.
//
// mulberry32 (public domain, Tommy Ettinger) — small, fast, good-enough
// distribution for typing jitter; no dependency.

export type Rng = () => number; // [0, 1)

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
