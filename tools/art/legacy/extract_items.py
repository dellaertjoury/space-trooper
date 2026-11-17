"""Cut weapons and UI icons out of the reference sheets and pixelate them."""
import numpy as np
from PIL import Image
from rembg import remove, new_session
import pixelate as px

SESSION = new_session("isnet-general-use")

# (sheet, box in sheet pixels, target size, fit-by) ; fit-by 'w' or 'h'
W = "art/src/weapons_sheet.jpg"
U = "art/src/ui_sheet.jpg"
ROWS = {"blue": 155, "red": 350, "green": 545, "purple": 740}
ITEMS = {}
for colour, y in ROWS.items():
    ITEMS[f"saber_{colour}"] = (W, (55, y + 4, 213, y + 94), 30, "w")
    ITEMS[f"dualsaber_{colour}"] = (W, (245, y + 4, 403, y + 94), 30, "w")
    ITEMS[f"staff_{colour}"] = (W, (435, y + 38, 594, y + 72), 46, "w")
ITEMS.update({
    "blaster_heavy": (W, (56, 1106, 314, 1218), 30, "w"),
    "blaster_pistols": (W, (349, 1106, 590, 1218), 28, "w"),
    "icon_crystal_purple": (U, (418, 547, 462, 598), 14, "h"),
    "icon_crystal_blue": (U, (487, 547, 519, 598), 14, "h"),
    "icon_credit": (U, (543, 548, 590, 590), 12, "h"),
    "icon_droidpart": (U, (623, 548, 666, 590), 12, "h"),
    "icon_ingot": (U, (690, 550, 745, 590), 11, "h"),
    "icon_health": (U, (425, 678, 486, 736), 13, "h"),
    "chest": (U, (338, 333, 447, 407), 26, "w"),
})


from scipy import ndimage

SOLID = {"blaster_heavy", "blaster_pistols", "icon_credit", "icon_ingot", "icon_health", "chest"}


def key(crop):
    """Key out a smooth gradient panel: fit a quadratic surface to the border."""
    a = np.asarray(crop).astype(np.float32)
    h, w = a.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w] / max(h, w)
    border = np.zeros((h, w), bool); b = 3
    border[:b] = border[-b:] = True; border[:, :b] = border[:, -b:] = True
    X = np.stack([np.ones_like(xx), xx, yy, xx * xx, yy * yy, xx * yy], -1)
    bg = np.zeros_like(a)
    for c in range(3):
        coef, *_ = np.linalg.lstsq(X[border], a[..., c][border], rcond=None)
        bg[..., c] = X @ coef
    dist = np.abs(a - bg).max(-1)
    alpha = np.clip((dist - 14) / 34, 0, 1)
    hard = ndimage.binary_opening(alpha > 0.35, iterations=1)
    lab, n = ndimage.label(hard)
    if n:
        sizes = ndimage.sum(hard, lab, range(1, n + 1))
        hard = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s > sizes.max() * 0.04])
    alpha = alpha * ndimage.binary_dilation(hard, iterations=2)
    # un-mix the background from semi-transparent (glow) pixels
    al = np.maximum(alpha[..., None], 1e-3)
    fg = np.clip((a - bg * (1 - al)) / al, 0, 255)
    return Image.fromarray(np.dstack([fg, alpha * 255]).astype(np.uint8), "RGBA")


def cut(name, sheet, box):
    crop = Image.open(sheet).convert("RGB").crop(box)
    big = crop.resize((crop.width * 4, crop.height * 4), Image.LANCZOS)
    if name in SOLID:
        out = remove(big, session=SESSION, post_process_mask=True)
        m = ndimage.binary_fill_holes(np.asarray(out)[..., 3] > 128)
        arr = np.asarray(out).copy(); arr[..., 3] = m * 255; arr[..., :3] = np.asarray(big)
        out = Image.fromarray(arr, "RGBA")
    else:
        out = key(big)
    return out.crop(out.getbbox())


GLOW = lambda n: n.startswith(("saber", "dualsaber", "staff", "icon_crystal"))


def pixelate(name, im, size, fit, colours=14):
    h = size if fit == "h" else max(1, round(im.height * size / im.width))
    im = px.grade_v2(im)
    pal = px.palette_from([im], colours)
    # glowing items: keep only the solid core (glow is added by the engine)
    a_cut, cover = (215, 0.30) if GLOW(name) else (128, 0.42)
    small = px.downscale_mode(im, h, pal, bright_w=0.0, a_cut=a_cut, cover=cover)
    return px.rim_v2(small, strength=0.0 if GLOW(name) else 0.3)


if __name__ == "__main__":
    for name, (sheet, box, size, fit) in ITEMS.items():
        c = cut(name, sheet, box)
        c.save(f"art/out/items/{name}_cutout.png")
        pixelate(name, c, size, fit).save(f"art/out/items/{name}.png")
        print(name, "ok")
