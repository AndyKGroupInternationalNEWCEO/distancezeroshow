# Virtual Space

Public interactive 3D studio for **virtualspace.distancezeroshow.com**. Built from the approved `studio.html` and
`virtual-studio/`; it is not a copy that can drift.

- `node virtualspace/build.mjs` writes `virtualspace/dist/`, by allowlist only: the page, its five scripts, the
  Three.js files it uses, fonts and five images. Nothing from `studio/` (Director Studio), `production/` or any
  avatar, render or credential can be included.
- `virtualspace/dist/` is deployed as its own Vercel project (`distancezero-virtualspace`), separate from the
  main website project. The main site is not touched.
- Headers: strict Content Security Policy (own files only, inline scripts by hash), no framing, no camera/mic.
