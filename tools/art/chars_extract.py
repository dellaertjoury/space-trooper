"""Cut the player and the two enemies out of the character action sheet (chars_sheet.png, 1774 x 887).

Run: python3 -I tools/art/chars_extract.py tools/art/source/chars_sheet.png public/assets

Background: the dark slate is estimated per pixel (frames masked out, then blurred in), and alpha comes
from each pixel's colour distance to it, so the gaps between arms and body come out transparent.
Every frame is anchored on its torso centre (x) and lowest opaque row (feet), upscaled 2x and packed in
a grid sheet with one shared cell size, so the game can flip it around the feet.
Player saber frames get the blade split into separate layers so the game can tint it (saber colour).
"""
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

SRC, OUT = sys.argv[1], sys.argv[2]
SCALE = 2
img = Image.open(SRC).convert('RGB')
im = np.asarray(img).astype(float)
H, W, _ = im.shape

# --- background model -------------------------------------------------------------------------------
lum = im.mean(2)
sat = im.max(2) - im.min(2)
bg0 = ndimage.uniform_filter(ndimage.median_filter(lum, size=(1, 41)), 9)
fg0 = ndimage.binary_dilation((np.abs(lum - bg0) > 10) | (sat > 40), iterations=3)
w = (~fg0).astype(float)
bg = np.stack([ndimage.gaussian_filter(im[..., c] * w, 12) for c in range(3)], -1) / (ndimage.gaussian_filter(w, 12)[..., None] + 1e-6)
dist = np.sqrt(((im - bg) ** 2).sum(2))

# --- layout of the sheet --------------------------------------------------------------------------
PANELS = {'trooper': (6, 98, 192), 'raider': (319, 409, 492), 'gunner': (599, 689, 780)}
ROW1 = [('idle', 215, 485, 5), ('walk', 485, 822, 7), ('run', 822, 1175, 7), ('jump', 1175, 1380, 4), ('fall', 1380, 1515, 2), ('land', 1515, 1760, 4)]
ROW2 = {'trooper': [('melee', 215, 990, 8), ('shoot', 990, 1760, 7)], 'raider': [('attack', 215, 1760, 7)], 'gunner': [('shoot', 215, 1760, 8)]}
ROW3 = [('roll', 215, 768, 8), ('grapple', 768, 1070, 4), ('hurt', 1070, 1338, 4), ('die', 1338, 1760, 6)]
TAGS = {0: [(215, 300), (485, 583), (822, 915), (1175, 1270), (1380, 1475), (1515, 1612)],
        1: [(215, 355), (990, 1100)], 2: [(215, 355), (768, 886), (1070, 1170), (1338, 1424)]}

strong = dist > 34
weak = dist > 11
mask = weak.copy()
mask[:, :213] = False
for name, tops in PANELS.items():  # erase the label tags and the row dividers
    for r, top in enumerate(tops):
        for x0, x1 in TAGS[r] if not (name != 'trooper' and r == 1) else [(215, 355)]:
            mask[top - 3:top + 21, x0:x1] = False
        mask[top - 4:top + 2, 200:] = False
lines = ndimage.binary_opening(mask, structure=np.ones((1, 90))) | ndimage.binary_opening(mask, structure=np.ones((90, 1)))
mask &= ~ndimage.binary_dilation(lines, structure=np.ones((5, 3)))
lab, _ = ndimage.label(mask)
keep_ids = np.unique(lab[strong & mask])
mask = np.isin(lab, keep_ids) & mask
mask = ndimage.binary_opening(mask, structure=np.ones((2, 2))) | (strong & mask)


def blobs_in(x0, x1, y0, y1, n):
    sub = ndimage.binary_dilation(mask[y0:y1, x0:x1], iterations=3)
    lab, _ = ndimage.label(sub)
    bs = []
    for i, s in enumerate(ndimage.find_objects(lab)):
        if s is None:
            continue
        area = (lab[s] == i + 1).sum()
        if area < 120:
            continue
        reg = np.zeros((H, W), bool)
        reg[y0:y1, x0:x1][s] = lab[s] == i + 1
        bs.append([s[1].start + x0, s[0].start + y0, s[1].stop + x0, s[0].stop + y0, area, reg])
    bs.sort(key=lambda b: b[0])
    while len(bs) > n:  # merge the smallest stray piece into its nearest neighbour
        k = min(range(len(bs)), key=lambda i: bs[i][4])
        b = bs.pop(k)
        j = min(range(len(bs)), key=lambda i: abs((bs[i][0] + bs[i][2]) / 2 - (b[0] + b[2]) / 2))
        o = bs[j]
        bs[j] = [min(o[0], b[0]), min(o[1], b[1]), max(o[2], b[2]), max(o[3], b[3]), o[4] + b[4], o[5] | b[5]]
    while len(bs) < n:  # two frames touching (muzzle flash): split the widest at its thinnest column
        k = max(range(len(bs)), key=lambda i: bs[i][2] - bs[i][0])
        b = bs.pop(k)
        cols = mask[b[1]:b[3], b[0]:b[2]].sum(0).astype(float)
        m = len(cols)
        lo, hi = int(m * 0.3), int(m * 0.7)
        c = lo + int(np.argmin(cols[lo:hi]))
        r1, r2 = b[5].copy(), b[5].copy()
        r1[:, b[0] + c:] = False
        r2[:, :b[0] + c] = False
        bs.insert(k, [b[0] + c, b[1], b[2], b[3], b[4] / 2, r2])
        bs.insert(k, [b[0], b[1], b[0] + c, b[3], b[4] / 2, r1])
    return [b[:4] + [b[5]] for b in bs]


def cut(b):
    x0, y0, x1, y1 = b[0] - 3, b[1] - 3, b[2] + 3, b[3] + 3
    D = dist[y0:y1, x0:x1]
    M = ndimage.binary_dilation(mask[y0:y1, x0:x1] & b[4][y0:y1, x0:x1], iterations=1) & (D > 8)
    lab, n = ndimage.label(M)
    for i, sl in enumerate(ndimage.find_objects(lab)):
        hh, ww = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
        if hh <= 4 and ww >= 12:  # leftover divider line
            M[sl][lab[sl] == i + 1] = False
    a = np.clip((D - 8) / 22, 0, 1) * M
    solid = a > 0.5
    holes = ndimage.binary_fill_holes(solid) & ~solid
    hl, hn = ndimage.label(holes)
    if hn:
        sizes = ndimage.sum(holes, hl, range(1, hn + 1))
        for i, s in enumerate(sizes):
            if s <= 4:  # pinholes inside the dark suit; real gaps (arm / body) are bigger
                a[hl == i + 1] = 1
    rgb = im[y0:y1, x0:x1]
    B = bg[y0:y1, x0:x1]
    A = np.maximum(a, 1e-3)[..., None]
    col = np.clip((rgb - B * (1 - A)) / A, 0, 255)
    return np.dstack([col, a * 255]), (x0, y0)


def anchor(rgba):
    a = rgba[..., 3] > 128
    r, g, b_ = rgba[..., 0], rgba[..., 1], rgba[..., 2]
    l = (r + g + b_) / 3
    s = rgba[..., :3].max(2) - rgba[..., :3].min(2)
    glowy = ((l > 170) & (s < 70)) | ((r > 170) & (g < 110)) | ((g > 150) & (r < 140))
    body = a & ~glowy
    ys = np.where(body.any(1))[0]
    feet = ys.max() + 1
    top = ys.min()
    core = body & (l < 150)
    band = core[top + int((feet - top) * 0.1): top + int((feet - top) * 0.38)]
    xs = np.where(band)[1]
    cx = float(np.median(xs)) if len(xs) else rgba.shape[1] / 2
    return cx, feet, top


def blade_split(rgba, cx):
    """Saber blade = bright, colourless pixels away from the torso. Returns (base, halo, core, glow)."""
    r, g, b_ = rgba[..., 0], rgba[..., 1], rgba[..., 2]
    l = (r + g + b_) / 3
    s = rgba[..., :3].max(2) - rgba[..., :3].min(2)
    a = rgba[..., 3]
    br = (l > 200) & (a > 100)
    lab, n = ndimage.label(br)
    sizes = ndimage.sum(br, lab, range(1, n + 1)) if n else []
    blade = np.isin(lab, [i + 1 for i, z in enumerate(sizes) if z >= 32])
    for _ in range(3):  # grow into bright pieces the blade touches (the blade splits where it crosses a leg)
        touch = np.unique(lab[ndimage.binary_dilation(blade, iterations=2) & br])
        grown = np.isin(lab, [t for t in touch if t and 8 <= sizes[t - 1] < 32]) | blade
        if grown.sum() == blade.sum():
            break
        blade = grown
    body = ~blade
    near = ndimage.binary_dilation(blade, iterations=5) & ~blade & (a < 235) & (l > 60)
    base = rgba.copy()
    base[blade | near, 3] = 0
    hot = blade & (l > 228) & (a > 170)
    core = np.zeros_like(rgba)
    core[..., :3] = 255
    core[..., 3] = np.clip(ndimage.gaussian_filter(hot.astype(float), 0.5) * 1.1, 0, 1) * 235
    halo_a = np.clip(ndimage.gaussian_filter(ndimage.binary_dilation(blade, iterations=2).astype(float), 1.2) * 1.8, 0, 1)
    halo = np.dstack([np.full(blade.shape, 255.0)] * 3 + [halo_a * 255])
    glow_a = np.clip(ndimage.gaussian_filter(blade.astype(float), 3.0) * 2.2, 0, 1)
    glow = np.dstack([np.full(blade.shape, 255.0)] * 3 + [glow_a * 200])
    return base, halo, core, glow, int(blade.sum())


def build(name):
    tops = PANELS[name]
    rows = [(tops[0], tops[1], ROW1), (tops[1], tops[2], ROW2[name]), (tops[2], tops[2] + 95, ROW3)]
    frames, anims = [], {}
    for y0, y1, segs in rows:
        for seg, x0, x1, n in segs:
            idx = []
            for b in blobs_in(x0, x1, y0 + 2, y1 - 2, n):
                rgba, org = cut(b)
                cx, feet, top = anchor(rgba)
                frames.append({'rgba': rgba, 'cx': cx, 'feet': feet, 'top': top, 'seg': seg})
                idx.append(len(frames) - 1)
            anims[seg] = idx
    # anchor x on the head (top of the solid, non-glowing pixels): weapons, arcs and muzzle flashes
    # otherwise drag a centroid around and the character jitters sideways while attacking
    for f in frames:
        r = f['rgba']
        l = r[..., :3].mean(2)
        sat_ = r[..., :3].max(2) - r[..., :3].min(2)
        R, G = r[..., 0], r[..., 1]
        glowy = ((l > 190) & (sat_ < 60)) | ((R > 170) & (R > 1.6 * G)) | ((G > 140) & (G > 1.3 * R))
        solid = (r[..., 3] > 220) & ~glowy
        solid = ndimage.binary_opening(solid, structure=np.ones((2, 2)))
        allsolid = solid.copy()
        lab, n = ndimage.label(solid)
        if n:
            sizes = ndimage.sum(solid, lab, range(1, n + 1))
            solid = lab == (int(np.argmax(sizes)) + 1)
        ys = np.where(solid.any(1))[0]
        if not len(ys) or f['seg'] in ('die', 'roll'):
            continue
        t = ys.min()
        xs = np.where(solid[t:t + 12])[1]
        f['cx'] = float(np.median(xs))
        ays = np.where(allsolid.any(1))[0]
        b_ = ays.max()
        f['footx'] = float(np.median(np.where(allsolid[b_ - 8:b_ + 1])[1]))
    # enemy attacks: the swing / muzzle flash reaches above the head, so use the planted feet instead
    idle0 = frames[anims['idle'][0]]
    for f in frames:
        if name != 'trooper' and f['seg'] in ('attack', 'shoot') and 'footx' in f:
            f['cx'] = f['footx'] + (idle0['cx'] - idle0['footx'])
    # shared cell around the anchor

    L = max(f['cx'] for f in frames) + 2
    R = max(f['rgba'].shape[1] - f['cx'] for f in frames) + 2
    U = max(f['feet'] for f in frames) + 2
    D = max(f['rgba'].shape[0] - f['feet'] for f in frames) + 2
    half = int(np.ceil(max(L, R)))
    cw, ch = 2 * half * SCALE, int(np.ceil(U + D)) * SCALE
    feetY = int(np.ceil(U)) * SCALE
    cols = 8
    rows_n = (len(frames) + cols - 1) // cols
    layers = ['base'] + (['halo', 'core', 'glow'] if name == 'trooper' else [])
    sheets = {k: Image.new('RGBA', (cw * cols, ch * rows_n), (0, 0, 0, 0)) for k in layers}
    meta = []
    for i, f in enumerate(frames):
        parts = {'base': f['rgba']}
        bl = 0
        if name == 'trooper' and f['seg'] == 'melee':
            base, halo, core, glow, bl = blade_split(f['rgba'], f['cx'])
            parts = {'base': base, 'halo': halo, 'core': core, 'glow': glow}
        gx, gy = (i % cols) * cw, (i // cols) * ch
        for k, arr in parts.items():
            p = Image.fromarray(arr.astype(np.uint8), 'RGBA')
            p = p.resize((p.width * SCALE, p.height * SCALE), Image.LANCZOS)
            ox = int(round(half * SCALE - f['cx'] * SCALE))
            oy = feetY - f['feet'] * SCALE
            sheets[k].alpha_composite(p, (gx + ox, gy + oy))
        meta.append({'seg': f['seg'], 'h': int(f['feet'] - f['top']), 'glow': bl > 20})
    for k, s in sheets.items():
        s.save(os.path.join(OUT, name + ('' if k == 'base' else '_' + k) + '.png'), optimize=True)
    return {'frameWidth': cw, 'frameHeight': ch, 'feetY': feetY, 'scale': 1 / SCALE, 'cols': cols, 'frames': meta, 'segments': anims}


# game animations: (segment, frame indices within it, fps, loop). Sheet labels promise more frames than are
# drawn (e.g. IDLE (6) shows 5), so every segment is used as drawn.
ANIMS = {
    'trooper': {
        'idle': ('idle', [0, 1, 2, 3, 4, 3, 2, 1], 7, True), 'idle_blaster': ('shoot', [3], 1, True),
        'walk': ('walk', None, 11, True), 'run': ('run', None, 13, True),
        'jump': ('jump', [0, 1], 10, False), 'fall': ('fall', [0, 1], 6, True), 'land': ('land', None, 30, False),
        'doublejump': ('roll', [1, 2, 3, 4, 5], 20, False),  # a flip, not a second jump pose
        'walljump': ('jump', [1, 2], 10, False), 'wallslide': ('grapple', [0], 1, True),
        'ledgehang': ('grapple', [1], 1, True), 'climb': ('grapple', [2, 3], 8, False),
        # the full swing; the game spreads frames 0-2 over the wind-up, 3-5 over the hit, 6 over the recovery
        'saber1': ('melee', [0, 1, 2, 3, 4, 5, 6], 30, False), 'saber2': ('melee', [0, 1, 2, 3, 4, 5, 6], 30, False), 'saber3': ('melee', [0, 1, 2, 3, 4, 5, 6], 30, False),
        'shoot': ('shoot', [1, 2, 3], 18, False), 'roll': ('roll', None, 22, False),
        'hurt': ('hurt', None, 14, False), 'death': ('die', None, 8, False),
    },
    'raider': {
        'idle': ('idle', [0, 1, 2, 3, 4, 3, 2, 1], 7, True), 'walk': ('walk', None, 9, True), 'run': ('run', None, 12, True),
        'jump': ('jump', [0, 1], 8, False), 'fall': ('fall', [0, 1], 6, True),
        'windup': ('attack', [0, 1], 6, False), 'strike': ('attack', [2, 3, 4], 16, False), 'recover': ('attack', [5, 6], 6, False),
        'hurt': ('hurt', None, 14, False), 'death': ('die', None, 9, False),
    },
    'gunner': {
        'idle': ('idle', [0, 1, 2, 3, 4, 3, 2, 1], 7, True), 'walk': ('walk', None, 9, True), 'run': ('run', None, 12, True),
        'jump': ('jump', [0, 1], 8, False), 'fall': ('fall', [0, 1], 6, True),
        'windup': ('shoot', [0, 1, 2], 8, False), 'strike': ('shoot', [3, 4, 5], 16, False), 'recover': ('shoot', [6, 7], 6, False),
        'hurt': ('hurt', None, 14, False), 'death': ('die', None, 9, False),
    },
}

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for n in PANELS:
        m = build(n)
        anims = {}
        for a, (seg, idx, fps, loop) in ANIMS[n].items():
            fr = m['segments'][seg]
            anims[a] = {'frames': [fr[i] for i in idx] if idx else fr, 'fps': fps, 'loop': loop}
        meta = {k: m[k] for k in ('frameWidth', 'frameHeight', 'feetY', 'scale', 'cols')}
        meta['frames'] = [{'glow': f['glow'], 'h': f['h']} for f in m['frames']]
        meta['anims'] = anims
        json.dump(meta, open(os.path.join(OUT, n + '.json'), 'w'))
        print(n, m['frameWidth'], m['frameHeight'], m['feetY'], {k: len(v) for k, v in m['segments'].items()})
