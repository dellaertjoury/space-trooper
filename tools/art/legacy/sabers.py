"""Hand-built pixel sabers using the blade colours sampled from the weapons sheet."""
import numpy as np
from PIL import Image, ImageEnhance

SHEET = "art/src/weapons_sheet.jpg"
ROWS = {"blue": 155, "red": 350, "green": 545, "purple": 740}
INK = (14, 10, 22, 255)
HILT = [(58, 56, 66, 255), (92, 90, 102, 255), (130, 128, 140, 255)]


def blade_colour(y):
    """Most saturated bright colour in the single-saber panel = the blade glow."""
    a = np.asarray(Image.open(SHEET).convert("RGB").crop((55, y + 4, 213, y + 94))).reshape(-1, 3).astype(float)
    mx, mn = a.max(1), a.min(1)
    sat = (mx - mn) / np.maximum(mx, 1)
    score = sat * (mx > 150)
    top = a[np.argsort(score)[-60:]].mean(0)
    import colorsys
    h, _, _ = colorsys.rgb_to_hsv(*(top / 255))
    return tuple(int(v * 255) for v in colorsys.hsv_to_rgb(h, 0.85, 1.0))


def lighten(c, t):
    return tuple(int(v + (255 - v) * t) for v in c[:3]) + (255,)


def saber(col, length=15, hilt=6):
    """Diagonal (45 deg) saber: pommel bottom-left, tip top-right."""
    n = hilt + length + 2
    im = Image.new("RGBA", (n + 3, n + 3), (0, 0, 0, 0))
    p = im.load()
    for i in range(n):
        x, y = i + 1, n - i
        if i < hilt:                                   # hilt: 2px thick, shaded
            p[x, y] = HILT[1]; p[x + 1, y] = HILT[0]; p[x, y - 1] = HILT[2] if i % 3 else HILT[0]
            if i == 0:
                p[x, y] = col + (255,) if len(col) == 3 else col   # pommel crystal
        elif i == hilt:                                # crossguard
            p[x, y] = lighten(col, 0.3); p[x + 1, y] = HILT[0]; p[x, y - 1] = HILT[2]
            p[x - 1, y - 1] = HILT[2]; p[x + 1, y + 1] = HILT[1]
        else:                                          # blade: white core, coloured edges
            p[x, y] = lighten(col, 0.9)
            p[x + 1, y] = col + (255,)
            p[x, y - 1] = lighten(col, 0.5)
            p[x + 1, y + 1] = col + (255,) if i < n - 2 else (0, 0, 0, 0)
            if i == n - 1:
                p[x + 1, y] = (0, 0, 0, 0)
    return despeckle(outline(im))


def outline(im):
    a = np.asarray(im).copy()
    s = a[..., 3] > 0
    ring = np.zeros_like(s)
    for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
        ring |= np.roll(np.roll(s, dy, 0), dx, 1)
    ring &= ~s
    a[ring] = INK
    return Image.fromarray(a, "RGBA")


def dual(col):
    a = saber(col, 14, 6)
    b = saber(col, 14, 6)
    out = Image.new("RGBA", (a.width + 5, a.height + 5), (0, 0, 0, 0))
    out.alpha_composite(b, (0, 0)); out.alpha_composite(a, (5, 5))
    return despeckle(out)


def despeckle(im):
    a = np.asarray(im).copy()
    s = np.pad(a[..., 3] > 0, 1)
    nb = sum(np.roll(np.roll(s, dy, 0), dx, 1) for dy in (-1, 0, 1) for dx in (-1, 0, 1)) - s
    lonely = (s & (nb == 0))[1:-1, 1:-1]
    a[lonely] = 0
    return Image.fromarray(a, "RGBA")


if __name__ == "__main__":
    for name, y in ROWS.items():
        c = blade_colour(y)
        saber(c).save(f"art/out/items/saber_{name}.png")
        dual(c).save(f"art/out/items/dualsaber_{name}.png")
        print(name, c)
    # brighten the dark hard-surface items so they read on dark backgrounds
    for n, k in (("blaster_heavy", 1.7), ("blaster_pistols", 1.7), ("chest", 1.25)):
        im = Image.open(f"art/out/items/{n}.png")
        rgb = ImageEnhance.Brightness(im.convert("RGB")).enhance(k)
        rgb = ImageEnhance.Contrast(rgb).enhance(1.2)
        a = np.asarray(im)[..., 3]
        arr = np.dstack([np.asarray(rgb), a])
        ink = np.all(np.asarray(im)[..., :3] == (14, 10, 22), -1)
        arr[ink, :3] = (14, 10, 22)
        Image.fromarray(arr.astype(np.uint8), "RGBA").save(f"art/out/items/{n}.png")
