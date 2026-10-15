# WhatsApp for Linux

A small, fast desktop app for WhatsApp Web on Linux. It is a thin Electron wrapper: Chromium runs natively, with no Wine and no emulation, so it is much quicker than running the Windows client under Wine.

> **Disclaimer:** this is an unofficial, community project. It is not affiliated with, endorsed by or sponsored by WhatsApp or Meta Platforms, Inc. "WhatsApp" is a trademark of its owner. The app only loads the official [web.whatsapp.com](https://web.whatsapp.com) in a window; it does not modify, intercept or store your messages.

## Features

- Tray icon with an unread badge, close to tray, optional start on login (tray menu)
- Unread count on the dock icon
- Desktop notifications; clicking one opens the window
- Spellcheck in your system languages with right-click suggestions
- Links open in your default browser
- Remembers window size and position
- Native Wayland support (works on X11 too)
- Your login stays on your machine in `~/.config/whatsapp-linux`

## Requirements

- Linux (tested on Ubuntu 26.04, GNOME, Wayland)
- Node.js 18 or newer and npm (only to install)
- For the tray icon on GNOME: the AppIndicator extension (enabled by default on Ubuntu)

## Install

```sh
git clone https://github.com/ZenelShabani/whatsapp-linux.git
cd whatsapp-linux
./install.sh
```

This installs into `~/.local/opt/whatsapp-linux`, adds a `whatsapp-linux` launcher, an app-grid entry, and pins it to the GNOME dock.

On Ubuntu 23.10 and newer, Chromium's sandbox is blocked unless the app has an AppArmor profile, so `install.sh` asks for sudo once to add one at `/etc/apparmor.d/whatsapp-linux`. Run `./install.sh --no-apparmor` to skip that; the app then runs without the sandbox.

## Develop

```sh
npm install
npm start
```

`npm run icons` regenerates the PNG icons in `assets/` from `scripts/make-icons.js`.

## Shortcuts

| Keys | Action |
| --- | --- |
| Ctrl+R | Reload |
| Ctrl+W | Hide window |
| Ctrl+Q | Quit |
| Ctrl+= / Ctrl+- / Ctrl+0 | Zoom in / out / reset |
| F11 | Fullscreen |
| Alt | Show the menu bar |

## Uninstall

```sh
./uninstall.sh            # add --purge to also delete your login session
```

## License

[MIT](LICENSE)
