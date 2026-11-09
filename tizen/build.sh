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
# Builds FreeX TV for Samsung TVs:
#   build/tizen/                    the Tizen web project (shared web client + config.xml)
#   build/FreeX-TV-Tizen-<v>.zip    the same as an archive, to import into Tizen Studio
#   build/FreeX.wgt                 the signed package, if the Tizen CLI is installed
#
# Signing needs a certificate profile from Tizen Studio's Certificate Manager (a Samsung
# certificate that names your TV's DUID). Its name goes in TIZEN_PROFILE (default "FreeX").
#
set -eu

HERE=$(cd "$(dirname "$0")" && pwd -P)
ROOT=$(dirname "$HERE")
OUT="$ROOT/build"
APP="$OUT/tizen"
VERSION=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$ROOT/web/version.json")
PROFILE=${TIZEN_PROFILE:-FreeX}

rm -rf "$APP"
mkdir -p "$APP"
cp -R "$ROOT/web/." "$APP/"
rm -f "$APP/blank.html"
cp "$HERE/icon.png" "$APP/icon.png"
sed "s/@VERSION@/$VERSION/" "$HERE/config.xml" > "$APP/config.xml"
# Samsung's device APIs (AVPlay, product info) come from a script the TV provides.
sed -i.bak 's#<script src="vendor/hls.min.js"></script>#<script src="$WEBAPIS/webapis/webapis.js"></script>\n<script src="vendor/hls.min.js"></script>#' "$APP/index.html"
rm -f "$APP/index.html.bak"

(cd "$APP" && rm -f "$OUT/FreeX-TV-Tizen-$VERSION.zip" && zip -qr "$OUT/FreeX-TV-Tizen-$VERSION.zip" .)
echo "Tizen project: $APP"
echo "Archive:       $OUT/FreeX-TV-Tizen-$VERSION.zip"

TIZEN=${TIZEN_CLI:-$(command -v tizen || true)}
if [ -z "$TIZEN" ] && [ -x "$HOME/tizen-studio/tools/ide/bin/tizen" ]; then
    TIZEN="$HOME/tizen-studio/tools/ide/bin/tizen"
fi
if [ -n "$TIZEN" ]; then
    "$TIZEN" package -t wgt -s "$PROFILE" -- "$APP" -o "$OUT"
    echo "Package:       $(ls "$OUT"/*.wgt)"
else
    echo "Tizen CLI not found: import the project into Tizen Studio, or install the CLI to build FreeX.wgt."
fi
