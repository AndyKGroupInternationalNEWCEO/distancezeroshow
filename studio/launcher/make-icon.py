# The launcher icon: the D//0 logo with DIRECTOR / BROADCAST STUDIO on the studio black, in the macOS icon grid
# (824 px tile with rounded corners inside 1024). Usage: python3 launcher/make-icon.py <logo.png> <out.png>
import sys
from PIL import Image, ImageDraw, ImageFont

logo_path, out = sys.argv[1], sys.argv[2]
S, T = 1024, 824
img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
o = (S - T) // 2
tile = Image.new('RGBA', (T, T), (0, 0, 0, 0))
d = ImageDraw.Draw(tile)
d.rounded_rectangle([0, 0, T - 1, T - 1], radius=185, fill=(6, 7, 9, 255), outline=(60, 64, 72, 255), width=3)
# the amber → ice line under the text, as on the studio's top bar
for x in range(120, T - 120):
    k = (x - 120) / (T - 240)
    c = tuple(int(a + (b - a) * k) for a, b in zip((242, 166, 80), (169, 200, 238)))
    d.line([(x, 690), (x, 693)], fill=c + (255,))
logo = Image.open(logo_path).convert('RGBA')
w = 640; logo = logo.resize((w, round(logo.height * w / logo.width)), Image.LANCZOS)
tile.alpha_composite(logo, ((T - w) // 2, 135))
def font(size, idx):
    try: return ImageFont.truetype('/System/Library/Fonts/Avenir Next.ttc', size, index=idx)
    except Exception: return ImageFont.truetype('/System/Library/Fonts/HelveticaNeue.ttc', size, index=1)
def spaced(text, y, f, gap, fill):
    widths = [d.textlength(ch, font=f) for ch in text]
    total = sum(widths) + gap * (len(text) - 1)
    x = (T - total) / 2
    for ch, cw in zip(text, widths):
        d.text((x, y), ch, font=f, fill=fill); x += cw + gap
spaced('DIRECTOR', 495, font(96, 2), 10, (243, 245, 248, 255))        # Avenir Next Demi Bold
spaced('BROADCAST STUDIO', 615, font(46, 0), 9, (201, 206, 214, 255))  # Avenir Next Regular
img.alpha_composite(tile, (o, o))
img.save(out)
