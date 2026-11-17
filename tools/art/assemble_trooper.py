"""Build the Trooper sprite sheet from the cut-out poses (smooth art, drawn at 2x).

Run: python3 -I tools/art/assemble_trooper.py <cut_dir> <out_dir>
Writes trooper.png, trooper_glow.png (saber glow, tinted in-engine) and trooper.json.
Frames are drawn at 2x world scale: the game shows them at scale 0.5 on a 2x-zoomed camera.
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

CUT, OUT = sys.argv[1], sys.argv[2]
FW, FH, FEET = 256, 224, 214        # frame size and floor line (2x pixels)
TARGET_H = 156                      # standing height in 2x pixels = 78 world px


def load(n):
    return Image.open(os.path.join(CUT, n + '.png')).convert('RGBA')


def torso_x(im):
    a = np.asarray(im)[..., 3] > 128
    h = a.shape[0]
    band = a[int(h * 0.22):int(h * 0.55)]
    xs = np.nonzero(band)[1]
    return xs.mean() if len(xs) else im.width / 2


NEUTRAL_EDGE = (205, 216, 230)   # blade edges stay neutral in the art; the game tints the edge + glow layers


def saberize(im, close_iter=6):
    """Blade + slash arcs -> neutral white-hot blade in the art, plus two masks the game tints:
    'edge' (sharp, the coloured rim of the blade) and 'glow' (soft halo).
    The body is found from the dark suit and ink outline (armour plates sit inside it);
    bright, colourless pixels outside the body are the blade or its arcs."""
    a = np.asarray(im).astype(float)
    m = a[..., 3] > 90
    rgb = a[..., :3]
    lum = rgb.mean(-1); sat = rgb.max(-1) - rgb.min(-1)
    dark = m & (lum < 75)
    body = ndimage.binary_closing(dark, structure=np.ones((3, 3)), iterations=close_iter)
    body = ndimage.binary_opening(body, iterations=3)          # thin dark lines (blade outline, hilt) drop out
    body = ndimage.binary_fill_holes(body)
    body = ndimage.binary_dilation(body, iterations=3)
    bright = m & (lum > 100) & (sat < 70)
    blade = bright & ~body
    blade[int(blade.shape[0] * 0.68):] = False   # boots and knee plates are white too; arcs never reach that low
    lab, n = ndimage.label(blade)
    if n:  # ignore crumbs
        sizes = ndimage.sum(blade, lab, range(1, n + 1))
        blade = np.isin(lab, [i + 1 for i, s_ in enumerate(sizes) if s_ >= 12])
    rim = ndimage.binary_dilation(blade, iterations=1) & m & ~body & (lum < 100)
    out = a.copy()
    k = np.clip((lum - 100) / 130, 0, 1)
    out[..., :3][blade] = np.stack([215 + 40 * k] * 3, -1)[blade]
    out[..., :3][rim] = NEUTRAL_EDGE
    edge = (rim | (blade & (k < 0.55))).astype(np.uint8) * 255
    glow = (blade | rim).astype(np.uint8) * 255
    return Image.fromarray(out.astype(np.uint8), 'RGBA'), Image.fromarray(glow, 'L'), Image.fromarray(edge, 'L')


# Hand-measured blades (cut-image pixels, base -> tip). Thin blades with ink outlines are hard to
# separate from the body automatically, so they are repainted as a vibro-saber here.
BLADES = {'sword_0': [((20, 73), (72, 106))], 'sword_1': [((38, 34), (3, 3))], 'sword_2': [((37, 13), (22, 16))]}
ARC_CLOSE = {'sword_2': 2, 'sword_3': 2}


def draw_blades(size, segs):
    """Supersampled blade strokes: returns (rgba art, glow mask, edge mask)."""
    from PIL import ImageDraw
    S = 4
    W, H = size[0] * S, size[1] * S
    art = Image.new('RGBA', (W, H)); d = ImageDraw.Draw(art)
    gl = Image.new('L', (W, H)); gd = ImageDraw.Draw(gl)
    ed = Image.new('L', (W, H)); edd = ImageDraw.Draw(ed)
    for (x0, y0), (x1, y1) in segs:
        p0, p1 = (x0 * S, y0 * S), (x1 * S, y1 * S)
        d.line([p0, p1], fill=(14, 10, 22, 255), width=int(4.2 * S))
        d.line([p0, p1], fill=NEUTRAL_EDGE + (255,), width=int(3.0 * S))
        d.line([p0, p1], fill=(246, 250, 255, 255), width=int(1.4 * S))
        gd.line([p0, p1], fill=255, width=int(4 * S))
        edd.line([p0, p1], fill=255, width=int(3.0 * S))
        edd.line([p0, p1], fill=0, width=int(1.4 * S))
    return art.resize(size, Image.LANCZOS), gl.resize(size, Image.LANCZOS), ed.resize(size, Image.LANCZOS)


def mirrored(segs, length=0.9):
    """The vibro-staff's second blade: same line, pointing the other way from the hilt."""
    return [((x0, y0), (round(x0 - (x1 - x0) * length), round(y0 - (y1 - y0) * length))) for (x0, y0), (x1, y1) in segs]


LAYERS = ('base', 'glow', 'edge', 'dual', 'dglow', 'dedge')


def main():
    os.makedirs(OUT, exist_ok=True)
    ref = load('idle_b')
    scale1 = TARGET_H / ref.getbbox()[3]
    has = lambda prefix, n: all(os.path.exists(os.path.join(CUT, f'{prefix}_{i}.png')) for i in range(n))
    # second sheet (tools/art/grid_extract.py): scaled from its own standing height
    v2 = has('idle_side', 1)
    scale2 = TARGET_H / load('idle_side_0').height if v2 else scale1
    V2_PREFIX = ('run8_', 'idle_side_', 'roll6_', 'saber_', 'wall2_')

    def frame(name, rot=0, squash=1.0, feet_lift=0):
        im = load(name)
        scale = scale2 if name.startswith(V2_PREFIX) else scale1
        PAD = 60 if name in BLADES else 0   # room for the staff's second blade
        if PAD:
            padded = Image.new('RGBA', (im.width + 2 * PAD, im.height + 2 * PAD)); padded.alpha_composite(im, (PAD, PAD)); im = padded
        L = {'base': im}
        if name.startswith(('sword', 'saber_')):
            L['base'], L['glow'], L['edge'] = saberize(im, ARC_CLOSE.get(name, 6))
            if name in BLADES:
                segs = [((x0 + PAD, y0 + PAD), (x1 + PAD, y1 + PAD)) for (x0, y0), (x1, y1) in BLADES[name]]
                art, g, e = draw_blades(im.size, segs)
                L['base'] = Image.alpha_composite(L['base'], art)
                L['glow'] = Image.fromarray(np.maximum(np.asarray(L['glow']), np.asarray(g)))
                L['edge'] = Image.fromarray(np.maximum(np.asarray(L['edge']), np.asarray(e)))
                # dual blade drawn behind the body, so it goes on its own layer under the base sprite
                L['dual'], L['dglow'], L['dedge'] = draw_blades(im.size, mirrored(segs))
        w, h = max(1, round(im.width * scale)), max(1, round(im.height * scale * squash))
        L = {k: v.resize((w, h), Image.LANCZOS) for k, v in L.items()}
        cx = torso_x(L['base'])
        if rot:
            L = {k: v.rotate(rot, resample=Image.BICUBIC, expand=True) for k, v in L.items()}
            cx = L['base'].width / 2
        pad_s = round(PAD * scale)
        x = round(FW / 2 - cx); y = FEET - L['base'].height - feet_lift + pad_s  # padding sits below the feet too
        out = {}
        for k in LAYERS:
            mode = 'RGBA' if k in ('base', 'dual') else 'L'
            c = Image.new(mode, (FW, FH))
            if k in L:
                if mode == 'RGBA': c.alpha_composite(L[k], (x, y))
                else: c.paste(L[k], (x, y), L[k])
            out[k] = c
        return out

    A = {}
    # side-facing, combat-ready idles (breathing): saber stance and blaster stance
    A['idle'] = ([('sword_0', 0, s) for s in (1.0, 1.006, 1.012, 1.006)], 5, True)
    A['idle_blaster'] = ([('shoot_0', 0, s) for s in (1.0, 1.006, 1.012, 1.006)], 5, True)
    A['idle_front'] = ([('idle_b',)], 1, True)  # kept for menus / the Cantina
    A['run'] = ([('run_0',), ('run_1',), ('run_2',), ('run_3',)], 11, True)
    A['walk'] = ([('walk_0',), ('walk_1',), ('walk_2',), ('walk_3',)], 8, True)
    A['jump'] = ([('jump_0',), ('jump_1',)], 10, False)
    A['fall'] = ([('jump_2',)], 1, True)
    A['land'] = ([('jump_0',)], 1, False)
    A['doublejump'] = ([('dj_0',), ('dj_1',)], 10, False)
    A['roll'] = ([('roll_0',), ('roll_1',), ('roll_1', -60), ('roll_1', -120), ('roll_1', -180), ('roll_1', -240), ('roll_1', -300), ('roll_2',)], 20, False)
    A['walljump'] = ([('flip_0',), ('flip_1',), ('flip_2',), ('flip_3',)], 14, False)
    A['wallslide'] = ([('wall',)], 1, True)
    A['ledgehang'] = ([('ledge',)], 1, True)
    A['climb'] = ([('ledge',), ('dj_1',), ('jump_0',)], 9, False)
    A['saber1'] = ([('sword_0',), ('sword_2',), ('sword_3',)], 18, False)
    A['saber2'] = ([('sword_1',), ('sword_3',), ('sword_0',)], 18, False)
    A['saber3'] = ([('sword_1',), ('sword_2',), ('sword_3',)], 14, False)
    A['shoot'] = ([('shoot_0',), ('shoot_1',)], 14, False)
    A['hurt'] = ([('hurt',)], 1, False)
    A['death'] = ([('death_0',), ('death_1',), ('death_2',)], 6, False)

    # second-sheet frames replace the first sheet's where they exist
    if has('run8', 8):
        A['run'] = ([(f'run8_{i}',) for i in range(8)], 16, True)
    if has('idle_side', 4):
        A['idle'] = ([(f'idle_side_{i}',) for i in range(4)], 5, True)
    if has('roll6', 6):
        A['roll'] = ([(f'roll6_{i}',) for i in range(6)], 16, False)
    if has('saber', 9):
        for k in range(3):
            A[f'saber{k + 1}'] = ([(f'saber_{k * 3 + i}',) for i in range(3)], 18 if k < 2 else 14, False)
    if has('wall2', 3):
        A['wallslide'] = ([('wall2_0',)], 1, True)
        A['walljump'] = ([('wall2_1',), ('wall2_2',)], 10, False)
    print('second sheet frames used' if v2 else 'first sheet only')

    frames, index, meta_frames = [], {}, []
    anims = {}
    for an, (specs, fps, loop) in A.items():
        idx = []
        for sp in specs:
            key = tuple(sp)
            if key not in index:
                name = sp[0]; rot = sp[1] if len(sp) > 1 else 0; squash = sp[2] if len(sp) > 2 else 1.0
                frames.append(frame(name, rot, squash))
                index[key] = len(frames) - 1
            idx.append(index[key])
        anims[an] = {'frames': idx, 'fps': fps, 'loop': loop}

    cols = 8
    rows = math.ceil(len(frames) / cols)
    sheets = {k: Image.new('RGBA' if k in ('base', 'dual') else 'L', (cols * FW, rows * FH)) for k in LAYERS}
    for i, fr in enumerate(frames):
        x, y = (i % cols) * FW, (i // cols) * FH
        for k in LAYERS:
            if k in ('base', 'dual'): sheets[k].alpha_composite(fr[k], (x, y))
            else: sheets[k].paste(fr[k], (x, y))
        meta_frames.append({'x': x, 'y': y, 'hand': [FW / 2, FEET - 80], 'handAngle': 0,
                            'glow': bool(np.asarray(fr['glow']).any()), 'dual': bool(np.asarray(fr['dglow']).any())})
    sheets['base'].save(os.path.join(OUT, 'trooper.png'), optimize=True)
    sheets['dual'].save(os.path.join(OUT, 'trooper_dual.png'), optimize=True)

    def white(mask, blur, gain, name):
        g = mask.filter(ImageFilter.GaussianBlur(blur)) if blur else mask
        g = Image.eval(g, lambda v: min(255, int(v * gain)))
        im = Image.new('RGBA', mask.size, (255, 255, 255, 0)); im.putalpha(g)
        im.save(os.path.join(OUT, name), optimize=True)
    white(sheets['glow'], 5, 2.2, 'trooper_glow.png')
    white(sheets['edge'], 0.6, 1.0, 'trooper_edge.png')
    white(sheets['dglow'], 5, 2.2, 'trooper_dual_glow.png')
    white(sheets['dedge'], 0.6, 1.0, 'trooper_dual_edge.png')
    json.dump({'frameWidth': FW, 'frameHeight': FH, 'feetY': FEET, 'scale': 0.5, 'frames': meta_frames, 'anims': anims},
              open(os.path.join(OUT, 'trooper.json'), 'w'), indent=1)
    print('frames', len(frames), 'sheet', sheets['base'].size, 'scale', round(scale1, 3), round(scale2, 3))


main()
