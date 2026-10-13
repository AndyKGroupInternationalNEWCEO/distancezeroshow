# Reads a presenter's face from one photo with MediaPipe Face Landmarker (Apache 2.0, runs offline):
# 478 3D landmarks, the head pose and an overlay to check the fit.
#   avatars/.venv/bin/python avatars/face_landmarks.py <photo> <out folder>
import json, sys, os
import numpy as np
import mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions
from PIL import Image, ImageDraw

photo, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
here = os.path.dirname(os.path.abspath(__file__))
det = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
    base_options=BaseOptions(model_asset_path=os.path.join(here, 'models', 'face_landmarker.task')),
    output_facial_transformation_matrixes=True, output_face_blendshapes=True, num_faces=1))
img = Image.open(photo).convert('RGB')
res = det.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.asarray(img)))
if not res.face_landmarks:
    sys.exit('no face found')
lm = res.face_landmarks[0]
W, H = img.size
pts = [[p.x, p.y, p.z] for p in lm]
pose = np.array(res.facial_transformation_matrixes[0]).tolist()
shapes = {c.category_name: round(c.score, 3) for c in res.face_blendshapes[0]}
json.dump({'photo': os.path.basename(photo), 'size': [W, H], 'landmarks': pts, 'pose': pose, 'blendshapes': shapes},
          open(os.path.join(out, 'landmarks.json'), 'w'))
# overlay: every landmark as a dot, so a reviewer can see the fit
ov = img.copy(); d = ImageDraw.Draw(ov)
for x, y, _ in pts:
    d.ellipse([x * W - 1.5, y * H - 1.5, x * W + 1.5, y * H + 1.5], fill=(80, 255, 160))
ov.save(os.path.join(out, 'landmarks-overlay.jpg'), quality=90)
yaw = np.degrees(np.arctan2(-pose[2][0], pose[2][2])); pitch = np.degrees(np.arcsin(pose[2][1]))
print(f'{len(pts)} landmarks; head yaw {yaw:.1f}°, pitch {pitch:.1f}°')
