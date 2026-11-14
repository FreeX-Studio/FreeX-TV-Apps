# Changelog

## FreeX TV 1.1.0

- **LG TVs (webOS 5 and newer, models from 2020):** the shared interface as a webOS app (`.ipk`, `webos/build.sh`).
  Videos play in the TV's media pipeline, so MKV, HEVC, HDR and Dolby sound play directly; conversions run
  through hls.js with the codecs the TV reports for them
- Pointing with LG's Magic Remote (or a mouse) focuses buttons and cards
- Samsung: the Tizen archive contains the project files, so Tizen Studio can import it

## FreeX TV 1.0.0

First version of the TV apps for FreeX Media Server, for **Samsung Smart TVs** (Tizen 4.0+) and **Fire TV /
Android TV** (Fire OS 5 / Android 5.1+), with one shared interface:

- Connecting to a server by its address, sign-in with two-factor authentication, switching users with a PIN
- Home screen with the server's rows (*Continue watching*, *Up next*, *Recently added*) and a large preview of the
  focused title; libraries as poster grids with sorting and an *Unwatched* filter; watchlist; search
- Detail pages for movies, shows and episodes: resume or start over, seasons and episodes, mark as watched,
  watchlist, trailers and extras, cast
- Player for the remote: the device's own player (AVPlay on Samsung, ExoPlayer on Android) plays most files
  directly; seek previews, chapters in the seek bar, Skip intro and credits, *Next episode* with countdown, audio
  tracks, subtitles (text drawn by the app in the style from FreeX Web, picture subtitles burned in by the server),
  quality; progress is reported to the server like in FreeX Web
- German and English, following the user's display language in FreeX Web or the TV's language
