<p align="center">
  <img src="web/img/logo.svg" alt="FreeX" width="110">
</p>

<h1 align="center">FreeX TV</h1>

<p align="center">
  <strong>The TV apps for <a href="https://github.com/FreeX-Studio/freex-media-server">FreeX Media Server</a>:
  Samsung Smart TVs (Tizen), LG TVs (webOS) and Fire TV / Android TV.</strong>
</p>

FreeX TV brings your FreeX library to the big screen: the home screen with *Continue watching*, *Up next* and
*Recently added*, your libraries, the watchlist and search, detail pages with seasons and episodes, and a player
made for the remote, with seek previews, Skip intro, *Next episode*, subtitles, audio tracks and quality.

Both apps share one interface (`web/`). Videos are played by the device's own player, so most files play directly,
without conversion on the server:

| Platform | Interface | Player | Plays directly |
|---|---|---|---|
| **Samsung Smart TV** (Tizen 4.0+, models from 2018) | packaged web app | **AVPlay**, the TV's player | MKV, MP4, TS, AVI; H.264, HEVC (also 10-bit and HDR), VP9/AV1 where the TV has the decoder; AAC, MP3, Dolby Digital (Plus), FLAC, DTS where supported |
| **LG TV** (webOS 5+, models from 2020) | packaged web app | the TV's media pipeline through `<video>` | MKV, MP4, TS; H.264, HEVC (also 10-bit and HDR), VP9/AV1 where the TV has the decoder; AAC, MP3, Dolby Digital (Plus), FLAC, DTS where supported |
| **Fire TV / Android TV** (Fire OS 5 / Android 5.1+) | WebView with the same interface | **ExoPlayer** (Media3) | what the device's decoders report (checked at runtime), Dolby/DTS as passthrough to the TV or receiver |

Whatever the device cannot decode, the server converts on the fly, as for FreeX Web.

## Requirements

- **FreeX Media Server with the TV API**: CORS for apps and stream URLs with an access token
  ([freex-media-server#2](https://github.com/FreeX-Studio/freex-media-server/pull/2), in the release after 0.21.0).
  Older servers answer the app's requests with "cross-site" errors.
- The TV and the server in the same network, or the server reachable from the internet (HTTPS through a reverse
  proxy works too).

## Installing

### Fire TV and Android TV

1. On the Fire TV: *Settings → My Fire TV → Developer options*, switch on **ADB debugging** and **Apps from unknown
   sources** (on newer models: allow it for the app you install with, e.g. *Downloader*).
2. Install `FreeX-TV-Android-<version>.apk` from the [releases](../../releases):
   - with ADB from a computer: `adb connect <ip-of-the-fire-tv>` and `adb install FreeX-TV-Android-<version>.apk`, or
   - with the *Downloader* app and the link to the APK.
3. Start **FreeX**, enter the address of your server (e.g. `192.168.1.10`; without a port, `32500` is used) and
   sign in.

On Android TV (Google TV, Shield, …) it is the same: allow unknown sources and install the APK.

### Samsung Smart TV

Samsung TVs only install apps from the Samsung store or, in developer mode, apps signed with your own Samsung
certificate:

1. Install [Tizen Studio](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/installing-tv-sdk.html)
   with the *Samsung TV Extension*.
2. On the TV: open *Apps*, type `1 2 3 4 5` on the remote, switch on **Developer mode** and enter the IP address of
   your computer. Restart the TV.
3. In Tizen Studio: *Device Manager* → add the TV by its IP address. *Certificate Manager* → create a **Samsung**
   certificate profile (Samsung account), with the TV's DUID added.
4. Build and install:

   ```bash
   TIZEN_PROFILE=<your profile> tizen/build.sh      # → build/FreeX.wgt
   tizen install -n build/FreeX.wgt -t <tv-name>    # name as in the Device Manager / `sdb devices`
   ```

   Without the CLI: unpack `FreeX-TV-Tizen-<version>.zip` (from the releases or `tizen/build.sh`), import it in
   Tizen Studio as a Tizen web project and use *Run As → Tizen Web Application*.

### LG TV

LG TVs install your own apps in developer mode, without a certificate:

1. On the TV, install **Developer Mode** from the LG Content Store and sign in with an LG developer account
   (free at [webostv.developer.lge.com](https://webostv.developer.lge.com)). Switch on **Dev Mode Status** and
   **Key Server**, then restart the TV. Developer mode runs out after a while; the app shows the time left and
   extends it (**Extend**).
2. On your computer, install the webOS CLI: `npm install -g @webos-tools/cli`.
3. Add the TV (its IP, user `prisoner`, port 9922) and fetch its key with the passphrase shown in the Developer
   Mode app:

   ```bash
   ares-setup-device -a lgtv -i "host=<ip-of-the-tv>" -i "port=9922" -i "username=prisoner"
   ares-novacom --device lgtv --getkey
   ```

4. Install `de.mirranet.freex.tv_<version>_all.ipk` (from the releases or `webos/build.sh`):

   ```bash
   ares-install --device lgtv de.mirranet.freex.tv_<version>_all.ipk
   ares-launch --device lgtv de.mirranet.freex.tv
   ```

## Remote control

| Key | Lists and pages | Player |
|---|---|---|
| Arrows | move | ← → jump 10 s back / forward (faster when held), ↑ ↓ show the controls |
| OK | open, choose | pause / play; *Skip intro* when it is shown |
| Back | back; on the home screen to the menu bar, then *Close FreeX?* | hide the controls, then close the player |
| ⏯ ⏪ ⏩ ⏹ | – | play/pause, −10 s, +30 s, close |
| Magic Remote pointer (LG) | points at buttons and cards; OK clicks | the same on the controls |
| ⏭ | – | next episode |

Audio and subtitle languages, the subtitle style and the default qualities at home and on the go are taken from the
user's settings in FreeX Web.

## How it works

```
┌──────────────── web/ (shared) ────────────────┐
│ screens.js  connect, sign-in, home, libraries, │
│             details, search, watchlist, …      │      FreeX Media Server
│ player.js   controls, subtitles, Skip intro,   │  ──  /api (JSON, token in X-FreeX-Token)
│             progress reports                   │      /api/cast/{token}/…  stream URLs with
│ nav.js      remote keys, spatial navigation    │      their own token for native players
│ backends.js AVPlay │ ExoPlayer │ <video> (LG) │
└────────────────────────────────────────────────┘
      │ Samsung: packaged Tizen app (tizen/)
      │ LG: packaged webOS app (webos/)
      │ Android: WebView + ExoPlayer under it (android/)
```

- The interface runs from the app itself, not from the server. It calls the API across origins with the sign-in
  token in a header; the server allows that for apps (CORS without credentials). Artwork is loaded the same way and
  shown from blob URLs.
- For playback the app asks `POST /api/items/{id}/playback` with the device's capabilities and `"tokenUrls": true`.
  The answer is a URL with its own access token for the file or the HLS conversion, which the native players load
  without headers.
- Picture subtitles (PGS, VobSub) are burned in by the server; text subtitles are drawn by the app.

## Building

| | |
|---|---|
| Android | `cd android && ./gradlew assembleRelease` (JDK 17, Android SDK 35) → `android/app/build/outputs/apk/release/app-release.apk`. Signed with the debug key unless `FREEX_KEYSTORE`, `FREEX_KEYSTORE_PASSWORD`, `FREEX_KEY_ALIAS` and `FREEX_KEY_PASSWORD` name a release keystore. |
| LG | `webos/build.sh` → `build/webos/` and `build/de.mirranet.freex.tv_<version>_all.ipk` (with Node.js; the webOS CLI comes through npx when it is not installed). |
| Samsung | `tizen/build.sh` → `build/tizen/` (the project) and `build/FreeX-TV-Tizen-<version>.zip`; with the Tizen CLI also the signed `build/FreeX.wgt`. |
| CI | GitHub Actions (`.github/workflows/build.yml`) builds all three on every push; a tag `v*` publishes a release. A `Jenkinsfile` does the same on a Jenkins agent with the Android SDK. |

The interface can be developed in any browser: serve `web/` (e.g. `python3 -m http.server -d web 8088`), open it at
1920 × 1080 and use the arrow keys, Enter and Escape. It then plays with `<video>` and hls.js.

The version is kept in `web/version.json` (and `APP_VERSION` in `web/js/screens.js`); the Android version code
is derived from it.

## Project structure

| Path | |
|---|---|
| `web/` | The shared TV interface: `index.html`, `css/tv.css`, `js/` (see above), the logo, the font Manrope, hls.js |
| `tizen/` | `config.xml`, the app icon and `build.sh` for Samsung TVs |
| `webos/` | `appinfo.json`, icons, splash screen and `build.sh` for LG TVs |
| `android/` | The Android app (Kotlin): `MainActivity` (WebView, keys), `NativePlayer` (ExoPlayer), `Bridge` (`FreeXNative` for the page, device capabilities) |

## License

FreeX TV is free software under the [GNU Lesser General Public License v3.0](LICENSE).

It bundles the font Manrope (SIL Open Font License) and [hls.js](https://github.com/video-dev/hls.js) (Apache 2.0);
their licenses are in `web/fonts/` and `web/vendor/`. The Android app uses AndroidX Media3 and WebKit (Apache 2.0).
