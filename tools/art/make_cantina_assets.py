"""Images for the Cantina hub and its station panels (smooth comic style, no pixelation).

Run: python3 -I tools/art/make_cantina_assets.py <art_dir> <out_dir>
  art_dir holds the source art: vanguard.png, raider_club_cutout.png, raider_rifle_cutout.png,
  and weapon cut-outs from the weapons sheet (saber_<colour>_cutout.png, staff_<colour>_cutout.png).
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ART, OUT = sys.argv[1], sys.argv[2]
INK = (20, 14, 30, 255)


def key_dark(im, thr=16):
    """Remove the flat dark background of the character renders."""
    a = np.asarray(im.convert('RGB')).astype(int)
    bg = np.median(np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]]), axis=0)
    m = np.abs(a - bg).max(-1) > thr
    out = im.convert('RGBA'); arr = np.asarray(out).copy(); arr[..., 3] = (m * 255).astype(np.uint8)
    out = Image.fromarray(arr, 'RGBA').filter(ImageFilter.SMOOTH)
    return out.crop(out.getbbox())


def fit(im, w=None, h=None):
    if w and (not h or im.width / w > im.height / h):
        return im.resize((w, max(1, round(im.height * w / im.width))), Image.LANCZOS)
    return im.resize((max(1, round(im.width * h / im.height)), h), Image.LANCZOS)


def droid(kind, size=200):
    """Comic-style companion droids: bold outline, flat shading, one highlight."""
    S = 3
    W = H = size * S
    im = Image.new('RGBA', (W, H)); d = ImageDraw.Draw(im)
    o = 6 * S
    if kind == 'turret':
        body, shade, accent = (196, 200, 214, 255), (128, 134, 156, 255), (255, 120, 60, 255)
        d.ellipse((50*S, 50*S, 150*S, 140*S), fill=INK)
        d.ellipse((50*S + o, 50*S + o, 150*S - o, 140*S - o), fill=body)
        d.chord((50*S + o, 50*S + o, 150*S - o, 140*S - o), 20, 160, fill=shade)
        d.rectangle((120*S, 84*S, 186*S, 104*S), fill=INK); d.rectangle((124*S, 88*S, 182*S, 100*S), fill=(90, 96, 116, 255))  # barrel
        d.rectangle((176*S, 86*S, 186*S, 102*S), fill=accent)
        d.ellipse((78*S, 72*S, 112*S, 104*S), fill=INK); d.ellipse((84*S, 78*S, 106*S, 98*S), fill=accent)
        d.ellipse((90*S, 82*S, 97*S, 88*S), fill=(255, 240, 200, 255))
        d.polygon([(70*S, 140*S), (100*S, 175*S), (130*S, 140*S)], fill=INK)   # thruster
        d.polygon([(82*S, 142*S), (100*S, 165*S), (118*S, 142*S)], fill=(70, 220, 255, 255))
        d.ellipse((66*S, 60*S, 92*S, 74*S), fill=(240, 244, 255, 255))
    else:  # medic
        body, shade, accent = (232, 236, 244, 255), (160, 168, 190, 255), (90, 230, 140, 255)
        d.rounded_rectangle((52*S, 40*S, 148*S, 150*S), radius=40*S, fill=INK)
        d.rounded_rectangle((52*S + o, 40*S + o, 148*S - o, 150*S - o), radius=34*S, fill=body)
        d.rectangle((58*S, 112*S, 142*S, 142*S), fill=shade)
        d.rectangle((88*S, 66*S, 112*S, 122*S), fill=INK); d.rectangle((72*S, 82*S, 128*S, 106*S), fill=INK)
        d.rectangle((92*S, 70*S, 108*S, 118*S), fill=accent); d.rectangle((76*S, 86*S, 124*S, 102*S), fill=accent)
        for x in (40, 160):
            d.line((x*S, 70*S, x*S, 130*S), fill=INK, width=10*S); d.line((x*S, 70*S, x*S, 130*S), fill=(150, 156, 176, 255), width=4*S)
        d.ellipse((64*S, 48*S, 96*S, 64*S), fill=(255, 255, 255, 255))
        d.polygon([(76*S, 150*S), (100*S, 182*S), (124*S, 150*S)], fill=INK)
        d.polygon([(86*S, 152*S), (100*S, 172*S), (114*S, 152*S)], fill=(70, 220, 255, 255))
    return im.resize((size, size), Image.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)
    vg = Image.open(os.path.join(ART, 'vanguard.png')).convert('RGB')
    # key the whole render first (its border is pure background), then crop the pieces
    a = np.asarray(vg).astype(int)
    bg = np.median(np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]]), axis=0)
    from scipy import ndimage
    near = np.abs(a - bg).max(-1) <= 16
    lab, _ = ndimage.label(near)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    m = ~np.isin(lab, list(edge))
    rgba = np.dstack([a.astype(np.uint8), (m * 255).astype(np.uint8)])
    keyed = Image.fromarray(rgba, 'RGBA')
    gear = {'chest': (415, 205, 600, 360), 'shoulder': (345, 185, 455, 275), 'gauntlet': (295, 365, 372, 585), 'boots': (325, 800, 485, 1000)}
    for k, box in gear.items():
        piece = keyed.crop(box)
        fit(piece.crop(piece.getbbox()), h=150).save(os.path.join(OUT, f'gear_{k}.png'))
    for c in ('blue', 'red', 'green', 'purple'):
        for kind in ('saber', 'staff'):
            p = os.path.join(ART, f'{kind}_{c}_cutout.png')
            if os.path.exists(p):
                fit(Image.open(p).convert('RGBA'), w=300).save(os.path.join(OUT, f'{kind}_{c}.png'))
    for n, out in (('raider_club_cutout', 'scrapper_a'), ('raider_rifle_cutout', 'scrapper_b')):
        im = Image.open(os.path.join(ART, n)).convert('RGBA') if n.endswith('.png') else Image.open(os.path.join(ART, n + '.png')).convert('RGBA')
        fit(im, h=136).save(os.path.join(OUT, out + '.png'))   # Scrappers are short: ~68 world px
    droid('turret').save(os.path.join(OUT, 'droid_turret.png'))
    droid('medic').save(os.path.join(OUT, 'droid_medic.png'))
    print(sorted(os.listdir(OUT)))


main()
