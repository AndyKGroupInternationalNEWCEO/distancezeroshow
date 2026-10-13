# Likeness, step 4: the photo prepared for projection onto the head. Large-scale shading (the lamp on one side) is
# evened out, so it is not baked into the skin, while pores, stubble and features stay; and a soft mask of the face
# (inside the landmark outline) says where the photo is used.
#   avatars/.venv/bin/python avatars/likeness_4_photo.py <folder> <photo>
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

out, photo = sys.argv[1], sys.argv[2]
L = json.load(open(os.path.join(out, 'landmarks.json')))
W, H = L['size']
uv = np.array(L['landmarks'])[:, :2] * [W, H]
OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150,
        136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]
img = np.asarray(Image.open(photo).convert('RGB')).astype(np.float32) / 255
lin = img ** 2.2

# soft face mask, a little inside the outline so no hair or background comes along
c = uv[OVAL].mean(0)
poly = [tuple(c + (p - c) * 0.95) for p in uv[OVAL]]
m = Image.new('L', (W, H), 0); ImageDraw.Draw(m).polygon(poly, fill=255)
eye = np.linalg.norm(uv[33] - uv[263])
# the eyes themselves come from the 3D eyes and lids: cut them (and the glass rims around them) out of the photo
EYE_R = [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7]
EYE_L = [263, 466, 388, 387, 386, 385, 384, 398, 362, 382, 381, 380, 374, 373, 390, 249]
d = ImageDraw.Draw(m)
for ring in (EYE_R, EYE_L):
    e = uv[ring]; ec = e.mean(0)
    d.polygon([tuple(ec + (p - ec) * 1.55) for p in e], fill=0)
m = m.filter(ImageFilter.GaussianBlur(eye * 0.06))
m.save(os.path.join(out, 'face-mask.png'))
mask = np.asarray(m).astype(np.float32) / 255

# even out the lighting: divide by a heavily blurred luminance (only inside the face), keep the face's mean level
lum = lin @ [0.2126, 0.7152, 0.0722]
def blur(a, r):
    im = Image.fromarray(np.clip(a * 255 / max(a.max(), 1e-6), 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))
    return np.asarray(im).astype(np.float32) / 255 * max(a.max(), 1e-6)
wsum = blur(mask, eye * 0.35) + 1e-4
low = blur(lum * mask, eye * 0.35) / wsum                    # local average skin brightness, face only
level = (lum * mask).sum() / mask.sum()
gain = np.clip(level / np.maximum(low, 1e-3), 0.6, 1.8)
delit = np.clip(lin * gain[..., None], 0, 1)
out_img = (delit ** (1 / 2.2) * mask[..., None] + img * (1 - mask[..., None]))
Image.fromarray((np.clip(out_img, 0, 1) * 255).astype(np.uint8)).save(os.path.join(out, 'photo-delit.png'))
# the skin tone the rest of the body should take (linear RGB, cheeks and forehead, away from eyes and beard)
pick = [50, 280, 101, 330, 151, 108, 337]
tone = np.array([delit[int(uv[i, 1]), int(uv[i, 0])] for i in pick]).mean(0)
json.dump({'skin_linear': tone.tolist()}, open(os.path.join(out, 'skin-tone.json'), 'w'))
print('photo prepared; skin tone (linear)', np.round(tone, 3))
