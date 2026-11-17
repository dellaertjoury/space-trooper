"""Cut the poses out of a second action sheet made from sheet2_template.png (flat green background).

Run: python3 -I tools/art/grid_extract.py <sheet2.png> <cut_dir>
Rows are found automatically (top to bottom) and figures are read left to right, so the generator does not
need to hit the template grid exactly. Expected rows: run 8, idle 4, roll 6, saber 9, wall 3.
Files are written next to the first sheet's cut-outs, e.g. run8_0.png ... wall2_2.png; assemble_trooper.py
prefers them over the first sheet's frames when present.
"""
import os
import sys

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

SHEET, OUT = sys.argv[1], sys.argv[2]
ROWS = [('run8', 8), ('idle_side', 4), ('roll6', 6), ('saber', 9), ('wall2', 3)]


def key_green(a):
    """Background = the dominant green (sampled from the borders), keyed with a soft edge and despilled."""
    border = np.concatenate([a[:4].reshape(-1, 3), a[-4:].reshape(-1, 3), a[:, :4].reshape(-1, 3), a[:, -4:].reshape(-1, 3)])
    g = border[(border[:, 1] > border[:, 0] + 40) & (border[:, 1] > border[:, 2] + 40)]
    bg = np.median(g if len(g) else border, axis=0)
    d = np.sqrt(((a - bg) ** 2).sum(-1))
    greenish = (a[..., 1] > a[..., 0] + 25) & (a[..., 1] > a[..., 2] + 25)
    alpha = np.clip((d - 60) / 60, 0, 1)
    alpha[greenish & (d < 140)] = 0
    rgb = a.copy()
    spill = rgb[..., 1] > np.maximum(rgb[..., 0], rgb[..., 2])
    rgb[..., 1][spill] = np.maximum(rgb[..., 0], rgb[..., 2])[spill]   # remove green fringe
    return rgb, alpha


def main():
    os.makedirs(OUT, exist_ok=True)
    a = np.asarray(Image.open(SHEET).convert('RGB')).astype(float)
    rgb, alpha = key_green(a)
    fg = ndimage.binary_closing(alpha > 0.5, iterations=2)
    fg = ndimage.binary_fill_holes(fg)
    lab, n = ndimage.label(fg)
    objs = []
    for i, sl in enumerate(ndimage.find_objects(lab)):
        h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
        area = (lab[sl] == i + 1).sum()
        # figures are tall enough; labels/strips are flat; crumbs are tiny
        if h < 34 or area < 900 or (w > 4 * h):
            continue
        objs.append((sl, i + 1, (sl[0].start + sl[0].stop) / 2, (sl[1].start + sl[1].stop) / 2))
    # group into rows by vertical centre (split where the gap is large)
    objs.sort(key=lambda o: o[2])
    rows, cur = [], []
    for o in objs:
        if cur and o[2] - cur[-1][2] > 70:
            rows.append(cur); cur = []
        cur.append(o)
    if cur:
        rows.append(cur)
    print('rows found:', [len(r) for r in rows], ' expected:', [n for _, n in ROWS])
    for (name, expected), row in zip(ROWS, rows):
        row.sort(key=lambda o: o[3])
        if len(row) != expected:
            print(f'  warning: {name} has {len(row)} figures (expected {expected}); using them in order')
        for k, (sl, idx, _, _) in enumerate(row):
            m = lab[sl] == idx
            m = ndimage.binary_dilation(m, iterations=1)
            al = alpha[sl] * m
            im = Image.fromarray(np.dstack([rgb[sl], al * 255]).astype(np.uint8), 'RGBA')
            im = im.crop(im.getbbox())
            im.save(os.path.join(OUT, f'{name}_{k}.png'))
    print('written to', OUT)


main()
