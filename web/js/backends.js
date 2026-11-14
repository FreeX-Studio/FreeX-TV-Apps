/*
 * Copyright (c) 2026 MirraNET, Niklas Linz. All rights reserved.
 *
 * This file is part of the MirraNET project and is licensed under the
 * GNU Lesser General Public License v3.0 (LGPLv3).
 *
 * You may use, distribute and modify this code under the terms
 * of the LGPLv3 license. You should have received a copy of the
 * license along with this file. If not, see <https://www.gnu.org/licenses/lgpl-3.0.html>
 * or contact: niklas.linz@mirranet.de
 */

/*
 * The platforms FreeX TV runs on, and their video players.
 *
 *  - Samsung (Tizen): AVPlay, the TV's own player. It plays MKV, HEVC, HDR and Dolby/DTS sound
 *    directly and draws the picture behind the page.
 *  - Android TV / Fire TV: ExoPlayer (Media3) in the app around the page, reached through the
 *    bridge object FreeXNative; it also draws behind the page.
 *  - LG (webOS 5+, TVs from 2020): <video>, which webOS hands to the TV's media pipeline, so it
 *    plays MKV, HEVC and Dolby sound directly; conversions through hls.js.
 *  - Any browser (for development, and as fallback on Tizen): <video> with hls.js.
 *
 * Every backend has the same shape: open(url, {hls, startMs, uhd}) → Promise, play(), pause(),
 * seek(ms), stop(), position(), duration(), paused(), and calls onEvent({type: "ready" | "time" |
 * "buffering" | "ended" | "error", ...}).
 */
(function () {
    "use strict";

    const isTizen = typeof window.tizen === "object" && typeof window.webapis === "object" && !!window.webapis.avplay;
    const isAndroid = typeof window.FreeXNative === "object" && window.FreeXNative !== null;
    const isWebOS = !isTizen && !isAndroid && (typeof window.PalmSystem === "object" || /Web0S|webOS/.test(navigator.userAgent));
    const platform = isTizen ? "tizen" : isAndroid ? "android" : isWebOS ? "webos" : "html";

    // ------------------------------------------------------------------ capabilities

    /** What the browser engine reports, as the server's playback decision expects it. */
    function browserCaps() {
        const v = document.createElement("video");
        const can = (type) => v.canPlayType(type) !== "";
        const mseOk = !!(window.MediaSource && MediaSource.isTypeSupported);
        const mse = (type) => mseOk && MediaSource.isTypeSupported(type);
        const either = (type) => can(type) || mse(type);
        const video = ["h264"];
        if (either('video/mp4; codecs="hvc1.1.6.L120.90"') || either('video/mp4; codecs="hev1.1.6.L120.90"')) video.push("hevc");
        if (either('video/webm; codecs="vp9"') || either('video/mp4; codecs="vp09.00.10.08"')) video.push("vp9");
        if (either('video/mp4; codecs="av01.0.08M.08"')) video.push("av1");
        const audio = ["aac", "mp3"];
        if (either('audio/mp4; codecs="ac-3"')) audio.push("ac3");
        if (either('audio/mp4; codecs="ec-3"')) audio.push("eac3");
        if (either('audio/mp4; codecs="opus"') || either('audio/webm; codecs="opus"')) audio.push("opus");
        if (either('audio/mp4; codecs="flac"') || can("audio/flac")) audio.push("flac");
        if (either('audio/webm; codecs="vorbis"')) audio.push("vorbis");
        const containers = ["mp4"];
        if (can("video/webm")) containers.push("webm");
        if (can("video/x-matroska") || /Chrome\//.test(navigator.userAgent)) containers.push("mkv");
        return {containers, video, audio, mseVideo: video.filter((c) => c !== "vp9"), mseAudio: audio.filter((c) => c !== "vorbis")};
    }

    /**
     * Samsung TVs: AVPlay decodes far more than the browser engine says. MKV, MP4, TS and AVI,
     * H.264 and HEVC everywhere, VP9/AV1 where the engine has the decoder; Dolby sound always,
     * DTS only on models that report it.
     */
    function tizenCaps() {
        const b = browserCaps();
        const video = ["h264", "hevc", "mpeg4", "mpeg2video", "vc1"];
        if (b.video.indexOf("vp9") >= 0) video.push("vp9");
        if (b.video.indexOf("av1") >= 0) video.push("av1");
        const audio = ["aac", "mp3", "ac3", "eac3", "flac", "vorbis", "opus", "mp2", "pcm_s16le", "pcm_s24le", "pcm_s16be"];
        try {
            if (window.MediaSource && MediaSource.isTypeSupported('audio/mp4; codecs="dtsc"')) audio.push("dts");
        } catch (e) {
            // no answer: leave DTS to the server
        }
        return {
            containers: ["mp4", "mkv", "webm", "mpegts", "ts", "avi", "mov"],
            video, audio,
            mseVideo: ["h264", "hevc"],
            mseAudio: ["aac", "mp3", "ac3", "eac3"],
        };
    }

    /**
     * LG TVs: the <video> element plays through the TV's media pipeline. MKV, TS and MP4, H.264
     * and HEVC everywhere, VP9/AV1 where the engine reports it; Dolby sound always, DTS only on
     * models that report it (LG left it out from 2020 to 2022).
     */
    function webosCaps() {
        const b = browserCaps();
        const v = document.createElement("video");
        const can = (type) => v.canPlayType(type) !== "";
        const video = ["h264", "hevc", "mpeg2video", "mpeg4"];
        if (b.video.indexOf("vp9") >= 0) video.push("vp9");
        if (b.video.indexOf("av1") >= 0) video.push("av1");
        const audio = ["aac", "mp3", "ac3", "eac3", "flac", "opus", "vorbis", "mp2", "pcm_s16le", "pcm_s24le"];
        if (can('audio/mp4; codecs="dtsc"') || can("audio/vnd.dts")) audio.push("dts");
        return {
            containers: ["mp4", "mkv", "webm", "mpegts", "ts", "mov"],
            video, audio,
            // Conversions run through hls.js (Media Source): only what the engine reports there.
            mseVideo: mseList({h264: 'video/mp4; codecs="avc1.640028"', hevc: 'video/mp4; codecs="hvc1.1.6.L120.90"',
                av1: 'video/mp4; codecs="av01.0.08M.08"'}),
            mseAudio: mseList({aac: 'audio/mp4; codecs="mp4a.40.2"', mp3: 'audio/mpeg', ac3: 'audio/mp4; codecs="ac-3"',
                eac3: 'audio/mp4; codecs="ec-3"'}),
        };
    }

    function mseList(types) {
        const out = [];
        for (const k in types) {
            try {
                if (window.MediaSource && MediaSource.isTypeSupported(types[k])) out.push(k);
            } catch (e) {
                // not supported
            }
        }
        return out;
    }

    function caps(directPlay) {
        let c;
        if (isAndroid) {
            try {
                c = JSON.parse(window.FreeXNative.capabilities());
            } catch (e) {
                c = browserCaps();
            }
        } else if (isTizen) {
            c = tizenCaps();
        } else if (isWebOS) {
            c = webosCaps();
        } else {
            c = browserCaps();
        }
        c.directPlay = directPlay !== false;
        return c;
    }

    /** Name of this device for the server's activity view. */
    function deviceName() {
        try {
            if (isAndroid) return window.FreeXNative.deviceName();
            if (isWebOS) return "LG TV";
            if (isTizen) {
                const model = window.webapis.productinfo && window.webapis.productinfo.getRealModel ? window.webapis.productinfo.getRealModel() : "";
                return "Samsung TV" + (model ? " " + model : "");
            }
        } catch (e) {
            // fall through
        }
        return "FreeX TV (Browser)";
    }

    function exitApp() {
        try {
            if (isTizen) return window.tizen.application.getCurrentApplication().exit();
            if (isAndroid) return window.FreeXNative.exit();
            if (isWebOS && window.webOS && window.webOS.platformBack) return window.webOS.platformBack();
        } catch (e) {
            // nothing to close in a browser
        }
        window.close();
    }

    /** Media keys that Tizen only passes on after registering them. */
    function registerKeys() {
        if (!isTizen) return;
        ["MediaPlayPause", "MediaPlay", "MediaPause", "MediaStop", "MediaFastForward", "MediaRewind",
            "MediaTrackNext", "MediaTrackPrevious", "Info"].forEach((k) => {
            try {
                window.tizen.tvinputdevice.registerKey(k);
            } catch (e) {
                // key not on this model
            }
        });
    }

    // ------------------------------------------------------------------ <video> + hls.js

    function HtmlBackend(onEvent) {
        const layer = document.getElementById("video-layer");
        const v = document.createElement("video");
        v.className = "html-video";
        v.crossOrigin = "anonymous";
        v.setAttribute("playsinline", "");
        layer.appendChild(v);
        let hls = null;
        let ended = false;
        v.addEventListener("timeupdate", () => onEvent({type: "time"}));
        v.addEventListener("waiting", () => onEvent({type: "buffering", on: true}));
        v.addEventListener("playing", () => onEvent({type: "buffering", on: false}));
        v.addEventListener("pause", () => onEvent({type: "state"}));
        v.addEventListener("play", () => onEvent({type: "state"}));
        v.addEventListener("ended", () => {
            if (!ended) {
                ended = true;
                onEvent({type: "ended"});
            }
        });
        v.addEventListener("error", () => onEvent({type: "error", message: v.error ? "MEDIA_ERR " + v.error.code : "error"}));

        return {
            name: "html",
            open(url, o) {
                ended = false;
                return new Promise((resolve, reject) => {
                    const start = (o.startMs || 0) / 1000;
                    const done = () => {
                        v.removeEventListener("loadedmetadata", done);
                        if (!hls && start > 0) v.currentTime = start;
                        resolve();
                    };
                    v.addEventListener("loadedmetadata", done);
                    if (o.hls && window.Hls && window.Hls.isSupported()) {
                        hls = new window.Hls({
                            startPosition: start,
                            maxBufferLength: 60,
                            backBufferLength: 90,
                            fragLoadingTimeOut: 70000,
                            manifestLoadingTimeOut: 35000,
                        });
                        let retries = 0;
                        hls.on(window.Hls.Events.ERROR, (e, d) => {
                            if (!d.fatal) return;
                            if (d.type === window.Hls.ErrorTypes.MEDIA_ERROR && retries++ < 2) return hls.recoverMediaError();
                            if (d.type === window.Hls.ErrorTypes.NETWORK_ERROR && retries++ < 4) return setTimeout(() => hls && hls.startLoad(), 1000 * retries);
                            onEvent({type: "error", message: d.details || "hls"});
                            reject(new Error(d.details || "hls"));
                        });
                        hls.loadSource(url);
                        hls.attachMedia(v);
                    } else {
                        v.src = url;
                    }
                });
            },
            play() {
                const p = v.play();
                if (p && p.catch) p.catch(() => null);
            },
            pause() {
                v.pause();
            },
            seek(ms) {
                v.currentTime = Math.max(0, ms / 1000);
            },
            stop() {
                if (hls) {
                    hls.destroy();
                    hls = null;
                }
                v.removeAttribute("src");
                try {
                    v.load();
                } catch (e) {
                    // already gone
                }
            },
            destroy() {
                this.stop();
                v.remove();
            },
            position: () => v.currentTime * 1000,
            duration: () => (isFinite(v.duration) ? v.duration * 1000 : 0),
            paused: () => v.paused,
        };
    }

    // ------------------------------------------------------------------ Samsung AVPlay

    function TizenBackend(onEvent) {
        const av = window.webapis.avplay;
        const layer = document.getElementById("video-layer");
        let obj = document.getElementById("av-player");
        if (!obj) {
            obj = document.createElement("object");
            obj.id = "av-player";
            obj.type = "application/avplayer";
            layer.appendChild(obj);
        }
        let paused = false;
        let pos = 0;
        let ended = false;

        function state() {
            try {
                return av.getState();
            } catch (e) {
                return "NONE";
            }
        }

        function listen() {
            av.setListener({
                onbufferingstart: () => onEvent({type: "buffering", on: true}),
                onbufferingprogress: () => null,
                onbufferingcomplete: () => onEvent({type: "buffering", on: false}),
                oncurrentplaytime: (ms) => {
                    pos = ms;
                    onEvent({type: "time"});
                },
                onstreamcompleted: () => {
                    if (ended) return;
                    ended = true;
                    onEvent({type: "ended"});
                },
                onerror: (e) => onEvent({type: "error", message: String(e)}),
                onevent: () => null,
                onsubtitlechange: () => null,
                ondrmevent: () => null,
            });
        }

        return {
            name: "avplay",
            open(url, o) {
                ended = false;
                paused = false;
                pos = o.startMs || 0;
                return new Promise((resolve, reject) => {
                    try {
                        if (state() !== "NONE") av.close();
                        av.open(url);
                        listen();
                        av.setDisplayRect(0, 0, 1920, 1080);
                        try {
                            av.setDisplayMethod("PLAYER_DISPLAY_MODE_LETTER_BOX");
                        } catch (e) {
                            // older models: letter box is the default
                        }
                        if (o.uhd) {
                            try {
                                av.setStreamingProperty("SET_MODE_4K", "TRUE");
                            } catch (e) {
                                // not a 4K model
                            }
                        }
                        // Buffer a few seconds more over the network than the default.
                        try {
                            av.setBufferingParam("PLAYER_BUFFER_FOR_PLAY", "PLAYER_BUFFER_SIZE_IN_SECOND", 6);
                            av.setBufferingParam("PLAYER_BUFFER_FOR_RESUME", "PLAYER_BUFFER_SIZE_IN_SECOND", 12);
                        } catch (e) {
                            // not supported
                        }
                        av.prepareAsync(() => {
                            const go = () => resolve();
                            if (o.startMs > 0) {
                                try {
                                    av.seekTo(Math.round(o.startMs), go, go);
                                    return;
                                } catch (e) {
                                    // starts at 0 then
                                }
                            }
                            go();
                        }, (e) => reject(new Error(String(e))));
                    } catch (e) {
                        reject(e);
                    }
                });
            },
            play() {
                try {
                    av.play();
                    paused = false;
                    onEvent({type: "state"});
                } catch (e) {
                    // not ready
                }
            },
            pause() {
                try {
                    av.pause();
                    paused = true;
                    onEvent({type: "state"});
                } catch (e) {
                    // not playing
                }
            },
            seek(ms) {
                pos = Math.max(0, ms);
                try {
                    av.seekTo(Math.round(pos), () => onEvent({type: "time"}), () => null);
                } catch (e) {
                    // not seekable yet
                }
            },
            stop() {
                try {
                    if (state() !== "NONE") {
                        av.stop();
                        av.close();
                    }
                } catch (e) {
                    // closed already
                }
            },
            destroy() {
                this.stop();
            },
            /** The TV leaves the app (Home key): the player has to let go of the decoder. */
            suspend() {
                try {
                    av.suspend();
                } catch (e) {
                    // nothing open
                }
            },
            restore() {
                try {
                    av.restore();
                } catch (e) {
                    // nothing open
                }
            },
            position: () => pos,
            duration() {
                try {
                    return av.getDuration();
                } catch (e) {
                    return 0;
                }
            },
            paused: () => paused,
        };
    }

    // ------------------------------------------------------------------ Android / Fire TV

    /** ExoPlayer in the Android app; it reports back through window.FreeXNativeEvent. */
    function AndroidBackend(onEvent) {
        const n = window.FreeXNative;
        let st = {position: 0, duration: 0, playing: false};
        let pending = null;
        window.FreeXNativeEvent = (e) => {
            if (e.position !== undefined) st.position = e.position;
            if (e.duration !== undefined && e.duration > 0) st.duration = e.duration;
            if (e.playing !== undefined) st.playing = e.playing;
            if (e.type === "ready" && pending) {
                pending.resolve();
                pending = null;
                return;
            }
            if (e.type === "error" && pending) {
                pending.reject(new Error(e.message || "error"));
                pending = null;
            }
            onEvent(e);
        };
        return {
            name: "exoplayer",
            open(url, o) {
                st = {position: o.startMs || 0, duration: 0, playing: false};
                return new Promise((resolve, reject) => {
                    pending = {resolve, reject};
                    n.open(JSON.stringify({url, hls: !!o.hls, startMs: Math.round(o.startMs || 0)}));
                });
            },
            play: () => n.play(),
            pause: () => n.pause(),
            seek(ms) {
                st.position = Math.max(0, ms);
                n.seek(Math.round(st.position));
            },
            stop: () => n.stop(),
            destroy() {
                n.stop();
            },
            position: () => st.position,
            duration: () => st.duration,
            paused: () => !st.playing,
        };
    }

    function createBackend(onEvent, forceHtml) {
        if (!forceHtml && isTizen) return TizenBackend(onEvent);
        if (!forceHtml && isAndroid) return AndroidBackend(onEvent);
        return HtmlBackend(onEvent);
    }

    window.FreeXPlatform = {platform, caps, deviceName, exitApp, registerKeys, createBackend, isTizen, isAndroid, isWebOS};
})();
