// Frame-exact trip through the Cantina's two floors: walk to the stairwell, Up to go upstairs,
// Down to come back. Also checks that a plain jump can NOT reach the upper floor (stairs only).
// Used by the Developer agent; returns the floor (feet y) after each leg.
export async function hubClimb(page) {
  const R = 2, L = 1, UP = 4 | 16, DOWN = 8 | 64; // keyboard Up = up + jump, Down = down + roll
  const go = (n, m) => page.evaluate(([n, m]) => __ST.step(n, m), [n, m]);
  const walkTo = async (x) => {
    for (let i = 0; i < 400; i++) {
      const s = await go(1, 0); const dx = x - (s.x + 10);
      if (Math.abs(dx) < 4) return go(12, 0);
      await go(Math.max(1, Math.min(8, Math.floor(Math.abs(dx) / 4))), dx > 0 ? R : L);
    }
  };
  const fl = await page.evaluate(() => __ST.floors());
  await page.evaluate(() => __ST.walkTo(400));
  const out = { ground: fl.ground, top: fl.top };
  await go(1, 0); await go(14, 16); await go(60, 0);
  out.jumpOnly = (await go(1, 0)).feet;                   // still the ground floor
  await walkTo(fl.stairs);
  await go(1, 0); await go(2, UP); await go(10, 0);
  out.afterUp = (await go(1, 0)).feet;                    // upper floor
  await walkTo(fl.stairs - 200); await walkTo(fl.stairs);
  await go(1, 0); await go(2, DOWN); await go(10, 0);
  out.afterDown = (await go(1, 0)).feet;                  // back on the ground floor
  out.ok = out.jumpOnly === fl.ground && out.afterUp === fl.top && out.afterDown === fl.ground;
  return out;
}
