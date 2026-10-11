# Presenter avatars (production tests)

Proof-of-concept presenters for the virtual studio clips. Not used by the public website (`production/` is in `.vercelignore`).

- **Source:** [Microsoft Rocketbox Avatar Library](https://github.com/microsoft/Microsoft-Rocketbox), MIT licence, Copyright (c) Microsoft Corporation. Base bodies `Male_Adult_16` (Andy'K) and `Female_Adult_05` (Georgie), plus the library's motion-captured walk and sit-down animations.
- **Not likenesses:** generic library faces. Real likeness and wardrobe follow the presenters' own references.
- **Wardrobe pass:** `recolor.py` turns the T-shirt and the blazer black, as in the site portraits. Shading is kept; skin and jeans are untouched.
- **Get the files:** `./fetch.sh` downloads everything into `source/` and writes web textures to `web/`. Both folders are ignored by git (about 200 MB of library files).

The MIT licence requires keeping the copyright and licence notice with any copies of the library files we distribute.
