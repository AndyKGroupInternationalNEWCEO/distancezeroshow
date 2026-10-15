#!/bin/zsh
# Builds the one-click launcher "Director Broadcast Studio.app" (default: on the Desktop) with the D//0 logo as its icon.
# Run once:  npm run make-launcher   (or: zsh launcher/make-app.sh "/Applications")
set -e
STUDIO="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${1:-$HOME/Desktop}"
APP="$DEST/Director Broadcast Studio.app"
TMP="$(mktemp -d)"
sed "s|__STUDIO__|$STUDIO|" "$STUDIO/launcher/DISTANCE-ZERO.applescript" > "$TMP/l.applescript"
rm -rf "$APP"
osacompile -o "$APP" "$TMP/l.applescript"
# icon: the D//0 logo with DIRECTOR / BROADCAST STUDIO (launcher/make-icon.py)
python3 "$STUDIO/launcher/make-icon.py" "$STUDIO/public/static/brand/DO_logo_1280.png" "$TMP/icon.png"
mkdir "$TMP/i.iconset"
for s in 16 32 128 256 512; do
  sips -z $s $s "$TMP/icon.png" --out "$TMP/i.iconset/icon_${s}x${s}.png" >/dev/null
  sips -z $((s*2)) $((s*2)) "$TMP/icon.png" --out "$TMP/i.iconset/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$TMP/i.iconset" -o "$APP/Contents/Resources/applet.icns"
# osacompile also writes the default script icon into Assets.car, which macOS shows instead: use only ours
rm -f "$APP/Contents/Resources/Assets.car"
/usr/libexec/PlistBuddy -c "Delete :CFBundleIconName" "$APP/Contents/Info.plist" 2>/dev/null || true
codesign --force --sign - "$APP" 2>/dev/null || true
touch "$APP"
rm -rf "$TMP"
echo "Launcher ready: $APP"
