# -*- coding: utf-8 -*-
"""生成 PWA 图标：indigo 底 + 白色 V 字标"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "icons")
os.makedirs(OUT, exist_ok=True)

BG = (79, 70, 229, 255)      # #4f46e5
BG_DARK = (67, 56, 202, 255)  # #4338ca
WHITE = (255, 255, 255, 255)

FONT_CANDIDATES = [
    r"C:\Windows\Fonts\arialbd.ttf",
    r"C:\Windows\Fonts\seguisb.ttf",
    r"C:\Windows\Fonts\msyhbd.ttc",
    r"C:\Windows\Fonts\segoeuib.ttf",
]


def find_font(size):
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()


def draw_icon(size, radius_ratio, glyph_ratio, maskable=False):
    """maskable 时铺满整块画布（安全区内缩），普通图标带圆角"""
    scale = 2  # 超采样，边缘更干净
    s = size * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    if maskable:
        # 满幅背景（系统自己裁形）
        draw.rectangle([0, 0, s, s], fill=BG)
        # 底部一层深色弧，增加层次
        draw.ellipse([-s * 0.3, s * 0.62, s * 1.3, s * 1.9], fill=BG_DARK)
    else:
        r = int(s * radius_ratio)
        draw.rounded_rectangle([0, 0, s - 1, s - 1], radius=r, fill=BG)
        draw.ellipse([-s * 0.25, s * 0.66, s * 1.25, s * 1.8], fill=BG_DARK)

    font = find_font(int(s * glyph_ratio))
    text = "V"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (s - tw) / 2 - bbox[0]
    y = (s - th) / 2 - bbox[1] - s * 0.01
    draw.text((x, y), text, font=font, fill=WHITE)

    return img.resize((size, size), Image.LANCZOS)


def main():
    targets = [
        ("icon-192.png", 192, 0.22, 0.60, False),
        ("icon-512.png", 512, 0.22, 0.60, False),
        ("icon-maskable-512.png", 512, 0.0, 0.46, True),
        ("apple-touch-icon.png", 180, 0.0, 0.56, True),
    ]
    for name, size, radius, glyph, maskable in targets:
        img = draw_icon(size, radius, glyph, maskable=maskable)
        path = os.path.join(OUT, name)
        img.save(path, "PNG", optimize=True)
        print("wrote", name, img.size, os.path.getsize(path), "bytes")


if __name__ == "__main__":
    main()
