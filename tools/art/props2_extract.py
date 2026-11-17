"""Cut the second props sheet (props_sheet2.png, 1536 x 1024, already transparent) into game assets.

Run: python3 -I tools/art/props2_extract.py tools/art/source/props_sheet2.png public/assets
Writes hub2/<name>.png for every prop and bar_droid.png + bar_droid.json (idle, wave, walk, bounce).
The "refined globe" panel has a dark backdrop, keyed by colour distance so only the hologram is kept.
"""
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

SRC, OUT = sys.argv[1], sys.argv[2]
sheet = np.asarray(Image.open(SRC).convert('RGBA')).astype(float)

P = {
    'crate_grey': (40, 50, 152, 158), 'crate_brown': (182, 50, 296, 161), 'crate_green': (325, 50, 441, 158),
    'crate_blue': (470, 53, 590, 157), 'crate_maroon': (611, 49, 726, 158),
    'crate_grey_open': (43, 163, 155, 293), 'crate_brown_open': (184, 164, 298, 293), 'crate_green_open': (327, 163, 443, 292),
    'crate_blue_open': (470, 162, 592, 293), 'crate_maroon_open': (613, 159, 727, 291),
    'cone_blue': (785, 62, 880, 161), 'cone_white': (903, 61, 998, 162), 'cone_green': (1024, 62, 1118, 160), 'cone_red': (1141, 61, 1236, 161),
    'cone_blue2': (785, 173, 880, 269), 'cone_gold': (903, 173, 998, 268), 'cone_green2': (1025, 175, 1118, 268), 'cone_red2': (1141, 174, 1236, 268),
    'holox_blue': (795, 290, 870, 366), 'holox_white': (915, 290, 993, 366), 'holox_green': (1035, 290, 1111, 366), 'holox_red': (1155, 290, 1232, 366),
    'wireglobe_blue': (775, 395, 892, 540), 'wireglobe_white': (897, 395, 1012, 540), 'wireglobe_green': (1018, 395, 1133, 540), 'wireglobe_red': (1138, 395, 1252, 540),
    'console': (35, 345, 142, 446), 'wallbox_wires': (163, 349, 252, 450), 'wallbox_meter': (282, 349, 360, 449), 'canister': (389, 348, 448, 440),
    'locker': (468, 343, 544, 444), 'case_small': (559, 380, 643, 439), 'case_green': (659, 349, 740, 438),
    'lamp_dome': (28, 488, 109, 555), 'lamp_bar': (115, 488, 197, 530), 'lamp_tube_v': (215, 478, 264, 564), 'led_strip': (268, 505, 330, 543),
    'lamp_small': (333, 488, 392, 541), 'pipe': (395, 500, 490, 538), 'barrier': (493, 494, 600, 556), 'bench_hazard': (602, 485, 744, 556),
}
PANEL = {'globe_big': (1278, 78, 1517, 312), 'globe_white': (1282, 322, 1394, 422), 'globe_green': (1398, 322, 1502, 422), 'globe_red': (1338, 424, 1452, 537)}
PANEL_BG = np.array([16, 19, 22])

DROID = {
    'idle': (605, 742, [(106, 180), (191, 264), (277, 351), (363, 436), (448, 523), (535, 610), (621, 694)]),
    'wave': (603, 742, [(842, 916), (927, 1001), (1008, 1095), (1089, 1177), (1176, 1260), (1261, 1345), (1348, 1437), (1434, 1507)]),
    'walk': (776, 920, [(116, 169), (180, 248), (256, 318), (326, 390), (392, 460), (458, 534), (543, 598), (611, 666), (679, 732)]),
    'bounce': (776, 922, [(860, 934), (939, 1020), (1022, 1102), (1101, 1178), (1182, 1260), (1264, 1340), (1347, 1422), (1430, 1504)]),
}


def trim(rgba, thr=12):
    a = rgba[..., 3]
    ys, xs = np.where(a > thr)
    return rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def save(arr, path):
    Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGBA').save(path, optimize=True)


def main():
    os.makedirs(os.path.join(OUT, 'hub2'), exist_ok=True)
    for name, (x0, y0, x1, y1) in P.items():
        c = sheet[y0:y1, x0:x1].copy()
        c[c[..., 3] < 12, 3] = 0
        # drop stray bits from neighbours: keep the components that are big or close to the main one
        m = c[..., 3] > 40
        lab, n = ndimage.label(ndimage.binary_dilation(m, iterations=3))
        if n > 1:
            sizes = ndimage.sum(m, lab, range(1, n + 1))
            keep = [i + 1 for i, s in enumerate(sizes) if s >= 0.08 * sizes.max()]
            c[~np.isin(lab, keep), 3] = 0
        save(trim(c), os.path.join(OUT, 'hub2', name + '.png'))
    for name, (x0, y0, x1, y1) in PANEL.items():
        c = sheet[y0:y1, x0:x1].copy()
        d = np.sqrt(((c[..., :3] - PANEL_BG) ** 2).sum(2))
        a = np.clip((d - 12) / 50, 0, 1)
        col = np.clip((c[..., :3] - PANEL_BG * (1 - a[..., None])) / np.maximum(a, 1e-3)[..., None], 0, 255)
        save(trim(np.dstack([col, a * 255])), os.path.join(OUT, 'hub2', name + '.png'))

    # bar droid: one grid sheet, every frame anchored on its feet (bottom) and head centre
    frames, anims = [], {}
    for anim, (y0, y1, cols) in DROID.items():
        anims[anim] = []
        for x0, x1 in cols:
            c = sheet[y0:y1, x0:x1].copy()
            c[c[..., 3] < 12, 3] = 0
            solid = c[..., 3] > 150
            ys = np.where(solid.any(1))[0]
            feet, top = ys.max() + 1, ys.min()
            cx = float(np.median(np.where(solid[top:top + 14])[1]))
            frames.append((c, cx, feet))
            anims[anim].append(len(frames) - 1)
    half = int(np.ceil(max(max(cx, c.shape[1] - cx) for c, cx, _ in frames))) + 2
    up = max(f for _, _, f in frames) + 2
    down = max(c.shape[0] - f for c, _, f in frames) + 2
    cw, ch, ncol = 2 * half, up + down, 8
    rows = (len(frames) + ncol - 1) // ncol
    out = Image.new('RGBA', (cw * ncol, ch * rows), (0, 0, 0, 0))
    for i, (c, cx, feet) in enumerate(frames):
        im = Image.fromarray(c.astype(np.uint8), 'RGBA')
        out.alpha_composite(im, ((i % ncol) * cw + int(round(half - cx)), (i // ncol) * ch + up - feet))
    out.save(os.path.join(OUT, 'bar_droid.png'), optimize=True)
    json.dump({'frameWidth': int(cw), 'frameHeight': int(ch), 'feetY': int(up), 'anims': anims}, open(os.path.join(OUT, 'bar_droid.json'), 'w'))
    print('props', len(P) + len(PANEL), 'droid frames', len(frames), cw, ch, up)


main()
