#!/usr/bin/env bash
# Removes WhatsApp for Linux. Pass --purge to also delete your login session and settings.
set -euo pipefail

APP_ID=whatsapp-linux

pkill -f "$HOME/.local/opt/$APP_ID/$APP_ID" 2>/dev/null || true
rm -rf "$HOME/.local/opt/$APP_ID"
rm -f "$HOME/.local/bin/$APP_ID" \
      "$HOME/.local/share/applications/$APP_ID.desktop" \
      "$HOME/.config/autostart/$APP_ID.desktop"
rm -f "$HOME"/.local/share/icons/hicolor/*/apps/$APP_ID.png

if command -v gsettings >/dev/null; then
  FAVS="$(gsettings get org.gnome.shell favorite-apps 2>/dev/null || true)"
  if [[ "$FAVS" == *"'$APP_ID.desktop'"* ]]; then
    FAVS="${FAVS//, \'$APP_ID.desktop\'/}"
    FAVS="${FAVS//\'$APP_ID.desktop\', /}"
    FAVS="${FAVS//\'$APP_ID.desktop\'/}"
    gsettings set org.gnome.shell favorite-apps "$FAVS"
  fi
fi

if [[ -f "/etc/apparmor.d/$APP_ID" ]]; then
  sudo apparmor_parser -R "/etc/apparmor.d/$APP_ID" || true
  sudo rm -f "/etc/apparmor.d/$APP_ID"
fi

[[ "${1:-}" == "--purge" ]] && rm -rf "$HOME/.config/$APP_ID"
echo "WhatsApp for Linux removed."
