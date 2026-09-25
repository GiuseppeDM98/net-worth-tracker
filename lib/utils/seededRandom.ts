/**
 * A seedable uniform source for the simulations (mulberry32).
 *
 * WHY: `Math.random` cannot be seeded, so two runs of the same plan never share their shocks and
 * a comparison between two plans («con 500 € in più al mese…») is partly noise — the Monte Carlo
 * guide records runs that differ by tenths of a point with nothing changed. A seeded source gives
 * every re-run the SAME sequence of draws (common random numbers), so a difference between two
 * results is the difference between the two plans and nothing else; it also makes a run
 * reproducible in a test and stable between two openings of the page.
 *
 * mulberry32 is a 32-bit generator with a period of 2^32: ample for the few hundred thousand
 * draws a run needs, and it needs no dependency. Reference: Tommy Ettinger's mulberry32
 * (public domain), as popularised by bryc's PRNG notes.
 */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
