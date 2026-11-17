"""Pose template for the second Trooper action sheet.

Feed the result to your image generator together with the Unit-7 action sheet as the style reference.
Layout: 5 rows on a flat chroma-green background, every figure facing RIGHT, one figure per cell.
Run: python3 -I tools/art/make_sheet_template.py <out.png>
"""
import math
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps

sys.path.insert(0, 'tools/art')
import trooper_puppet as tp  # noqa: E402  (pose maths of the old puppet; only the poses are reused)

OUT = sys.argv[1] if len(sys.argv) > 1 else 'tools/art/source/sheet2_template.png'
W, H = 1536, 1024
GREEN = (0, 177, 64)
COLS = 9
CELL_W = W // COLS
ROW_H = 196
TOP = 44

ROWS = [
    ('RUN (8 frames, loop)', 'run', 8),
    ('IDLE side view, saber ready (4 frames, breathing)', 'idle', 4),
    ('ROLL / dodge (6 frames)', 'roll', 6),
    ('SABER COMBO: 3 swings x 3 frames (wind-up, strike, follow-through) - glowing cyan blade', 'saber', 9),
    ('WALL SLIDE, WALL-JUMP KICK-OFF, AIRBORNE AFTER KICK (3 frames)', 'wall', 3),
]


def silhouette(img):
    a = np.asarray(img)[..., 3] > 0
    out = Image.new('RGBA', img.size)
    arr = np.zeros((*a.shape, 4), np.uint8)
    arr[a] = (215, 215, 222, 255)
    out = Image.fromarray(arr, 'RGBA')
    # dark outline so the pose reads
    from scipy import ndimage
    ring = ndimage.binary_dilation(a, iterations=1) & ~a
    o = np.asarray(out).copy(); o[ring] = (40, 40, 48, 255)
    return Image.fromarray(o, 'RGBA')


def poses(kind):
    if kind == 'run':
        return [tp.pose(p)[0] for p in tp.run()]
    if kind == 'idle':
        return [tp.pose(tp.P(hipY=b, lean=6, tF=18, kF=14, tB=-16, kB=10, aF=40, eF=50, aB=-10, eB=40))[0] for b in (0, 0, 1, 1)]
    if kind == 'roll':
        tuck = tp.P(lean=40, tF=95, kF=140, tB=80, kB=135, aF=60, eF=100, aB=40, eB=90, head=10)
        crouch = tp.P(lean=35, hipY=10, tF=70, kF=110, tB=-10, kB=90, aF=70, eF=40, aB=30, eB=40)
        base = tp.pose(tuck)[0]
        ball = base.crop(base.getbbox())
        out = [tp.pose(crouch)[0]]
        for ang in (-60, -150, -240, -320):
            f = Image.new('RGBA', base.size)
            r = ball.rotate(ang, resample=Image.NEAREST, expand=True)
            f.alpha_composite(r, (int(f.width / 2 - r.width / 2), int(tp.FEET - r.height)))
            out.append(f)
        out.append(tp.pose(tp.P(lean=20, hipY=4, tF=40, kF=60, tB=-20, kB=40, aF=40, eF=60, aB=-20, eB=40))[0])
        return out
    if kind == 'saber':
        s1, s2, s3 = tp.saber()
        return [(tp.pose(p), True) for p in s1 + s2 + s3]
    if kind == 'wall':
        return [tp.pose(p)[0] for p in (
            tp.P(lean=-6, tF=24, kF=44, tB=-4, kB=22, aF=150, eF=20, aB=-20, eB=40, hipY=-2),
            tp.P(lean=-20, tF=-20, kF=10, tB=50, kB=90, aF=-40, eF=40, aB=60, eB=40),
            tp.P(lean=10, hipY=-4, tF=50, kF=85, tB=-12, kB=45, aF=-35, eF=80, aB=40, eB=50))]


def main():
    im = Image.new('RGB', (W, H), GREEN)
    d = ImageDraw.Draw(im)
    try:
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 15)
        big = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 20)
    except OSError:
        font = big = ImageFont.load_default()
    d.text((12, 10), 'UNIT-7 ACTION SHEET 2 - POSE TEMPLATE - all figures face RIGHT - flat green background, no props, no arrows', fill=(255, 255, 255), font=big)
    for r, (label, kind, n) in enumerate(ROWS):
        y0 = TOP + r * ROW_H
        d.line((0, y0, W, y0), fill=(0, 140, 50), width=1)
        for i, p in enumerate(poses(kind)):
            blade = None
            if isinstance(p, tuple):
                (img, hand, ang), blade = p[0], True
            else:
                img = p
            s = silhouette(img)
            SC = 1.75
            s = s.resize((int(s.width * SC), int(s.height * SC)), Image.NEAREST)
            cx = i * CELL_W + CELL_W // 2
            ox, oy = cx - s.width // 2, y0 + ROW_H - s.height - 4
            im.paste(s, (ox, oy), s)
            if blade:
                # blade drawn along the forearm direction from the hand
                hx, hy = ox + hand[0] * SC, oy + hand[1] * SC
                a = math.radians(ang)
                tx, ty = hx + math.sin(a) * 38, hy + math.cos(a) * 38
                d.line((hx, hy, tx, ty), fill=(90, 230, 255), width=5)
                d.line((hx, hy, tx, ty), fill=(240, 255, 255), width=2)
    d = ImageDraw.Draw(im)
    for r, (label, kind, n) in enumerate(ROWS):  # labels last, on a dark strip, so nothing covers them
        y0 = TOP + r * ROW_H
        tw = d.textlength(label, font=font)
        d.rectangle((6, y0 + 2, 18 + tw, y0 + 21), fill=(10, 60, 25))
        d.text((12, y0 + 3), label, fill=(255, 255, 255), font=font)
    im.save(OUT)
    print('template', OUT)


main()
