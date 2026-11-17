// Frame-exact climb through the Cantina's floors: ground -> middle -> top, then drop back down.
// Used by the Developer agent; returns the floor (feet y) reached after each leg.
export async function hubClimb(page) {
  const R = 2, L = 1, D = 8, J = 16;
  const go = (n, m) => page.evaluate(([n, m]) => __ST.step(n, m), [n, m]);
  const walkTo = async (x) => {
    for (let i = 0; i < 400; i++) {
      const s = await go(1, 0); const dx = x - (s.x + 10);
      if (Math.abs(dx) < 4) return go(12, 0);
      await go(Math.max(1, Math.min(8, Math.floor(Math.abs(dx) / 4))), dx > 0 ? R : L);
    }
  };
  // jump straight up, optionally drifting sideways for `side` frames
  const hop = async (dir = 0, side = 0) => { await go(1, 0); await go(14, J | (side ? dir : 0)); if (side > 14) await go(side - 14, dir); await go(50, 0); return go(1, 0); };
  await page.evaluate(() => __ST.walkTo(1000));
  const out = {};
  await walkTo(1080); out.step1 = (await hop()).feet;          // tiles 43-46, row 28 (y 672)
  await walkTo(1118); out.step2 = (await hop(R, 12)).feet;     // tiles 48-51, row 25 (y 600)
  await walkTo(1200); out.middle = (await hop()).feet;         // middle deck row 22 (y 528)
  await walkTo(500); out.step3 = (await hop()).feet;           // tiles 19-22, row 19 (y 456)
  await walkTo(542); out.step4 = (await hop(R, 12)).feet;      // tiles 24-27, row 16 (y 384)
  await walkTo(624); out.top = (await hop()).feet;             // top deck row 13 (y 312)
  await go(1, 0); await go(2, D | J); await go(70, 0); out.dropped = (await go(1, 0)).feet;  // down + jump: back to the middle deck
  return out;
}
