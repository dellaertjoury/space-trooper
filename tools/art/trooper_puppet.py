"""Space Trooper pixel puppet: side-view animation frames generated from posed body parts.

Stand-in until the 3D-model pipeline replaces it. Palette taken from the Vanguard art.
Writes public/assets/trooper.png (sprite sheet) + trooper.json (frames, anims, hand anchors).

Conventions: frame 96x96, character faces RIGHT, feet on y=FEET.
Limb angles in degrees from straight down; positive = swings forward (+x).
"""
import json
import math
import os
import sys
import numpy as np
from PIL import Image, ImageDraw

OUT = sys.argv[1] if len(sys.argv) > 1 else "public/assets"
FW = FH = 96
FEET = 90
INK = (20, 14, 30, 255)

# palette (from the Vanguard sprite)
C = {
    "white": (238, 236, 226, 255), "white2": (196, 196, 206, 255), "white3": (140, 142, 160, 255),
    "suit": (38, 34, 46, 255), "suit2": (58, 54, 72, 255), "suit3": (84, 80, 100, 255),
    "orange": (236, 112, 52, 255), "orange2": (178, 70, 40, 255),
    "belt": (104, 72, 52, 255), "belt2": (70, 48, 36, 255), "buckle": (190, 186, 170, 255),
    "skin": (226, 168, 128, 255), "skin2": (180, 120, 92, 255),
    "hair": (26, 22, 34, 255), "hair2": (48, 44, 70, 255), "hairred": (210, 50, 60, 255),
    "eye": (70, 200, 255, 255),
}

L_THIGH, L_SHIN, L_TORSO, L_UPPER, L_FORE = 18, 19, 22, 14, 13


# ------------------------------------------------------------------ parts (drawn hanging DOWN from pivot at top-centre)
def part(w, h, draw_fn):
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw_fn(ImageDraw.Draw(im), w, h)
    return im


def thigh(front):
    def f(d, w, h):
        d.rectangle((1, 0, w - 2, h - 1), fill=C["suit"] if front else C["suit2"])
        d.rectangle((w - 4, 2, w - 2, h - 3), fill=C["suit2"] if front else C["suit3"])
        # white knee-guard plate at the bottom
        d.rectangle((1, h - 6, w - 1, h - 1), fill=C["white"] if front else C["white2"])
        d.line((1, h - 6, w - 1, h - 6), fill=C["white2"] if front else C["white3"])
    return part(9, L_THIGH + 2, f)


def shin(front):
    def f(d, w, h):
        d.rectangle((1, 0, w - 3, h - 7), fill=C["suit"] if front else C["suit2"])
        d.rectangle((1, 4, w - 3, h - 7), fill=C["white2"] if front else C["white3"])  # shin guard
        d.rectangle((2, 4, w - 4, h - 9), fill=C["white"] if front else C["white2"])
        # boot (points forward = +x)
        d.rectangle((0, h - 7, w - 1, h - 1), fill=C["white"] if front else C["white2"])
        d.rectangle((0, h - 2, w - 1, h - 1), fill=C["white3"])
        d.rectangle((1, h - 6, 3, h - 5), fill=C["suit2"])  # strap
    return part(12, L_SHIN + 2, f)


def upper_arm(front):
    def f(d, w, h):
        d.rectangle((1, 0, w - 2, h - 1), fill=C["suit"] if front else C["suit2"])
        d.rectangle((w - 3, 1, w - 2, h - 2), fill=C["suit3"] if front else C["suit2"])
    return part(7, L_UPPER + 2, f)


def fore_arm(front):
    def f(d, w, h):
        d.rectangle((1, 0, w - 2, h - 4), fill=C["white"] if front else C["white2"])  # bracer
        d.line((1, 3, w - 2, 3), fill=C["white3"])
        d.rectangle((1, h - 4, w - 2, h - 1), fill=C["suit"])  # glove
    return part(7, L_FORE + 3, f)


def torso():
    def f(d, w, h):
        # undersuit
        d.rectangle((2, 0, w - 3, h - 1), fill=C["suit"])
        # white chest plate (front = right side)
        d.polygon([(4, 3), (w - 2, 2), (w - 1, 12), (w - 3, 15), (5, 15)], fill=C["white"])
        d.line((5, 15, w - 3, 15), fill=C["white3"])
        d.line((w - 7, 4, w - 7, 13), fill=C["white2"])
        # back plate
        d.rectangle((1, 3, 4, 14), fill=C["white2"])
        # belt
        d.rectangle((2, h - 6, w - 2, h - 3), fill=C["belt"])
        d.rectangle((w - 7, h - 6, w - 4, h - 3), fill=C["buckle"])
        d.line((2, h - 3, w - 2, h - 3), fill=C["belt2"])
    return part(16, L_TORSO + 2, f)


def shoulder():
    def f(d, w, h):
        d.polygon([(0, 2), (w - 1, 0), (w - 1, h - 3), (2, h - 1)], fill=C["orange"])
        d.line((2, h - 1, w - 1, h - 3), fill=C["orange2"])
    return part(9, 7, f)


def head():
    def f(d, w, h):
        # face (side view, facing right)
        d.rectangle((4, 6, w - 3, h - 3), fill=C["skin"])
        d.rectangle((w - 3, 10, w - 2, 12), fill=C["skin"])      # nose
        d.rectangle((4, h - 4, w - 5, h - 2), fill=C["skin2"])   # jaw shade
        d.rectangle((w - 6, 9, w - 5, 9), fill=C["hair"])         # brow
        d.point((w - 5, 10), fill=C["eye"])
        # spiky hair, swept back
        d.polygon([(2, 9), (3, 3), (7, 0), (13, 1), (w - 2, 5), (w - 4, 7), (8, 6), (5, 10)], fill=C["hair"])
        d.polygon([(0, 2), (5, 1), (3, 6)], fill=C["hair"])
        d.polygon([(4, 0), (9, -1), (8, 3)], fill=C["hairred"])
        d.line((6, 2, 12, 2), fill=C["hair2"])
        # collar
        d.rectangle((3, h - 2, 9, h - 1), fill=C["white"])
    return part(15, 18, f)


PARTS = {
    "thighF": thigh(True), "thighB": thigh(False), "shinF": shin(True), "shinB": shin(False),
    "upperF": upper_arm(True), "upperB": upper_arm(False), "foreF": fore_arm(True), "foreB": fore_arm(False),
    "torso": torso(), "shoulder": shoulder(), "head": head(),
}


# ------------------------------------------------------------------ posing
def rot_paste(canvas, img, pivot, angle_deg, pivot_in=None):
    """Paste img rotated by angle (deg, + = forward/counter-clockwise when hanging down) around its pivot."""
    pw, ph = img.size
    px, py = pivot_in if pivot_in else (pw / 2, 1)
    big = Image.new("RGBA", (pw * 4, ph * 4), (0, 0, 0, 0))
    ox, oy = pw * 2 - px, ph * 2 - py
    big.paste(img, (int(round(ox)), int(round(oy))), img)
    r = big.rotate(angle_deg, resample=Image.NEAREST, center=(pw * 2, ph * 2))
    canvas.alpha_composite(r, (int(round(pivot[0] - pw * 2)), int(round(pivot[1] - ph * 2))))


def end_point(p, length, angle):
    a = math.radians(angle)
    return (p[0] + math.sin(a) * length, p[1] + math.cos(a) * length)


def pose(p):
    """p: dict with keys hipY, lean, tF,kF,tB,kB (thigh / knee rel), aF,eF,aB,eB (shoulder / elbow rel), head."""
    cv = Image.new("RGBA", (FW, FH), (0, 0, 0, 0))
    hip = (FW / 2 + p.get("dx", 0), FEET - L_THIGH - L_SHIN + p.get("hipY", 0))
    lean = p.get("lean", 0)
    neck = end_point(hip, L_TORSO, 180 - lean)  # torso points up
    sh = end_point(hip, L_TORSO - 5, 180 - lean)

    def leg(front):
        t = p["tF" if front else "tB"]; k = p["kF" if front else "kB"]
        knee = end_point(hip, L_THIGH, t)
        rot_paste(cv, PARTS["shinF" if front else "shinB"], knee, t - k, (4, 1))
        rot_paste(cv, PARTS["thighF" if front else "thighB"], hip, t, (4, 1))

    def arm(front):
        a = p["aF" if front else "aB"]; e = p["eF" if front else "eB"]
        elbow = end_point(sh, L_UPPER, a)
        rot_paste(cv, PARTS["foreF" if front else "foreB"], elbow, a + e, (3, 1))
        rot_paste(cv, PARTS["upperF" if front else "upperB"], sh, a, (3, 1))
        return end_point(elbow, L_FORE, a + e), a + e

    arm(False)
    leg(False)
    rot_paste(cv, PARTS["torso"], hip, 180 - lean, (8, 1))
    # torso is drawn hanging down from the hip and rotated 180, so mirror it to keep the chest in front
    leg(True)
    rot_paste(cv, PARTS["head"], neck, p.get("head", 0) - lean * 0.5, (7, 16))
    hand, hand_ang = arm(True)
    rot_paste(cv, PARTS["shoulder"], (sh[0] - 1, sh[1] + 2), p["aF"] * 0.4, (4, 1))
    return cv, hand, hand_ang


# The torso image hangs downward; rotating by 180-lean flips it, which would put the chest at the back.
# Pre-mirror it so the chest ends up facing right after the 180 rotation.
PARTS["torso"] = PARTS["torso"].rotate(180)


def finish(cv):
    """1px outline + cool rim on the back edge."""
    a = np.asarray(cv).copy()
    a[:1] = 0; a[-1:] = 0; a[:, :1] = 0; a[:, -1:] = 0   # keep a clear border so rolls never wrap
    s = a[..., 3] > 0
    # rim light on the left (back) silhouette edge, subtle
    back = s & ~np.roll(s, 1, 1)
    rgb = a[..., :3].astype(float)
    rgb[back] = rgb[back] * 0.55 + np.array([110, 200, 255]) * 0.45
    a[..., :3] = rgb.astype(np.uint8)
    ring = np.zeros_like(s)
    for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
        ring |= np.roll(np.roll(s, dy, 0), dx, 1)
    ring &= ~s
    a[ring] = INK
    return Image.fromarray(a, "RGBA")


# ------------------------------------------------------------------ animations
BASE = dict(hipY=0, lean=4, tF=6, kF=6, tB=-6, kB=4, aF=10, eF=40, aB=-10, eB=30, head=0)


def P(**kw):
    d = dict(BASE); d.update(kw); return d


def idle():
    return [P(hipY=b, aF=10 + b * 2, aB=-10 - b) for b in (0, 0, 1, 1)]


def run():
    fr = []
    for i in range(8):
        ph = i / 8 * 2 * math.pi
        s, c = math.sin(ph), math.cos(ph)
        fr.append(P(lean=14, hipY=-1 - round(abs(c) * 2),
                    tF=34 * s, kF=8 + 55 * max(0, -c) if s < 0 else 8 + 18 * max(0, c),
                    tB=-34 * s, kB=8 + 55 * max(0, c) if s > 0 else 8 + 18 * max(0, -c),
                    aF=-32 * s, eF=60, aB=32 * s, eB=60, head=-4))
    return fr


def jump():
    return [P(lean=6, hipY=-4, tF=40, kF=70, tB=-10, kB=40, aF=-30, eF=80, aB=30, eB=50),
            P(lean=4, hipY=-4, tF=30, kF=60, tB=0, kB=50, aF=-60, eF=70, aB=50, eB=40)]


def fall():
    return [P(lean=0, hipY=-2, tF=20, kF=20, tB=-14, kB=30, aF=70, eF=40, aB=-60, eB=30),
            P(lean=0, hipY=-2, tF=24, kF=24, tB=-10, kB=34, aF=80, eF=36, aB=-70, eB=24)]


def land():
    return [P(lean=12, hipY=7, tF=50, kF=95, tB=-20, kB=70, aF=30, eF=60, aB=-20, eB=40),
            P(lean=8, hipY=3, tF=30, kF=50, tB=-14, kB=40, aF=20, eF=50, aB=-14, eB=34)]


def roll():
    tuck = P(lean=40, hipY=0, tF=95, kF=140, tB=80, kB=135, aF=60, eF=100, aB=40, eB=90, head=10)
    base, _, _ = pose(tuck)
    x0, y0, x1, y1 = base.getbbox()
    ball = base.crop((x0, y0, x1, y1))
    fr = []
    for i in range(8):
        r = ball.rotate(-i * 45, resample=Image.NEAREST, expand=True)
        f = Image.new("RGBA", (FW, FH))
        f.alpha_composite(r, (int(FW / 2 - r.width / 2), int(FEET - r.height)))  # rests on the floor
        fr.append((f, (FW / 2 + 8, FEET - 20), 0))
    return fr


def wallslide():
    # back against the wall is on the RIGHT (facing away, i.e. the sprite faces left in-engine via flip)
    return [P(lean=-6, tF=20, kF=40, tB=-4, kB=20, aF=150, eF=20, aB=-20, eB=40, hipY=-2),
            P(lean=-6, tF=22, kF=42, tB=-2, kB=22, aF=152, eF=18, aB=-22, eB=42, hipY=-2)]


def ledge():
    hang = P(lean=-4, hipY=0, tF=8, kF=10, tB=-4, kB=16, aF=170, eF=0, aB=164, eB=0, head=-8)
    climb = [P(lean=20, hipY=2, tF=60, kF=90, tB=10, kB=60, aF=160, eF=-20, aB=150, eB=-10),
             P(lean=30, hipY=6, tF=90, kF=120, tB=40, kB=100, aF=120, eF=-40, aB=110, eB=-30),
             P(lean=24, hipY=4, tF=70, kF=110, tB=20, kB=90, aF=40, eF=30, aB=10, eB=20)]
    return [hang], climb


def saber():
    """three swings; hand anchors are used to place the blade"""
    s1 = [P(lean=-4, tF=14, kF=10, tB=-14, kB=10, aF=-150, eF=-20, aB=-20, eB=30),   # wind up (blade back over shoulder)
          P(lean=14, tF=26, kF=20, tB=-20, kB=10, aF=80, eF=10, aB=-30, eB=40),      # strike
          P(lean=16, tF=28, kF=24, tB=-22, kB=12, aF=30, eF=30, aB=-30, eB=40)]      # follow-through
    s2 = [P(lean=10, tF=24, kF=16, tB=-20, kB=10, aF=30, eF=40, aB=-20, eB=30),
          P(lean=6, tF=20, kF=14, tB=-18, kB=10, aF=140, eF=10, aB=-30, eB=30),      # rising slash
          P(lean=2, tF=18, kF=12, tB=-16, kB=10, aF=170, eF=-10, aB=-30, eB=30)]
    s3 = [P(lean=-8, hipY=-2, tF=10, kF=20, tB=-10, kB=20, aF=175, eF=0, aB=150, eB=0),  # overhead
          P(lean=24, hipY=4, tF=44, kF=60, tB=-30, kB=20, aF=70, eF=0, aB=50, eB=20),   # slam
          P(lean=22, hipY=5, tF=46, kF=64, tB=-30, kB=20, aF=50, eF=10, aB=40, eB=20)]
    return s1, s2, s3


def shoot():
    return [P(lean=2, aF=90, eF=0, aB=-14, eB=40), P(lean=0, aF=96, eF=-6, aB=-16, eB=40, dx=-1)]


def hurt():
    return [P(lean=-16, hipY=1, tF=16, kF=20, tB=-16, kB=10, aF=-40, eF=60, aB=-50, eB=40, head=-14)]


def death():
    seq = [P(lean=-20, hipY=2, tF=20, kF=30, tB=-10, kB=20, aF=-50, eF=40, aB=-60, eB=40, head=-14),
           P(lean=-50, hipY=10, tF=50, kF=80, tB=30, kB=70, aF=-80, eF=20, aB=-90, eB=20, head=-20)]
    fr = [pose(s) for s in seq]
    lie = Image.new("RGBA", (FW, FH))
    body = fr[1][0].crop(fr[1][0].getbbox()).rotate(75, resample=Image.NEAREST, expand=True)
    lie.alpha_composite(body, (int(FW / 2 - body.width / 2), FEET - body.height))
    return fr + [(lie, (30, FEET - 4), 0)]


# ------------------------------------------------------------------ assemble sheet
def build():
    anims = {}
    frames = []

    def add(name, poses, fps, loop=True):
        idx = []
        for p in poses:
            if isinstance(p, tuple):
                im, hand, ang = p
            else:
                im, hand, ang = pose(p)
            frames.append((finish(im), hand, ang))
            idx.append(len(frames) - 1)
        anims[name] = {"frames": idx, "fps": fps, "loop": loop}

    add("idle", idle(), 6)
    add("run", run(), 14)
    add("jump", jump(), 8, False)
    add("fall", fall(), 8)
    add("land", land(), 16, False)
    add("roll", roll(), 20, False)
    add("wallslide", wallslide(), 6)
    hang, climb = ledge()
    add("ledgehang", hang, 1)
    add("climb", climb, 12, False)
    s1, s2, s3 = saber()
    add("saber1", s1, 18, False)
    add("saber2", s2, 18, False)
    add("saber3", s3, 14, False)
    add("shoot", shoot(), 16, False)
    add("hurt", hurt(), 1, False)
    add("death", death(), 6, False)

    cols = 8
    rows = math.ceil(len(frames) / cols)
    sheet = Image.new("RGBA", (cols * FW, rows * FH), (0, 0, 0, 0))
    meta = []
    for i, (im, hand, ang) in enumerate(frames):
        x, y = (i % cols) * FW, (i // cols) * FH
        sheet.alpha_composite(im, (x, y))
        meta.append({"x": x, "y": y, "hand": [round(hand[0], 1), round(hand[1], 1)], "handAngle": round(ang, 1)})
    os.makedirs(OUT, exist_ok=True)
    sheet.save(f"{OUT}/trooper.png")
    json.dump({"frameWidth": FW, "frameHeight": FH, "feetY": FEET, "frames": meta, "anims": anims},
              open(f"{OUT}/trooper.json", "w"), indent=1)
    return sheet, len(frames)


if __name__ == "__main__":
    sheet, n = build()
    print("frames", n, sheet.size)
