# Wardrobe pass for the proof of concept: dark tops like the real presenters' portraits.
# Region-limited and colour-keyed, so skin, jeans and shoes are untouched. Shading is kept.
from PIL import Image
import colorsys, sys

def recolor(src, out, regions, keep, darkness):
    im = Image.open(src).convert('RGB'); W, H = im.size; px = im.load()
    for y in range(H):
        v = y / H
        for x in range(W):
            u = x / W
            if not any(x0 <= u <= x1 and y0 <= v <= y1 for x0, y0, x1, y1 in regions): continue
            r, g, b = px[x, y]
            if not keep(r, g, b): continue
            lum = 0.3 * r + 0.59 * g + 0.11 * b
            k = int(min(255, 14 + lum * darkness))
            px[x, y] = (k, k, int(k * 1.04))
    im.save(out, quality=90)

# Andy'K: blue T-shirt (torso panel and sleeves) -> black; the jeans sit above y 0.43 on the sides
recolor('web/m019_body_color.jpg', 'web/m019_body_color_black.jpg',
        [(0.31, 0.02, 0.69, 0.86), (0.0, 0.44, 0.31, 0.6), (0.69, 0.44, 1.0, 0.6)],
        lambda r, g, b: b > r + 12, 0.22)
# Georgie: pink blazer -> black blazer; the light blue shirt stays
recolor('web/f005_body_color.jpg', 'web/f005_body_color_black.jpg',
        [(0.31, 0.0, 0.69, 0.8), (0.02, 0.27, 0.98, 0.48)],
        # the pink cloth and its light pinstripes (they stayed white and read as a silver jacket from above)
        lambda r, g, b: (r > b + 18 and r > g + 10) or (r >= b - 4 and min(r, g, b) > 150), 0.2)
print('ok')
