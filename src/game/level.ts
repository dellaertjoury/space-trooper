import { Tile, TileMap, T } from '../core/tilemap';

export interface LevelDef {
  name: string;
  map: TileMap;
  spawn: { x: number; y: number }; // pixel position of the player's hitbox top-left
  dummies: { x: number; y: number }[]; // feet position (pixels)
  enemies: { kind: 'raider' | 'gunner'; x: number; y: number; range: number }[]; // feet position, patrol half-width
  crates: { x: number; y: number; color: 'grey' | 'brown' | 'green' | 'blue' | 'maroon' }[]; // feet position
  signs: { x: number; y: number; text: string }[];
  lamps: { x: number; y: number; color: 'warm' | 'cool' | 'green' }[];
  exit?: { x: number; y: number; w: number; h: number }; // door back to the Cantina
}

/**
 * Phase 1 test room: every move has a place to be practised.
 * Floor top is tile row 26. Read left to right:
 * start -> steps -> one-way platforms -> pit -> roll gap under a hanging wall -> wall-jump shaft -> ledge block -> training dummies.
 * Dune Raiders patrol along the way; supply crates break open for credits.
 */
export function testRoom(): LevelDef {
  const W = 110, H = 30;
  const m = new TileMap(W, H);
  const S = Tile.Solid, O = Tile.OneWay;

  // shell
  m.fill(0, 0, W - 1, 0, S);
  m.fill(0, 0, 1, H - 1, S);
  m.fill(W - 2, 0, W - 1, H - 1, S);
  m.fill(0, 26, W - 1, H - 1, S);

  // steps
  m.fill(16, 25, 19, 25, S);
  m.fill(20, 24, 23, 25, S);

  // one-way platforms (jump up through, down + jump to drop)
  m.fill(26, 21, 31, 21, O);
  m.fill(33, 17, 38, 17, O);
  m.fill(26, 13, 31, 13, O);
  m.fill(2, 12, 12, 12, S); // upper-left shelf
  m.fill(13, 15, 18, 15, O);

  // pit
  m.fill(44, 26, 47, 27, Tile.Empty);

  // roll gap: a wall hangs from the ceiling and stops one tile above the floor, only a roll fits under it
  m.fill(54, 1, 56, 24, S);

  // wall-jump shaft: left pillar hangs from the ceiling (walk in underneath), right pillar is a wall
  m.fill(64, 5, 65, 22, S);
  m.fill(70, 11, 71, 25, S);

  // ledge-grab block and a high platform for the double jump
  m.fill(78, 21, 81, 25, S);
  m.fill(86, 15, 96, 15, O);
  m.fill(97, 19, 99, 25, S); // low wall: double jump over it

  const tile = (tx: number, ty: number) => ({ x: tx * T, y: ty * T });
  return {
    name: 'Training Deck',
    map: m,
    spawn: { x: 5 * T, y: 26 * T - 56 },
    dummies: [tile(86, 26), tile(91, 26)],
    enemies: [
      { kind: 'raider', ...tile(37, 26), range: 4 * T },
      { kind: 'raider', ...tile(75, 26), range: 2 * T },
      { kind: 'gunner', ...tile(92, 15), range: 3 * T },
      { kind: 'gunner', ...tile(80, 21), range: 1 * T },
    ],
    crates: [
      { ...tile(10, 26), color: 'brown' }, { ...tile(29, 13), color: 'green' }, { ...tile(49, 26), color: 'grey' },
      { ...tile(61, 26), color: 'blue' }, { ...tile(95, 15), color: 'maroon' },
    ],
    exit: { x: 105 * T, y: 23 * T, w: 2 * T, h: 3 * T },
    lamps: [
      { ...tile(3, 22), color: 'warm' }, { ...tile(13, 13), color: 'green' }, { ...tile(24, 22), color: 'cool' },
      { ...tile(40, 23), color: 'warm' }, { ...tile(50, 21), color: 'green' }, { ...tile(61, 20), color: 'warm' },
      { ...tile(66, 14), color: 'cool' }, { ...tile(72, 18), color: 'green' }, { ...tile(83, 22), color: 'warm' },
      { ...tile(96, 17), color: 'cool' }, { ...tile(107, 22), color: 'warm' },
    ],
    signs: [
      { ...tile(4, 26), text: 'MOVE ← →   JUMP ↑ (TWICE: FLIP)' },
      { ...tile(26, 26), text: 'STAND STILL + ↓ : DROP' },
      { ...tile(49, 26), text: 'ROLL ↓' },
      { ...tile(62, 26), text: 'WALL JUMP' },
      { ...tile(76, 26), text: 'GRAB LEDGES' },
      { ...tile(82, 26), text: 'ATTACK SPACE   SWAP A' },
      { ...tile(102, 22), text: 'SPACE: BACK TO CANTINA' },
    ],
  };
}
