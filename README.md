# Space Trooper

A Dead Cells-style roguelite platformer in a space-opera universe, built for the browser with TypeScript and Phaser 3.

**Play:** `https://dellaertjoury.github.io/space-trooper/` (after the first deploy)

## Status: Phase 3 started (enemies)

The Trooper on the Training Deck can run, jump, flip (double jump), roll (with invincibility frames), wall slide, wall jump, vault low walls, grab and climb ledges, drop through platforms, swing a three-hit saber combo, fire the blaster, and swap weapons. Two Dune Raiders patrol the deck: the **brute** (staff, closes in and swings) and the **gunner** (rifle, keeps its distance and fires red bolts). Both glow red while winding up: roll through the attack or jump it. Supply crates break open for credits; training droids still take hits.

## The Cantina (hub)

Every session starts in the Cantina, two floors joined by a stairwell in the middle (stand in the doorway, **Up** to go upstairs, **Down** to come down).

| Floor | Station | What it does |
| --- | --- | --- |
| Ground | The bar | The Rusty Hyperdrive. The bar droid waves when you come by |
| Ground | Mission Control | Launch a run with your loadout (also the green START MISSION button) |
| Upper | Scrapper Stall | Buy crystals, droid parts, ingots and an overshield for the next run (credits) |
| Upper | Saber Forge | Blade colour (blue, green, red, purple) and form (single blade or vibro-staff) |
| Upper | Armoury | Craft and upgrade 4 gear pieces: chest (+health), shoulder (+saber damage), gauntlets (+blaster damage), boots (faster roll recovery) |
| Upper | Droid Workshop | Build and deploy a companion: Turret drone (shoots blue bolts) or Medic droid (+health) |

Press **Space** at a station (or click its sign) to use it. Runs pay credits per enemy and per crate. Leave through the CANTINA door at the end of the Training Deck with **Space**, or pause and press C. If you fall, you're carried back to the Cantina and keep what you earned. Progress is saved in your browser. The testing build starts you with 400 credits, 5 crystals, 1 rare crystal, 10 droid parts and 6 ingots. `?scene=run` skips the Cantina.

## Controls

| Action | Keyboard (AZERTY or QWERTY) | Gamepad |
| --- | --- | --- |
| Move | ← → | stick / d-pad |
| Jump (again in the air: flip) | ↑ | A |
| Roll (dodge) | ↓ | B / RB / RT |
| Drop through a platform | ↓ while standing still on it | d-pad down |
| Attack / fire / use (stations, doors) | Space | X |
| Swap saber / blaster | A | Y |
| Abilities (coming) | Z  E  R | |
| Climb a ledge / let go | ↑ / ↓ | |
| Stairs in the Cantina | ↑ / ↓ in the doorway | d-pad up / down |
| Pause (R restart, C back to Cantina) | Esc / P | Start |
| Help | H | |
| **Log an issue** | **F8** | **Select + Y** |
| **Issue dashboard** | **F9** | **Select + X** |

## Reporting issues

1. Press **F8** the moment something feels wrong, type a line, and press Enter. The game saves a screenshot, your position, the seed and your inputs.
2. Press **F9** for the dashboard. It lists your issues and the test agents' issues. Tick items off, filter them, or press **Replay** to re-run the exact moment.
3. **Export JSON** gives you one file to send to Claude. **Copy summary** gives a short text version for chat.

Issues are stored in your browser, so export them before clearing site data.

## Test agents

| Agent | Plays like | Finds |
| --- | --- | --- |
| Kid | Real-time button mashing, holding keys, pause spam | Crashes, soft-locks, stuck keys |
| Hardcore | Frame-perfect search over thousands of input sequences | Unreachable routes, clips, exploits, balance |
| Developer | Fuzzing with rule checks every frame, determinism, performance | Rule violations, replay drift, leaks, broken tooling |

```bash
npm install
npm run dev          # play locally at http://localhost:5173
npm run build
npm run agents       # all three agents -> public/agent-reports/latest.json (see it with F9)
npm run agent:hardcore
```

### On GitHub

- **Every push to `master`** only builds and publishes the game (about a minute). Pushes that only touch docs, `agents/` or `tools/` skip the deploy.
- **Agents run only when you start them:** Actions tab → **Run test agents** → **Run workflow**. Pick `all`, `dev`, `hardcore` or `kid`, and tick *Quick mode* for a shorter run. The report is saved to `public/agent-reports/latest.json`, the game is redeployed, and the results show up under **F9**. Agents you didn't run keep their previous results.

Repo settings: *Settings → Pages → Source* must be **GitHub Actions**. For the agents workflow to save its report, *Settings → Actions → General → Workflow permissions* must be **Read and write**.

## Layout

```
src/core      input (keyboard/gamepad/bots + recording), tiles + collision, seeded RNG
src/game      player state machine, simulation (deterministic, 60 Hz), test level
src/scenes    rendering, effects, HUD
src/art       procedural tiles/backdrop/FX (placeholder until real tilesets)
src/debug     issue logger + dashboard
agents/       kid.mjs, hardcore.mjs, dev.mjs, run-all.mjs
tools/art     chars_extract.py (player + enemy sheet -> sprite sheets), props2_extract.py (props + bar droid), source art, older scripts
tools/blender rig/render scripts for the 3D model route (shelved)
```

Tuning values for movement live at the top of `src/game/player.ts` (`TUNE`).
