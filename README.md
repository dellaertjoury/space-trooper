# Space Trooper

A Dead Cells-style roguelite platformer in a space-opera universe, built for the browser with TypeScript and Phaser 3.

**Play:** `https://dellaertjoury.github.io/space-trooper/` (after the first deploy)

## Status: Phase 1 (MVP: movement, weapons, style)

The Trooper on the Training Deck can run, jump, double jump, roll (with invincibility frames), wall slide, wall jump, vault low walls, grab and climb ledges, drop through platforms, swing a three-hit vibro-saber combo, fire the blaster, and swap weapons. Training droids take hits.

## The Cantina (hub)

Every session starts in the Cantina. Walk to a station and press **Up / E** (or click its sign):

| Station | What it does |
| --- | --- |
| Scrapper Stall | Buy crystals, droid parts, ingots and an overshield for the next run (credits) |
| Armoury | Craft and upgrade 4 gear pieces: chest (+health), shoulder (+saber damage), gauntlets (+blaster damage), boots (faster roll recovery) |
| Droid Workshop | Build and deploy a companion: Turret drone (shoots) or Medic droid (+health) |
| Saber Forge | Blade colour (blue, green, red, purple) and form (single blade or vibro-staff) |
| Mission Table | Launch a run with your loadout (also the green START MISSION button) |

Runs pay 15 credits per destroyed droid. Leave through the CANTINA door at the end of the Training Deck, or pause and press C. Progress is saved in your browser. The testing build starts you with 400 credits, 5 crystals, 1 rare crystal, 10 droid parts and 6 ingots. `?scene=run` skips the Cantina.

## Controls

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Move | A D / arrows | stick / d-pad |
| Jump (again in the air) | Space / Z | A |
| Drop through a platform | Down + Jump | Down + A |
| Roll | K / Shift / C | B / RB / RT |
| Attack | J / X | X |
| Swap saber / blaster | Q / L | Y |
| Climb a ledge / let go | Up or Jump / Down | |
| Pause (R restart, C back to Cantina) | Esc / P | Start |
| Use a Cantina station | Up / E / Enter | d-pad up |
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

The agents run automatically on GitHub after every push, and their report ships with the deployed game.

## Layout

```
src/core      input (keyboard/gamepad/bots + recording), tiles + collision, seeded RNG
src/game      player state machine, simulation (deterministic, 60 Hz), test level
src/scenes    rendering, effects, HUD
src/art       procedural tiles/backdrop/FX (placeholder until real tilesets)
src/debug     issue logger + dashboard
agents/       kid.mjs, hardcore.mjs, dev.mjs, run-all.mjs
tools/art     sheet_extract.py + assemble_trooper.py (action sheet -> sprite sheet), source art, older conversion scripts
tools/blender rig/render scripts for the 3D model route (shelved)
```

Tuning values for movement live at the top of `src/game/player.ts` (`TUNE`).
