"""Cut the Cantina props out of the hub asset sheet (workbenches, crates, holograms, droids, consoles, props).

Run: python3 -I tools/art/props_extract.py <hub_assets_sheet.png> <out_dir>
Solid props: the slate background is keyed by flooding in from the crop border.
Glowing props (holograms, lamps, energy cells): soft key, so their glow fades out instead of being cut.
The two astromech droids on the sheet are left out on purpose (too close to a famous film droid).
"""
import os
import sys

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

SHEET, OUT = sys.argv[1], sys.argv[2]

# name: (x0, y0, x1, y1, glow)   sheet pixels (1024 x 576)
P = {
    'bench_tools': (20, 30, 189, 141, 0), 'bench_press': (20, 277, 189, 403, 0), 'bench_nav': (20, 405, 189, 553, 0),
    'crate_grey': (220, 31, 283, 92, 0), 'crate_grey_open': (297, 31, 370, 90, 0), 'crate_brown': (220, 112, 281, 173, 0),
    'crate_brown_big': (299, 107, 368, 174, 0), 'crate_white': (220, 202, 283, 268, 0), 'crate_white_open': (299, 181, 369, 269, 0),
    'crate_brown_small': (223, 286, 280, 344, 0), 'crate_brown_open': (299, 277, 370, 347, 0), 'crate_blue': (223, 357, 283, 414, 0),
    'crate_blue_flat': (304, 357, 371, 415, 0), 'crate_green': (223, 429, 281, 486, 0), 'crate_green_flat': (304, 430, 373, 486, 0),
    'crate_wood': (223, 496, 283, 557, 0), 'crate_purple': (310, 499, 365, 556, 0),
    'holo_sabers': (419, 239, 476, 287, 1), 'holo_globe': (407, 380, 489, 475, 1), 'holo_planet': (416, 495, 479, 544, 1),
    'droid_tall': (517, 23, 582, 131, 0), 'droid_tall_side': (599, 23, 639, 131, 0), 'droid_olive': (524, 452, 573, 551, 0),
    'droid_olive_side': (592, 452, 625, 550, 0),
    'monitor': (683, 30, 755, 89, 0), 'laptop': (768, 27, 825, 94, 0), 'laptop_big': (677, 101, 761, 165, 0), 'terminal': (769, 107, 836, 159, 0),
    'kiosk': (683, 184, 755, 268, 0), 'wall_panel': (772, 185, 826, 266, 0), 'panel_small': (685, 292, 750, 345, 0),
    'panel_tall': (765, 292, 830, 385, 0), 'panel_low': (694, 365, 743, 403, 0),
    'lamp_hang': (697, 425, 735, 483, 0), 'lamp_ceiling': (772, 442, 820, 468, 0), 'lamp_wall': (687, 512, 744, 544, 0), 'lamp_tube': (780, 502, 813, 556, 0),
    'tablet': (858, 31, 891, 70, 0), 'datapad': (902, 32, 949, 68, 0), 'holo_orb': (956, 30, 998, 74, 1), 'datapad2': (856, 89, 894, 131, 0),
    'toolkit': (902, 89, 948, 131, 0), 'tools': (960, 89, 993, 134, 0), 'cell_rack': (852, 157, 895, 201, 1),
    'cell_green': (915, 156, 939, 205, 1), 'cell_blue': (961, 156, 991, 205, 1),
    'sign_maintenance': (850, 364, 918, 398, 0), 'sign_forge_wide': (932, 364, 998, 398, 0), 'sign_forge': (850, 439, 918, 475, 0),
    'sign_mission': (932, 440, 998, 475, 0), 'sign_maintenance_ok': (851, 502, 920, 555, 0), 'planet': (939, 507, 993, 545, 1),
}
BOTTLE_X = [(860, 878), (894, 913), (931, 949), (966, 985)]
for i, (x0, x1) in enumerate(BOTTLE_X):
    P[f'bottle_{i}'] = (x0, 231, x1, 277, 0)
    P[f'bottle_{i + 4}'] = (x0, 296, x1, 339, 0)


# boxes were measured on a 2000-px-wide preview of the 2048-px overlay: correct by 2048/2000
P = {k: (round(v[0] * 1.024), round(v[1] * 1.024), round(v[2] * 1.024), round(v[3] * 1.024), v[4]) for k, v in P.items()}


def fit_bg(a):
    h, w = a.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w] / max(h, w)
    border = np.zeros((h, w), bool); border[:2] = border[-2:] = True; border[:, :2] = border[:, -2:] = True
    X = np.stack([np.ones_like(xx), xx, yy, xx * xx, yy * yy, xx * yy], -1)
    bg = np.zeros_like(a)
    for c in range(3):
        coef, *_ = np.linalg.lstsq(X[border], a[..., c][border], rcond=None)
        bg[..., c] = X @ coef
    return bg


SESSION = None


def solid(a):
    """background-removal model at 3x (cartoon props with ink outlines key cleanly this way)"""
    global SESSION
    from rembg import new_session, remove
    if SESSION is None:
        SESSION = new_session('isnet-general-use')
    im = Image.fromarray(a.astype(np.uint8))
    big = im.resize((im.width * 3, im.height * 3), Image.LANCZOS)
    m = np.asarray(remove(big, session=SESSION, post_process_mask=True).resize(im.size, Image.LANCZOS))[..., 3].astype(float) / 255
    return a, m


BG0 = np.array([34, 37, 49], float)   # the sheet's flat slate background


def flat_key(a):
    """flood the flat slate background (and its slightly lighter grid lines) in from the border;
    the props' dark ink outlines stop the flood"""
    d = a - BG0
    near = (np.abs(d).max(-1) < 13) | ((d.min(-1) > -4) & (d.max(-1) < 22) & (np.ptp(d, -1) < 10))  # bg or grid line
    lab, _ = ndimage.label(near)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    m = ~np.isin(lab, list(edge))
    m = ndimage.binary_opening(m, iterations=1)
    lab2, n = ndimage.label(m)
    if n:
        sizes = ndimage.sum(m, lab2, range(1, n + 1))
        m = np.isin(lab2, [i + 1 for i, s in enumerate(sizes) if s > sizes.max() * 0.03])
    m = ndimage.binary_fill_holes(m)
    alpha = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.5))).astype(float) / 255
    return a, alpha


def solid_key(a):
    bg = fit_bg(a)
    d = np.abs(ndimage.uniform_filter(a, (3, 3, 1)) - bg).max(-1)
    lab, _ = ndimage.label(d < 14)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    m = ~np.isin(lab, list(edge))
    m = ndimage.binary_opening(m, iterations=1)
    lab2, n = ndimage.label(m)
    if n:
        sizes = ndimage.sum(m, lab2, range(1, n + 1))
        m = np.isin(lab2, [i + 1 for i, s in enumerate(sizes) if s > sizes.max() * 0.04])
    m = ndimage.binary_fill_holes(m)
    alpha = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))).astype(float) / 255
    return a, alpha


def glow(a):
    """soft key: alpha from how far a pixel is from the background; un-mix the background colour"""
    bg = np.broadcast_to(BG0, a.shape)
    d = np.abs(a - bg).max(-1)
    alpha = np.clip((d - 10) / 70, 0, 1)
    al = np.maximum(alpha[..., None], 1e-3)
    fg = np.clip((a - bg * (1 - al)) / al, 0, 255)
    return fg, alpha


def main():
    os.makedirs(OUT, exist_ok=True)
    sheet = np.asarray(Image.open(SHEET).convert('RGB')).astype(float)
    for name, (x0, y0, x1, y1, g) in P.items():
        x0, y0, x1, y1 = max(0, x0 - 3), max(0, y0 - 3), min(sheet.shape[1], x1 + 3), min(sheet.shape[0], y1 + 3)
        a = sheet[y0:y1, x0:x1]
        rgb, alpha = (glow if g else flat_key)(a)
        im = Image.fromarray(np.dstack([rgb, alpha * 255]).astype(np.uint8), 'RGBA')
        bb = im.getbbox()
        if bb:
            im = im.crop(bb)
        im.save(os.path.join(OUT, name + '.png'))
    print(len(P), 'props written to', OUT)


main()
