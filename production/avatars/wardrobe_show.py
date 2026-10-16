# Show wardrobe for the arrival clip (production/empty-opening): the presenters as in their approved references.
#   Andy'K: black shirt (recolor.py) with elegant black trousers and black leather shoes, instead of jeans and trainers
#   Georgie: black top/blazer (recolor.py) with slim black trousers and her black shoes, instead of jeans
# Writes <tex>_body_color_show.jpg, <tex>_body_normal_show.png (trouser legs smoothed: no denim seams or pockets) and
# <tex>_body_specular_show.jpg (leather shoes glossy, wool trousers matt). Shading is kept. Run: .venv/bin/python wardrobe_show.py
import numpy as np
from PIL import Image

def load(p, mode='RGB', size=None):
    im = Image.open(p).convert(mode)
    if size and im.size != size: im = im.resize(size, Image.LANCZOS)   # the normal and specular maps are half the colour map's size
    return np.asarray(im).astype(np.float32)
def save(a, p, **kw): Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).save(p, **kw)

def region_mask(shape, regions):
    H, W = shape[:2]; m = np.zeros((H, W), bool)
    v, u = np.mgrid[0:H, 0:W]; u = u / W; v = v / H
    for x0, y0, x1, y1 in regions: m |= (u >= x0) & (u <= x1) & (v >= y0) & (v <= y1)
    return m

def blur(a, r):
    # a cheap box blur (twice), for the cloth's soft large-scale shading
    out = a.copy()
    for _ in range(2):
        c = np.cumsum(np.pad(out, ((r + 1, r), (0, 0)) + ((0, 0),) * (out.ndim - 2), mode='edge'), 0); out = (c[2 * r + 1:] - c[:-2 * r - 1]) / (2 * r + 1)
        c = np.cumsum(np.pad(out, ((0, 0), (r + 1, r)) + ((0, 0),) * (out.ndim - 2), mode='edge'), 1); out = (c[:, 2 * r + 1:] - c[:, :-2 * r - 1]) / (2 * r + 1)
    return out

def dress(tex, src_color, trousers, shoes, belt=()):
    col = load(f'web/{src_color}'); size = (col.shape[1], col.shape[0])
    nrm = load(f'web/{tex}_body_normal.png', size=size); spec = load(f'web/{tex}_body_specular.jpg', 'L', size=size)
    H, W = col.shape[:2]
    lum = col @ np.array([0.3, 0.59, 0.11], np.float32)
    # trousers: black wool; its large folds kept, the denim's fading
    # and seams mostly gone (soft shading from a blurred copy, a trace of the fine detail)
    tm = region_mask(col.shape, trousers) & (lum > 3)   # the whole trouser panels (faded and stitched parts too), not the empty atlas
    soft = blur(lum, 6)
    k = 9 + 0.10 * soft + 0.025 * (lum - soft)
    col[tm] = np.stack([k, k, k * 1.03], -1)[tm]
    # the normal map there: 80 % flat, so the legs read as pressed trousers, not jeans
    flat = np.array([128, 128, 255], np.float32)
    nrm[tm] = nrm[tm] * 0.2 + flat * 0.8
    spec[tm] = 38                                   # matt wool
    # shoes: everything light (white soles, trainer stripes, prints) to black; the uppers glossy, like polished leather
    skin = (col[..., 0] > col[..., 2] + 25) & (col[..., 0] > 90)
    sm = region_mask(col.shape, shoes) & ~skin
    sk = 7 + 0.06 * lum
    col[sm] = np.stack([sk, sk, sk * 1.02], -1)[sm]
    spec[sm] = np.where(lum[sm] > 90, 70, 150)      # (the former soles a little less shiny than the uppers)
    if belt:
        bm = region_mask(col.shape, belt) & (col[..., 0] > col[..., 2] + 6)
        col[bm] = np.stack([10 + 0.08 * lum] * 3, -1)[bm]
    save(col, f'web/{tex}_body_color_show.jpg', quality=92)
    save(nrm, f'web/{tex}_body_normal_show.png')
    save(spec, f'web/{tex}_body_specular_show.jpg', quality=92)

# Andy'K (m019): jeans in the top corners of the atlas, the shoes (soles and uppers) at the bottom of the legs' strips
dress('m019', 'm019_body_color_black.jpg',
      trousers=[(0.0, 0.0, 0.29, 0.44), (0.71, 0.0, 1.0, 0.44)],
      # (the soles' undersides sit beside the shirt's hem, round the watch: the shirt there is black anyway)
      shoes=[(0.16, 0.69, 0.46, 1.0), (0.54, 0.69, 0.84, 1.0)])
# Georgie (f005): jeans in the bottom corners, her belt across their tops
dress('f005', 'f005_body_color_black.jpg',
      trousers=[(0.0, 0.54, 0.31, 1.0), (0.69, 0.54, 1.0, 1.0)],
      shoes=[], belt=[(0.0, 0.56, 0.31, 0.62), (0.69, 0.56, 1.0, 0.62)])
print('ok')
