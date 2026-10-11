# DISTANCE // ZERO

Official site. Static, no build step.

- `index.html` — page, styles, script. Edit the `DZ` config block in the script for launch time, live stream, guests, media and episodes.
- `assets/` — key visual, opening video, studio loop, soundtrack.

## Virtual studio (`/studio`)

Interactive 3D studio, a separate page that nothing else on the site depends on.

- `studio.html`: the page, its controls and its fallback (devices without WebGL 2 see `assets/studio-still.jpg`).
- `virtual-studio/`: `set.js` (the set, modelled in code), `screens.js` (LED wall, pylons, desk fascia, drawn on canvas), `views.js` (camera viewpoints and auto tour), `main.js` (renderer, lighting looks, simulated on air).
- `assets/vendor/three-0.170.0/`: Three.js (MIT), self-hosted, so the page makes no third-party requests.

"Simulate on air" only changes the lighting on the page. The page connects to nothing and broadcasts nothing.
Not linked from the homepage or the sitemap yet.
