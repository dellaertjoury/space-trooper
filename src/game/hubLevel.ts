/**
 * The Cantina: two floors at run scale (24 px tiles, Trooper 56 px), joined by a stairwell in the centre.
 *   Ground floor : the bar (left) and Mission Control (right)
 *   Upper floor  : everything upgrade-related: Scrapper Stall, Saber Forge | Armoury, Droid Workshop
 * Stand in the stairwell door and press Up to go up, Down to go down. No other way between floors.
 */
import { T, Tile, TileMap } from '../core/tilemap';
import type { StationId } from '../art/cantina';

export const HUB_W = 56, HUB_H = 30;
export const FLOOR = { ground: 27 * T, top: 13 * T }; // y of each floor's walking surface
export const SLAB = 3 * T;                           // thickness of the floor between the two levels
export const STAIRS = { x0: 26.5 * T, x1: 29.5 * T, cx: 28 * T }; // the stairwell door, same spot on both floors

export interface Prop {
  key: string;          // texture (hub/, hub2/ or cantina/ asset, or a procedural one)
  x: number;            // centre x
  y: number;            // bottom y (what it stands on), or anchor y for hanging things
  h: number;            // display height in world px
  flip?: boolean;
  front?: boolean;      // drawn in front of the Trooper
  hang?: boolean;       // anchored at the top (lamps)
  glow?: number;        // additive glow colour
  bob?: boolean;        // gentle hover
  holo?: boolean;       // additive hologram with flicker
}

export interface HubStation { id: StationId; label: string; x0: number; x1: number; floor: number; signY: number }

export function hubMap(): TileMap {
  const m = new TileMap(HUB_W, HUB_H);
  const S = Tile.Solid;
  m.fill(0, 0, HUB_W - 1, 1, S);            // ceiling
  m.fill(0, 0, 1, HUB_H - 1, S);            // walls
  m.fill(HUB_W - 2, 0, HUB_W - 1, HUB_H - 1, S);
  m.fill(2, 13, HUB_W - 3, 15, S);          // the floor between the levels
  m.fill(0, 27, HUB_W - 1, HUB_H - 1, S);   // ground
  return m;
}

export const HUB_SPAWN = { x: 22 * T, y: FLOOR.ground - 56 };

const G = FLOOR.ground, P = FLOOR.top;
export const HUB_STATIONS: HubStation[] = [
  { id: 'mission', label: 'Mission Control', x0: 36 * T, x1: 51 * T, floor: G, signY: G - 150 },
  { id: 'scrapper', label: 'Scrapper Stall', x0: 3 * T, x1: 13 * T, floor: P, signY: P - 150 },
  { id: 'forge', label: 'Saber Forge', x0: 14 * T, x1: 24 * T, floor: P, signY: P - 150 },
  { id: 'armoury', label: 'Armoury', x0: 32 * T, x1: 42 * T, floor: P, signY: P - 150 },
  { id: 'workshop', label: 'Droid Workshop', x0: 43 * T, x1: 53 * T, floor: P, signY: P - 150 },
];

/**
 * The animated droids (the bar droid sheet). Each one ambles around its stand, waves when the
 * Trooper comes over and bounces now and then. The first one wanders the whole bar.
 */
export const HUB_DROIDS = [
  { x0: 3.5 * T, x1: 21 * T, y: G, start: 4 * T },             // the bar
  { x0: 10.5 * T, x1: 12.5 * T, y: P, start: 11 * T },        // next to the Scrapper Stall
  { x0: 50 * T, x1: 52.5 * T, y: P, start: 51 * T },          // next to the Droid Workshop bench
  { x0: 38 * T, x1: 41 * T, y: G, start: 39 * T },             // Mission Control
];

const UNDER_SLAB = P + SLAB; // underside of the upper floor, where the ground floor's lamps hang
const CEIL = 2 * T;

export const HUB_PROPS: Prop[] = [
  // ================= ground floor: the bar (left)
  { key: 'barCounter', x: 300, y: G, h: 48 },                            // the Trooper walks in front of it
  { key: 'h2_canister', x: 82, y: G, h: 34, glow: 0x46c8ff },
  { key: 'h2_lamp_dome', x: 160, y: UNDER_SLAB, h: 18, hang: true, glow: 0xffb070 },
  { key: 'h2_lamp_dome', x: 300, y: UNDER_SLAB, h: 18, hang: true, glow: 0xffb070 },
  { key: 'h2_lamp_dome', x: 440, y: UNDER_SLAB, h: 18, hang: true, glow: 0xffb070 },
  // ================= ground floor: Mission Control (right)
  { key: 'holoTable', x: 1000, y: G, h: 30 },
  { key: 'h2_globe_big', x: 1000, y: G - 26, h: 92, holo: true, glow: 0x46c8ff, bob: true },
  { key: 'h2_console', x: 1130, y: G, h: 44 },
  { key: 'h2_console', x: 880, y: G, h: 44, flip: true },
  { key: 'h2_globe_red', x: 1210, y: G - 50, h: 34, holo: true, bob: true },
  { key: 'h2_globe_green', x: 790, y: G - 50, h: 34, holo: true, bob: true },
  { key: 'h2_bench_hazard', x: 1240, y: G, h: 26 },
  { key: 'h2_barrier', x: 760, y: G, h: 22 },
  { key: 'h2_led_strip', x: 1000, y: G - 150, h: 10, glow: 0x46e6ff },
  { key: 'h2_lamp_bar', x: 880, y: UNDER_SLAB, h: 12, hang: true, glow: 0xffe0a0 },
  { key: 'h2_lamp_bar', x: 1130, y: UNDER_SLAB, h: 12, hang: true, glow: 0xffe0a0 },
  // ================= upper floor: Scrapper Stall
  { key: 'h2_bench_hazard', x: 200, y: P, h: 30 },                       // the stall counter
  { key: 'h2_lamp_tube_v', x: 70, y: P - 70, h: 30, glow: 0xffe0a0 },
  // ================= upper floor: Saber Forge
  { key: 'bench_press', x: 430, y: P, h: 54 },
  { key: 'holoTable', x: 530, y: P, h: 30 },
  { key: 'h2_cone_blue', x: 530, y: P - 26, h: 70, holo: true },        // recoloured to the equipped crystal
  { key: 'h2_holox_blue', x: 530, y: P - 66, h: 32, holo: true, bob: true },
  { key: 'h2_canister', x: 370, y: P, h: 30, glow: 0x46c8ff },
  // ================= upper floor: Armoury
  { key: 'armouryRack', x: 860, y: P, h: 92 },
  { key: 'gear_chest', x: 835, y: P - 52, h: 24 },
  { key: 'gear_shoulder', x: 890, y: P - 54, h: 18 },
  { key: 'gear_gauntlet', x: 835, y: P - 12, h: 22 },
  { key: 'gear_boots', x: 890, y: P - 12, h: 20 },
  // ================= upper floor: Droid Workshop
  { key: 'bench_tools', x: 1130, y: P, h: 54 },
  { key: 'droid_turret', x: 1060, y: P - 72, h: 26, bob: true },
  { key: 'h2_wallbox_wires', x: 1050, y: P - 40, h: 40 },
  { key: 'h2_wallbox_meter', x: 1270, y: P - 80, h: 34 },
  { key: 'toolkit', x: 1116, y: P - 30, h: 14 },
  // ceiling lamps, upper floor
  { key: 'h2_lamp_dome', x: 200, y: CEIL, h: 16, hang: true, glow: 0xffd090 },
  { key: 'h2_lamp_dome', x: 520, y: CEIL, h: 16, hang: true, glow: 0xffd090 },
  { key: 'h2_lamp_dome', x: 860, y: CEIL, h: 16, hang: true, glow: 0xffd090 },
  { key: 'h2_lamp_dome', x: 1160, y: CEIL, h: 16, hang: true, glow: 0xffd090 },
];
