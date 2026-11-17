"""Cut the Trooper's poses out of the character action sheet (smooth, non-pixel art).

Run: python3 -I tools/art/sheet_extract.py <action_sheet.png> <out_dir>
Each pose: background-removal model + per-crop gradient key (union), then cleanup
(labels, arrows, flat panel patches, blood) and a soft anti-aliased edge.
Box = sheet pixels (x0, y0, x1, y1, mirror).
"""
import os
import sys

import numpy as np
from PIL import Image, ImageFilter
from rembg import new_session, remove
from scipy import ndimage

SHEET, OUT = sys.argv[1], sys.argv[2]
B = {
 'idle_b':(147,113,221,276,0),
 'walk_0':(274,120,352,274,0),'walk_1':(352,120,431,273,0),'walk_2':(434,120,505,273,0),'walk_3':(515,120,592,273,0),
 'run_0':(624,136,728,271,0),'run_1':(722,131,822,267,0),'run_2':(816,134,913,273,0),'run_3':(917,138,1001,272,0),
 'jump_0':(56,328,150,469,0),'jump_1':(177,276,265,442,0),'jump_2':(287,314,376,458,0),
 'dj_0':(444,311,520,443,0),'dj_1':(548,304,622,441,0),
 'roll_0':(14,560,118,640,1),'roll_1':(158,561,241,641,0),'roll_2':(264,506,353,644,0),
 'ledge':(574,527,647,660,0),
 'wall':(722,505,787,642,0),
 'sword_0':(54,689,153,835,0),'sword_1':(170,661,294,834,0),'sword_2':(312,687,471,833,0),'sword_3':(484,689,627,832,0),
 'shoot_0':(689,686,800,837,0),'shoot_1':(833,686,955,837,0),
 'flip_0':(28,882,133,999,0), 'flip_1':(139,879,215,999,0), 'flip_2':(214,880,312,973,0), 'flip_3':(326,873,423,1000,0),
 'hurt':(457,848,569,997,0),
 'death_0':(593,846,733,1005,0),'death_1':(714,902,839,1001,0),'death_2':(838,938,1008,1006,0),
}


def gradient_key(a, thr=13):
    h, w = a.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w] / max(h, w)
    border = np.zeros((h, w), bool); border[:2] = border[-2:] = True; border[:, :2] = border[:, -2:] = True
    X = np.stack([np.ones_like(xx), xx, yy, xx * xx, yy * yy, xx * yy], -1)
    bg = np.zeros_like(a)
    for c in range(3):
        coef, *_ = np.linalg.lstsq(X[border], a[..., c][border], rcond=None)
        bg[..., c] = X @ coef
    d = np.abs(ndimage.uniform_filter(a, (3, 3, 1)) - bg).max(-1)
    lab, _ = ndimage.label(d < thr)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    return ~np.isin(lab, list(edge))


def cleanup(rgb, m, name):
    lum = rgb.mean(-1); sat = rgb.max(-1) - rgb.min(-1)
    std = np.sqrt(np.maximum(ndimage.uniform_filter(lum ** 2, 5) - ndimage.uniform_filter(lum, 5) ** 2, 0))
    flat = ndimage.binary_opening((std < 5.5) & (sat < 28) & (lum > 40) & (lum < 205), iterations=2)
    m = m & ~flat
    if name.startswith('death'):  # no blood pool
        r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
        m &= ~((r > 90) & (r > g * 2.2) & (r > b * 2.0) & (g < 70))
    m = ndimage.binary_opening(m, iterations=1)
    lab, k = ndimage.label(m)
    if k:
        sizes = ndimage.sum(m, lab, range(1, k + 1))
        main = int(np.argmax(sizes)) + 1
        near = ndimage.binary_dilation(lab == main, iterations=3)
        keep = [main] + [i + 1 for i, s in enumerate(sizes) if i + 1 != main and s > sizes.max() * 0.02 and (near & (lab == i + 1)).any()]
        m = np.isin(lab, keep)
    return ndimage.binary_fill_holes(m)


def main():
    os.makedirs(OUT, exist_ok=True)
    session = new_session('isnet-general-use')
    sheet = Image.open(SHEET).convert('RGB')
    arr = np.asarray(sheet).astype(float)
    for name, (x0, y0, x1, y1, mirror) in B.items():
        crop = sheet.crop((x0, y0, x1, y1))
        big = crop.resize((crop.width * 3, crop.height * 3), Image.LANCZOS)
        rb = np.asarray(remove(big, session=session, post_process_mask=True).resize(crop.size, Image.LANCZOS))[..., 3] > 128
        a = arr[y0:y1, x0:x1]
        if name == 'jump_1':  # the "JUMP" label sits right beside his hair: drop its white letters first
            txt = (a.mean(-1) > 215) & ((a.max(-1) - a.min(-1)) < 25)
            txt[26:] = False
            a = a.copy(); a[ndimage.binary_dilation(txt, iterations=2)] = a[30:40, 2:6].mean((0, 1))
        m = cleanup(a, gradient_key(a) | rb, name)
        alpha = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7))
        im = Image.fromarray(a.astype(np.uint8)); im.putalpha(alpha)
        im = im.crop(im.getbbox())
        if mirror:
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
        im.save(os.path.join(OUT, name + '.png'))
        print(name, im.size, flush=True)


main()
