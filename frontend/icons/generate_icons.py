"""Generates simple app icons: a rose-colored rounded square with a small
white flower-ish mark. No external assets, nothing to trace back to any
existing brand — just a clean, private icon for a home-screen shortcut.
"""
from PIL import Image, ImageDraw
import math

PRIMARY = (194, 66, 107, 255)  # matches --primary in style.css
WHITE = (255, 255, 255, 255)


def draw_mark(draw, cx, cy, r):
    # A simple 5-petal flower made of overlapping circles.
    petal_r = r * 0.42
    for i in range(5):
        angle = math.radians(90 + i * 72)
        px = cx + math.cos(angle) * r * 0.42
        py = cy - math.sin(angle) * r * 0.42
        draw.ellipse([px - petal_r, py - petal_r, px + petal_r, py + petal_r], fill=WHITE)
    center_r = r * 0.22
    draw.ellipse([cx - center_r, cy - center_r, cx + center_r, cy + center_r], fill=PRIMARY)


def make_icon(size, maskable=False):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    pad = int(size * 0.14) if maskable else 0  # maskable icons need safe-zone padding
    corner_radius = int(size * 0.22) if not maskable else 0

    if maskable:
        draw.rectangle([0, 0, size, size], fill=PRIMARY)
    else:
        draw.rounded_rectangle([0, 0, size, size], radius=corner_radius, fill=PRIMARY)

    cx, cy = size / 2, size / 2
    r = (size - pad * 2) * 0.30
    draw_mark(draw, cx, cy, r)
    return img


make_icon(192).save('icon-192.png')
make_icon(512).save('icon-512.png')
make_icon(512, maskable=True).save('icon-maskable-512.png')
print('done')
