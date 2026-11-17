"""Convert painted character art into Dead Cells-style pixel sprites.

Steps: remove flat background -> crop -> colour grade (saturation/contrast)
-> downscale to target height -> palette quantise -> dark outline -> rim light.
"""
import sys
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter
from scipy import ndimage

SRC = "art/src"
OUT = "art/out"
NAMES = ["vanguard", "raider_club", "raider_rifle"]
OUTLINE = np.array([14, 10, 22], dtype=np.uint8)  # very dark violet, not pure black
RIM_WARM = np.array([255, 196, 120], dtype=np.float32)
RIM_COOL = np.array([90, 220, 255], dtype=np.float32)


def cutout(im: Image.Image) -> Image.Image:
    a = np.asarray(im.convert("RGB")).astype(np.int16)
    border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    bg = np.median(border, axis=0)
    near = np.abs(a - bg).max(axis=2) < 16
    lab, _ = ndimage.label(near)
    edge_labels = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bgmask = np.isin(lab, list(edge_labels))
    fg = ~bgmask
    # keep the biggest blobs (character + weapon), drop specks
    flab, n = ndimage.label(fg)
    sizes = ndimage.sum(fg, flab, range(1, n + 1))
    keep = [i + 1 for i, s in enumerate(sizes) if s > 400]
    fg = np.isin(flab, keep)
    fg = ndimage.binary_fill_holes(fg) & ~(bgmask & ~ndimage.binary_fill_holes(fg))
    rgba = np.dstack([a.astype(np.uint8), (fg * 255).astype(np.uint8)])
    out = Image.fromarray(rgba, "RGBA")
    return out.crop(out.getbbox())


def grade(im: Image.Image) -> Image.Image:
    rgb, alpha = im.convert("RGB"), im.getchannel("A")
    rgb = ImageEnhance.Color(rgb).enhance(1.55)
    rgb = ImageEnhance.Contrast(rgb).enhance(1.25)
    rgb = ImageEnhance.Brightness(rgb).enhance(1.08)
    rgb.putalpha(alpha)
    return rgb


def downscale(im: Image.Image, h: int) -> Image.Image:
    w = max(1, round(im.width * h / im.height))
    # premultiply to avoid dark fringes from the outline/background
    a = np.asarray(im).astype(np.float32) / 255
    pm = a.copy(); pm[..., :3] *= pm[..., 3:4]
    small = np.asarray(Image.fromarray((pm * 255).astype(np.uint8), "RGBA").resize((w, h), Image.BOX)).astype(np.float32) / 255
    al = small[..., 3:4]
    rgb = np.where(al > 0, small[..., :3] / np.maximum(al, 1e-6), 0)
    mask = al[..., 0] > 0.45
    out = np.dstack([(np.clip(rgb, 0, 1) * 255).astype(np.uint8), (mask * 255).astype(np.uint8)])
    return Image.fromarray(out, "RGBA")


def quantise(im: Image.Image, colours: int) -> Image.Image:
    alpha = np.asarray(im.getchannel("A"))
    q = im.convert("RGB").quantize(colours, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGB")
    return Image.fromarray(np.dstack([np.asarray(q), alpha]), "RGBA")


def outline_and_rim(im: Image.Image) -> Image.Image:
    a = np.asarray(im).copy()
    solid = a[..., 3] > 0
    # 1. rim light on interior edge pixels: warm from upper-left, cool from right
    up_l = solid & ~np.roll(solid, 1, axis=1)          # transparent to the left
    up_t = solid & ~np.roll(solid, 1, axis=0)          # transparent above
    right = solid & ~np.roll(solid, -1, axis=1)        # transparent to the right
    rgb = a[..., :3].astype(np.float32)
    warm = (up_l | up_t) & ~right
    rgb[warm] = rgb[warm] * 0.45 + RIM_WARM * 0.55
    rgb[right] = rgb[right] * 0.40 + RIM_COOL * 0.60
    a[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    # 2. 1px dark outline outside the silhouette
    pad = np.pad(a, ((1, 1), (1, 1), (0, 0)))
    s = pad[..., 3] > 0
    grow = ndimage.binary_dilation(s, structure=np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]]))
    ring = grow & ~s
    pad[ring, :3] = OUTLINE
    pad[ring, 3] = 255
    return Image.fromarray(pad, "RGBA")


def make(name: str, h: int, colours: int = 20) -> Image.Image:
    im = cutout(Image.open(f"{SRC}/{name}.png"))
    im = grade(im)
    im = downscale(im, h)
    im = quantise(im, colours)
    return outline_and_rim(im)


if __name__ == "__main__":
    heights = [int(x) for x in sys.argv[1:]] or [48, 64, 96]
    for n in NAMES:
        cutout(Image.open(f"{SRC}/{n}.png")).save(f"{OUT}/{n}_cutout.png")
        for h in heights:
            make(n, h).save(f"{OUT}/{n}_{h}px.png")
    print("done")


# ---------- v2: palette-first, dominant-colour downscale ----------
def palette_from(images, colours=32):
    """Shared palette across a set of RGBA images (median cut on opaque pixels)."""
    px_ = np.concatenate([np.asarray(i)[np.asarray(i)[..., 3] > 128][:, :3] for i in images])
    strip = Image.fromarray(px_[None, :, :])
    return strip.quantize(colours, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)


def downscale_mode(im: Image.Image, h: int, pal_img, dark_w=0.55, bright_w=2.6, a_cut=128, cover=0.42) -> Image.Image:
    a = np.asarray(im)
    alpha = a[..., 3] > a_cut
    idx = np.asarray(im.convert("RGB").quantize(palette=pal_img, dither=Image.Dither.NONE))
    pal = np.array(pal_img.getpalette()[: 3 * 256]).reshape(-1, 3)
    lum = pal @ np.array([0.299, 0.587, 0.114])
    wt = np.where(lum < 40, dark_w, 1.0)
    H, W = idx.shape
    w = max(1, round(W * h / H))
    ys = np.linspace(0, H, h + 1).astype(int); xs = np.linspace(0, W, w + 1).astype(int)
    out = np.zeros((h, w, 4), np.uint8)
    for j in range(h):
        for i in range(w):
            blk_a = alpha[ys[j]:ys[j + 1], xs[i]:xs[i + 1]]
            if blk_a.mean() < cover:
                continue
            blk = idx[ys[j]:ys[j + 1], xs[i]:xs[i + 1]][blk_a]
            # base weight, plus a boost for colours much brighter than the block (eyes, glints)
            med = np.median(lum[blk])
            boost = 1 + bright_w * 2 * ((lum > 175) & (lum - med > 80))
            score = np.bincount(blk, minlength=len(pal))[: len(pal)] * wt * boost
            out[j, i, :3] = pal[np.argmax(score)]
            out[j, i, 3] = 255
    return Image.fromarray(out, "RGBA")


def rim_v2(im: Image.Image, strength=0.38) -> Image.Image:
    a = np.asarray(im).copy()
    s = a[..., 3] > 0
    right_edge = s & ~np.roll(s, -1, 1) & np.roll(s, 1, 1)          # thick enough
    top_edge = s & ~np.roll(s, 1, 0) & np.roll(s, -1, 0)
    rgb = a[..., :3].astype(np.float32)
    rgb[right_edge] = rgb[right_edge] * (1 - strength) + RIM_COOL * strength
    rgb[top_edge & ~right_edge] = rgb[top_edge & ~right_edge] * 0.75 + RIM_WARM * 0.25
    a[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    pad = np.pad(a, ((1, 1), (1, 1), (0, 0)))
    sp = pad[..., 3] > 0
    ring = ndimage.binary_dilation(sp, structure=np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]])) & ~sp
    pad[ring, :3] = OUTLINE; pad[ring, 3] = 255
    return Image.fromarray(pad, "RGBA")


def grade_v2(im):
    rgb, alpha = im.convert("RGB"), im.getchannel("A")
    rgb = ImageEnhance.Color(rgb).enhance(1.3)
    rgb = ImageEnhance.Contrast(rgb).enhance(1.15)
    rgb.putalpha(alpha)
    return rgb


def trim_fringe(im, px_=5, band=18):
    """Drop the red/blue chromatic-offset fringe the source art has on its silhouette."""
    a = np.asarray(im).copy()
    solid = a[..., 3] > 128
    near_edge = solid & ~ndimage.binary_erosion(solid, iterations=band)
    r, g, b = [a[..., k].astype(int) for k in range(3)]
    red = (r > 120) & (r > g * 3.2) & (r > b * 2.5)
    blue = (b > 120) & (b > r * 1.8) & (b > g * 1.2)
    a[near_edge & (red | blue), :3] = 12      # turn fringe into outline ink
    m = ndimage.binary_erosion(solid, iterations=px_)
    a[..., 3] = m * 255
    return Image.fromarray(a, "RGBA")


def make_v2(images: dict, heights, colours=32, fringe=5):
    graded = {n: grade_v2(trim_fringe(i, fringe) if fringe else i) for n, i in images.items()}
    pal = palette_from(list(graded.values()), colours)
    return {(n, h): rim_v2(downscale_mode(g, h, pal)) for n, g in graded.items() for h in heights}, pal
