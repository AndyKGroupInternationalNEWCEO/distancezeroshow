#!/bin/zsh
# Builds the one-click launcher "DISTANCE ZERO.app" (default: on the Desktop) with the D//0 logo as its icon.
# Run once:  npm run make-launcher   (or: zsh launcher/make-app.sh "/Applications")
set -e
STUDIO="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${1:-$HOME/Desktop}"
APP="$DEST/DISTANCE ZERO.app"
TMP="$(mktemp -d)"
sed "s|__STUDIO__|$STUDIO|" "$STUDIO/launcher/DISTANCE-ZERO.applescript" > "$TMP/l.applescript"
rm -rf "$APP"
osacompile -o "$APP" "$TMP/l.applescript"
# icon: the D//0 logo centred on the studio black
sips -Z 900 "$STUDIO/public/static/brand/DO_logo_1280.png" --out "$TMP/logo.png" >/dev/null
sips -p 1024 1024 --padColor 060709 "$TMP/logo.png" --out "$TMP/icon.png" >/dev/null
mkdir "$TMP/i.iconset"
for s in 16 32 128 256 512; do
  sips -z $s $s "$TMP/icon.png" --out "$TMP/i.iconset/icon_${s}x${s}.png" >/dev/null
  sips -z $((s*2)) $((s*2)) "$TMP/icon.png" --out "$TMP/i.iconset/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$TMP/i.iconset" -o "$APP/Contents/Resources/applet.icns"
touch "$APP"
rm -rf "$TMP"
echo "Launcher ready: $APP"
