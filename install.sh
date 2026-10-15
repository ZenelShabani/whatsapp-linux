#!/usr/bin/env bash
# Installs WhatsApp for Linux for the current user and pins it to the GNOME dock.
# The AppArmor step (Chromium sandbox) asks for sudo once; skip it with --no-apparmor.
set -euo pipefail

APP_ID=whatsapp-linux
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="$HOME/.local/opt/$APP_ID"
BIN="$HOME/.local/bin/$APP_ID"
DESKTOP="$HOME/.local/share/applications/$APP_ID.desktop"
ICONS="$HOME/.local/share/icons/hicolor"
PROFILE="/etc/apparmor.d/$APP_ID"

WITH_APPARMOR=1
[[ "${1:-}" == "--no-apparmor" ]] && WITH_APPARMOR=0

cd "$SRC"
[[ -x node_modules/electron/dist/electron ]] || npm install
[[ -f assets/icon.png ]] || node scripts/make-icons.js

pkill -f "$DEST/$APP_ID" 2>/dev/null || true

echo "==> Copying runtime to $DEST"
rm -rf "$DEST"
mkdir -p "$DEST"
cp -a node_modules/electron/dist/. "$DEST/"
mv "$DEST/electron" "$DEST/$APP_ID"
rm -f "$DEST/resources/default_app.asar"
mkdir -p "$DEST/resources/app"
cp -a package.json src assets "$DEST/resources/app/"

echo "==> Installing icons"
for s in 16 32 48 64 128 256 512; do
  install -Dm644 "assets/icon-$s.png" "$ICONS/${s}x${s}/apps/$APP_ID.png"
done

echo "==> Installing launcher $BIN"
mkdir -p "$(dirname "$BIN")"
cat > "$BIN" <<EOF
#!/usr/bin/env bash
# Without the AppArmor profile, Ubuntu blocks Chromium's sandbox, so fall back to running without it.
FLAGS=()
[[ -f "$PROFILE" ]] || FLAGS+=(--no-sandbox)
export WA_LAUNCHER="$BIN"
exec "$DEST/$APP_ID" "\${FLAGS[@]}" "\$@"
EOF
chmod +x "$BIN"

echo "==> Installing desktop entry"
mkdir -p "$(dirname "$DESKTOP")"
cat > "$DESKTOP" <<EOF
[Desktop Entry]
Type=Application
Name=WhatsApp
GenericName=Messenger
Comment=WhatsApp Web as a native desktop app
Exec=$BIN %U
Icon=$APP_ID
Terminal=false
Categories=Network;InstantMessaging;Chat;
Keywords=whatsapp;chat;messenger;
StartupWMClass=$APP_ID
StartupNotify=true
SingleMainWindow=true
Actions=quit;

[Desktop Action quit]
Name=Quit
Exec=pkill -f $DEST/$APP_ID
EOF
update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
gtk-update-icon-cache -q "$ICONS" 2>/dev/null || true

# If autostart was enabled from the tray before, point it at the new launcher.
AUTOSTART="$HOME/.config/autostart/$APP_ID.desktop"
[[ -f "$AUTOSTART" ]] && sed -i "s|^Exec=.*|Exec=$BIN --hidden|" "$AUTOSTART"

echo "==> Pinning to the dock"
if command -v gsettings >/dev/null && gsettings get org.gnome.shell favorite-apps >/dev/null 2>&1; then
  FAVS="$(gsettings get org.gnome.shell favorite-apps)"
  if [[ "$FAVS" != *"'$APP_ID.desktop'"* ]]; then
    if [[ "$FAVS" == "@as []" || "$FAVS" == "[]" ]]; then
      gsettings set org.gnome.shell favorite-apps "['$APP_ID.desktop']"
    else
      gsettings set org.gnome.shell favorite-apps "${FAVS%]}, '$APP_ID.desktop']"
    fi
  fi
fi

if [[ $WITH_APPARMOR == 1 ]]; then
  echo "==> Installing AppArmor profile $PROFILE (needs sudo)"
  sudo tee "$PROFILE" >/dev/null <<EOF
# Lets the WhatsApp for Linux Electron runtime use user namespaces for its sandbox.
abi <abi/5.0>,
include <tunables/global>

profile $APP_ID $DEST/$APP_ID flags=(unconfined) {
  userns,

  include if exists <local/$APP_ID>
}
EOF
  sudo apparmor_parser -r "$PROFILE"
fi

echo
echo "Done. Launch WhatsApp from the dock or the app grid, or run: $APP_ID"
