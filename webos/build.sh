#!/bin/sh
#
# Copyright (c) 2026 MirraNET, Niklas Linz. All rights reserved.
#
# This file is part of the MirraNET project and is licensed under the
# GNU Lesser General Public License v3.0 (LGPLv3).
#
# You may use, distribute and modify this code under the terms
# of the LGPLv3 license. You should have received a copy of the
# license along with this file. If not, see <https://www.gnu.org/licenses/lgpl-3.0.html>
# or contact: niklas.linz@mirranet.de
#
# Builds FreeX TV for LG TVs (webOS 5 and newer, models from 2020 on):
#   build/webos/                                  the webOS web app (shared web client + appinfo.json)
#   build/de.mirranet.freex.tv_<v>_all.ipk        the package, with the webOS CLI (ares-package)
#
# The CLI is taken from PATH, otherwise run through npx (Node.js) from @webos-tools/cli.
# Install on a TV in developer mode: ares-install -d <tv> build/de.mirranet.freex.tv_<v>_all.ipk
#
set -eu

HERE=$(cd "$(dirname "$0")" && pwd -P)
ROOT=$(dirname "$HERE")
OUT="$ROOT/build"
APP="$OUT/webos"
VERSION=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$ROOT/web/version.json")

rm -rf "$APP"
mkdir -p "$APP"
cp -R "$ROOT/web/." "$APP/"
rm -f "$APP/blank.html"
cp "$HERE/icon.png" "$HERE/largeIcon.png" "$HERE/splash.png" "$APP/"
sed "s/@VERSION@/$VERSION/" "$HERE/appinfo.json" > "$APP/appinfo.json"
echo "webOS app: $APP"

if command -v ares-package >/dev/null 2>&1; then
    ares-package --no-minify -o "$OUT" "$APP"
elif command -v npx >/dev/null 2>&1; then
    npx --yes -p @webos-tools/cli ares-package --no-minify -o "$OUT" "$APP"
else
    echo "Neither ares-package nor npx found: install Node.js or the webOS CLI (npm install -g @webos-tools/cli)."
    exit 0
fi
echo "Package:   $(ls "$OUT"/*.ipk)"
