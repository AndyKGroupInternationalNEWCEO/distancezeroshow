# Likeness, step 3: the face targets that make the 3D head match the photo. The camera of the photo is estimated as a
# scaled orthographic view; then pose and target weights are solved in turn (bounded least squares, kept small).
#   avatars/.venv/bin/python avatars/likeness_3_fit.py <folder> <photo>
import json, os, sys
import numpy as np
from scipy.optimize import lsq_linear
from PIL import Image, ImageDraw

out, photo = sys.argv[1], sys.argv[2]
C = np.load(os.path.join(out, 'correspond.npz'))
P0, D, names = C['P0'], C['D'], list(C['names'])
L = json.load(open(os.path.join(out, 'landmarks.json')))
W, H = L['size']
lm = np.array(L['landmarks'])
uv = lm[:, :2] * [W, H]                                    # photo landmarks in pixels
zz = lm[:, 2] * W                                          # MediaPipe's relative depth, in the same scale

OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150,
        136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]
KEY = [33, 133, 362, 263, 159, 145, 386, 374, 70, 105, 107, 336, 334, 300, 1, 4, 5, 6, 168, 48, 278, 98, 327, 61, 291, 0, 17,
       13, 14, 152, 199, 175]
wl = np.ones(len(lm))
wl[OVAL] = 0.35                                            # the outline is a silhouette, not fixed skin points
wl[KEY] = 2.0                                              # eyes, brows, nose, mouth and chin carry the likeness
wl[468:] = 0                                               # irises: the base head has no eyes yet
# eyelids: on the eyeless base render they sat in the sockets, so they would open the eyes wide; the corners stay
LIDS = [246, 161, 160, 159, 158, 157, 173, 155, 154, 153, 145, 144, 163, 7, 466, 388, 387, 386, 385, 384, 398, 382, 381, 380, 374, 373, 390, 249]
wl[LIDS] = 0
wl[C['miss']] = 0
used = (np.abs(D).sum((1, 2)) > 1e-9) & np.array(['eye-height' not in n and 'eye-scale-vert' not in n for n in names])
K = int(used.sum()); Du = D[used]
LAMBDA = float(os.environ.get('LAMBDA', '0.02'))           # how much the targets are kept small (avoids caricature)

def pose(X):
    """scaled orthographic camera from model points X (n,3) to pixels uv: u = s R[:2] X + t"""
    w = np.sqrt(wl)[:, None]
    A = np.hstack([X, np.ones((len(X), 1))]) * w
    sol, *_ = np.linalg.lstsq(A, uv * w, rcond=None)       # affine 4x2
    M = sol[:3].T                                           # 2x3
    U, S, Vt = np.linalg.svd(M)
    s = S.mean(); R2 = U @ np.eye(2, 3) @ Vt               # nearest scaled rotation
    t = ((uv - s * X @ R2.T) * wl[:, None]).sum(0) / wl.sum()
    R3 = np.cross(R2[0], R2[1])
    tz = ((zz - s * X @ R3) * wl).sum() / wl.sum()
    return s, R2, R3, t, tz

def residual(X, s, R2, R3, t, tz):
    return np.linalg.norm((s * X @ R2.T + t - uv), axis=1)

ref = np.linalg.norm(uv[33] - uv[263])                     # outer eye corners: the face's own scale
w = np.zeros(K)
X = P0.copy()
s, R2, R3, t, tz = pose(X)
before = (residual(X, s, R2, R3, t, tz) * wl).sum() / wl.sum() / ref
for it in range(8):
    s, R2, R3, t, tz = pose(P0 + np.tensordot(w, Du, 1))
    # linear in w: rows for x, y (pixels) and a weak depth row, each landmark weighted
    J = np.concatenate([s * Du @ R2[0], s * Du @ R2[1], 0.3 * s * Du @ R3], axis=1).T      # (3n, K)
    base = np.concatenate([s * P0 @ R2[0] + t[0], s * P0 @ R2[1] + t[1], 0.3 * (s * P0 @ R3 + tz)])
    y = np.concatenate([uv[:, 0], uv[:, 1], 0.3 * zz]) - base
    sw = np.sqrt(np.concatenate([wl, wl, wl]))
    A = np.vstack([J * sw[:, None] / ref, np.sqrt(LAMBDA) * np.eye(K)])
    b = np.concatenate([y * sw / ref, np.zeros(K)])
    w = lsq_linear(A, b, bounds=(0, 1), lsmr_tol='auto').x
X = P0 + np.tensordot(w, Du, 1)
s, R2, R3, t, tz = pose(X)
after = (residual(X, s, R2, R3, t, tz) * wl).sum() / wl.sum() / ref

weights = {n: round(float(v), 3) for n, v in zip(np.array(names)[used], w) if v > 0.01}
json.dump({'weights': weights, 'error_before': before, 'error_after': after, 'lambda': LAMBDA,
           'camera': {'s': s, 'R2': R2.tolist(), 'R3': R3.tolist(), 't': t.tolist(), 'tz': tz}},
          open(os.path.join(out, 'fit.json'), 'w'), indent=1)
# check: photo with the detected landmarks (green) and the fitted 3D head's points (red)
img = Image.open(photo).convert('RGB'); d = ImageDraw.Draw(img)
proj = s * X @ R2.T + t
for (a, b), (c, e), k in zip(uv, proj, wl):
    if k == 0: continue
    d.ellipse([a - 2, b - 2, a + 2, b + 2], fill=(80, 255, 160)); d.ellipse([c - 2, e - 2, c + 2, e + 2], fill=(255, 70, 70))
img.save(os.path.join(out, 'fit-overlay.jpg'), quality=90)
print(f'mean landmark error: {before * 100:.1f}% of the eye span before, {after * 100:.1f}% after; {len(weights)} targets used')
for n, v in sorted(weights.items(), key=lambda kv: -kv[1])[:14]: print(f'  {v:.2f}  {n}')
