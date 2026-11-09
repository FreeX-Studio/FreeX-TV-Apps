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
 * Core of FreeX TV: state, storage, the API client, artwork loading and small helpers.
 *
 * The app runs from its own origin (a packaged Tizen app, the assets of the Android app), so every
 * request goes across origins with the sign-in token in the X-FreeX-Token header. Artwork is loaded
 * the same way and shown from blob URLs, because the server never sends the sign-in cookie there.
 *
 * Plain ES2017 without modules: Samsung TVs from 2019 on run Chromium 63 and newer.
 */
(function () {
    "use strict";

    const STORE = "freex-tv";

    /** What is kept between starts: server, token, user, the id of this device. */
    function load() {
        try {
            return JSON.parse(localStorage.getItem(STORE) || "{}") || {};
        } catch (e) {
            return {};
        }
    }

    const saved = load();
    const S = {
        server: saved.server || "",
        token: saved.token || "",
        user: saved.user || null,
        clientId: saved.clientId || ("tv-" + Math.random().toString(36).slice(2) + Date.now().toString(36)),
        serverName: saved.serverName || "",
        platform: "html",
    };

    function persist() {
        try {
            localStorage.setItem(STORE, JSON.stringify({
                server: S.server, token: S.token, user: S.user, clientId: S.clientId, serverName: S.serverName,
            }));
        } catch (e) {
            // storage full or not available: the app still works for this start
        }
    }

    // ------------------------------------------------------------------ DOM

    /** Creates an element: h("div", {class: "x", onclick: f}, child, "text", [more]). */
    function h(tag, attrs) {
        const el = document.createElement(tag);
        if (attrs) {
            for (const k in attrs) {
                const v = attrs[k];
                if (v === undefined || v === null || v === false) continue;
                if (k.slice(0, 2) === "on" && typeof v === "function") el.addEventListener(k.slice(2), v);
                else if (k === "class") el.className = v;
                else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
                else if (k === "dataset") Object.assign(el.dataset, v);
                else if (v === true) el.setAttribute(k, "");
                else el.setAttribute(k, v);
            }
        }
        for (let i = 2; i < arguments.length; i++) append(el, arguments[i]);
        return el;
    }

    function append(el, c) {
        if (c === undefined || c === null || c === false) return;
        if (Array.isArray(c)) c.forEach((x) => append(el, x));
        else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    }

    function clear(el) {
        while (el.firstChild) el.removeChild(el.firstChild);
        return el;
    }

    /** Line icons, drawn with currentColor. */
    const ICONS = {
        play: '<path d="M8 5.5v13l11-6.5z" fill="currentColor"/>',
        pause: '<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/>',
        restart: '<path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
        check: '<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
        plus: '<path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
        search: '<circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M16 16l4.5 4.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
        home: '<path d="M4 11l8-6.5 8 6.5V20h-5.5v-5.5h-5V20H4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
        movie: '<rect x="3.5" y="5" width="17" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3.5 9.5h17M8 5v4.5M12 5v4.5M16 5v4.5" stroke="currentColor" stroke-width="2"/>',
        tv: '<rect x="3" y="5.5" width="18" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8.5 21h7M9 2.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
        bookmark: '<path d="M6.5 4h11v16.5l-5.5-4-5.5 4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
        gear: '<circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M5.5 18.5l1.8-1.8M16.7 7.3l1.8-1.8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
        audio: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
        subtitles: '<rect x="3" y="5" width="18" height="14" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 12.5h4M13 12.5h4M7 15.5h7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
        quality: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="16" cy="7" r="2.2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="8" cy="17" r="2.2" fill="none" stroke="currentColor" stroke-width="2"/>',
        next: '<path d="M5.5 5.5v13l9-6.5zM17 5.5h2.5v13H17z" fill="currentColor"/>',
        back10: '<path d="M5 12a7 7 0 1 0 2.1-5M5 3.5v4h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><text x="12" y="15.2" font-size="7.5" text-anchor="middle" fill="currentColor" font-family="sans-serif" font-weight="700">10</text>',
        fwd30: '<path d="M19 12a7 7 0 1 1-2.1-5M19 3.5v4h-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><text x="12" y="15.2" font-size="7.5" text-anchor="middle" fill="currentColor" font-family="sans-serif" font-weight="700">30</text>',
        skip: '<path d="M4 6l7 6-7 6zM12 6l7 6-7 6z" fill="currentColor"/>',
        user: '<circle cx="12" cy="8.5" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
        exit: '<path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
        server: '<rect x="4" y="4" width="16" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/><rect x="4" y="13" width="16" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="8" cy="7.5" r="1.2" fill="currentColor"/><circle cx="8" cy="16.5" r="1.2" fill="currentColor"/>',
        info: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 11v5.5M12 7.6v.1" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
        sort: '<path d="M7 4v16M3.5 16.5L7 20l3.5-3.5M17 20V4M13.5 7.5L17 4l3.5 3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
        filter: '<path d="M4 5.5h16l-6.2 7.5v5.5l-3.6 1.8V13z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
        list: '<path d="M8.5 6.5h11M8.5 12h11M8.5 17.5h11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="4.8" cy="6.5" r="1.3" fill="currentColor"/><circle cx="4.8" cy="12" r="1.3" fill="currentColor"/><circle cx="4.8" cy="17.5" r="1.3" fill="currentColor"/>',
    };

    function icon(name) {
        const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        s.setAttribute("viewBox", "0 0 24 24");
        s.setAttribute("class", "icon");
        s.setAttribute("aria-hidden", "true");
        s.innerHTML = ICONS[name] || "";
        return s;
    }

    let toastTimer = 0;

    function toast(msg, isError) {
        const el = document.getElementById("toast");
        el.textContent = msg;
        el.className = isError ? "error" : "";
        el.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.hidden = true, 4200);
    }

    // ------------------------------------------------------------------ server address

    /**
     * Turns what the user typed into the base URL of a server: adds http:// and the default port
     * 32500 when they are missing, drops a trailing slash or path.
     */
    function normalizeServer(input) {
        let s = String(input || "").trim();
        if (!s) return "";
        if (!/^https?:\/\//i.test(s)) s = "http://" + s;
        let u;
        try {
            u = new URL(s);
        } catch (e) {
            return "";
        }
        const explicitPort = /^https?:\/\/(\[[^\]]+\]|[^/:]+):\d+/i.test(s);
        if (!explicitPort && u.protocol === "http:") u.port = "32500";
        return u.protocol + "//" + u.host;
    }

    // ------------------------------------------------------------------ API

    class ApiError extends Error {
        constructor(status, message, code) {
            super(message);
            this.status = status;
            this.code = code || "";
        }
    }

    /** Called when the server no longer accepts the token (signed out on another device, expired). */
    let onSignedOut = null;

    function headers(json) {
        const hd = {"Accept-Language": FreeXI18n.lang()};
        if (S.token) hd["X-FreeX-Token"] = S.token;
        if (json) hd["Content-Type"] = "application/json";
        return hd;
    }

    function url(path) {
        return /^https?:/i.test(path) ? path : S.server + path;
    }

    /** A JSON request; rejects with an ApiError that carries the server's translated message. */
    async function api(method, path, body, opts) {
        opts = opts || {};
        let res;
        const ctrl = typeof AbortController === "function" ? new AbortController() : null;
        const timer = ctrl ? setTimeout(() => ctrl.abort(), opts.timeout || 30000) : 0;
        try {
            res = await fetch(url(path), {
                method,
                headers: headers(body !== undefined),
                credentials: "omit",
                body: body === undefined ? undefined : JSON.stringify(body),
                signal: ctrl ? ctrl.signal : undefined,
            });
        } catch (e) {
            throw new ApiError(0, FreeXI18n.t("The server cannot be reached"));
        } finally {
            clearTimeout(timer);
        }
        if (res.status === 204) return null;
        let data = null;
        try {
            data = await res.json();
        } catch (e) {
            data = null;
        }
        if (!res.ok) {
            if (res.status === 401 && S.token && !/^\/api\/(login|switch)/.test(path) && onSignedOut) onSignedOut();
            throw new ApiError(res.status, (data && data.error) || FreeXI18n.t("Error {0}", res.status), data && data.code);
        }
        return data;
    }

    /** A text resource (subtitles) with the token. */
    async function text(path) {
        const res = await fetch(url(path), {headers: headers(false), credentials: "omit"});
        if (!res.ok) throw new ApiError(res.status, FreeXI18n.t("Error {0}", res.status));
        return res.text();
    }

    // ------------------------------------------------------------------ artwork

    /*
     * Artwork comes as blobs: a few requests at a time, kept in a small cache whose oldest entries
     * are released again, so long lists do not fill the TV's memory.
     */
    const imageCache = new Map(); // url -> Promise<objectURL|null>
    const IMAGE_CACHE_SIZE = 260;
    const queue = [];
    let running = 0;
    const MAX_PARALLEL = 6;

    function pump() {
        while (running < MAX_PARALLEL && queue.length) {
            const job = queue.shift();
            if (job.cancelled && job.cancelled()) {
                job.resolve(null);
                continue;
            }
            running++;
            fetch(url(job.path), {headers: headers(false), credentials: "omit"})
                .then((r) => r.ok ? r.blob() : null)
                .then((b) => job.resolve(b ? URL.createObjectURL(b) : null))
                .catch(() => job.resolve(null))
                .then(() => {
                    running--;
                    pump();
                });
        }
    }

    function imageUrl(path, cancelled) {
        let p = imageCache.get(path);
        if (p) {
            // most recently used goes to the end
            imageCache.delete(path);
            imageCache.set(path, p);
            return p;
        }
        p = new Promise((resolve) => {
            queue.push({path, resolve, cancelled});
            pump();
        });
        imageCache.set(path, p);
        p.then((u) => {
            if (!u) imageCache.delete(path);
        });
        while (imageCache.size > IMAGE_CACHE_SIZE) {
            const oldest = imageCache.keys().next().value;
            const op = imageCache.get(oldest);
            imageCache.delete(oldest);
            op.then((u) => u && setTimeout(() => URL.revokeObjectURL(u), 60000));
        }
        return p;
    }

    /** Path of an item's artwork; the art version keeps a changed picture from being cached. */
    function artPath(item, kind) {
        const id = typeof item === "string" ? item : item.id;
        const v = typeof item === "object" && item.artVersion ? "?v=" + encodeURIComponent(item.artVersion) : "";
        return "/api/items/" + encodeURIComponent(id) + "/image/" + kind + v;
    }

    /** Sets a CSS background (or an <img> source) as soon as the picture is there. */
    function setArt(el, path, fallbackText) {
        el.dataset.art = path;
        return imageUrl(path, () => !el.isConnected).then((u) => {
            if (el.dataset.art !== path) return;
            if (u) {
                if (el.tagName === "IMG") el.src = u;
                else el.style.backgroundImage = "url(\"" + u + "\")";
                el.classList.add("loaded");
            } else if (fallbackText !== undefined) {
                el.classList.add("missing");
                if (!el.querySelector(".fallback")) el.appendChild(h("span", {class: "fallback"}, fallbackText));
            }
        });
    }

    /*
     * Lazy artwork: elements with data-lazy get their picture once they come near the screen.
     */
    let observer = null;
    if (typeof IntersectionObserver === "function") {
        observer = new IntersectionObserver((entries) => {
            entries.forEach((e) => {
                if (!e.isIntersecting) return;
                observer.unobserve(e.target);
                const el = e.target;
                setArt(el, el.dataset.lazy, el.dataset.fallback || "");
            });
        }, {rootMargin: "600px 900px"});
    }

    function lazyArt(el, path, fallbackText) {
        if (!observer) return setArt(el, path, fallbackText);
        el.dataset.lazy = path;
        el.dataset.fallback = fallbackText || "";
        observer.observe(el);
    }

    // ------------------------------------------------------------------ formatting

    function t() {
        return FreeXI18n.t.apply(null, arguments);
    }

    function clock(ms) {
        ms = Math.max(0, Math.round((ms || 0) / 1000));
        const hh = Math.floor(ms / 3600);
        const mm = Math.floor(ms % 3600 / 60);
        const ss = ms % 60;
        const p = (n) => (n < 10 ? "0" : "") + n;
        return hh ? hh + ":" + p(mm) + ":" + p(ss) : mm + ":" + p(ss);
    }

    function duration(ms) {
        const min = Math.round((ms || 0) / 60000);
        if (min < 60) return FreeXI18n.t("{0} min", min);
        return FreeXI18n.t("{0} h {1} min", Math.floor(min / 60), min % 60);
    }

    function episodeCode(it) {
        if (!it || it.type !== "episode") return "";
        const s = it.seasonIndex === 0 ? "Special" : "S" + (it.seasonIndex == null ? "?" : it.seasonIndex);
        return s + " E" + it.index;
    }

    // ISO 639-2 codes as the files have them, mapped to the two letters of the preferences.
    const LANG3 = {
        ger: "de", deu: "de", eng: "en", fre: "fr", fra: "fr", spa: "es", ita: "it", jpn: "ja", kor: "ko", chi: "zh",
        zho: "zh", rus: "ru", por: "pt", dut: "nl", nld: "nl", pol: "pl", tur: "tr", swe: "sv", dan: "da", nor: "no",
        fin: "fi", cze: "cs", ces: "cs", hun: "hu", gre: "el", ell: "el", ara: "ar", heb: "he", hin: "hi", ukr: "uk",
    };

    function normLang(code) {
        const c = String(code || "").toLowerCase();
        return LANG3[c] || c;
    }

    function language(code) {
        if (!code) return FreeXI18n.t("Unknown");
        const c = normLang(code);
        try {
            if (Intl.DisplayNames) {
                const name = new Intl.DisplayNames([FreeXI18n.lang()], {type: "language"}).of(c);
                if (name && name.toLowerCase() !== c) return name.charAt(0).toUpperCase() + name.slice(1);
            }
        } catch (e) {
            // not a valid code
        }
        const known = {de: "Deutsch", en: "English", fr: "Français", es: "Español", it: "Italiano", ja: "日本語"};
        return known[c] || String(code).toUpperCase();
    }

    const CODECS = {aac: "AAC", ac3: "Dolby Digital", eac3: "Dolby Digital+", truehd: "TrueHD", dts: "DTS", flac: "FLAC",
        mp3: "MP3", opus: "Opus", vorbis: "Vorbis", subrip: "SRT", srt: "SRT", ass: "ASS", ssa: "SSA", webvtt: "VTT",
        hdmv_pgs_subtitle: "PGS", dvd_subtitle: "VobSub", mov_text: "Text"};

    function codecName(c) {
        c = String(c || "").toLowerCase();
        return CODECS[c] || c.toUpperCase();
    }

    function channels(n) {
        return n >= 8 ? "7.1" : n >= 6 ? "5.1" : n === 1 ? "Mono" : n === 2 ? "Stereo" : n ? n + " ch" : "";
    }

    function audioLabel(a) {
        return [language(a.language), a.title && !/^(stereo|surround|5\.1|7\.1)$/i.test(a.title) ? "(" + a.title + ")" : "",
            (codecName(a.codec) + " " + channels(a.channels)).trim()].filter(Boolean).join(" ");
    }

    function subtitleLabel(s) {
        const parts = [language(s.language)];
        if (s.forced) parts.push(FreeXI18n.t("forced"));
        if (s.title && !s.forced) parts.push(s.title);
        return parts.join(", ") + " (" + codecName(s.codec) + ")";
    }

    /**
     * The tracks to start with: audio in the preferred language (otherwise the file's default),
     * subtitles as set in the preferences. The same rules as in FreeX Web.
     */
    function defaultTracks(media, prefs) {
        prefs = prefs || {};
        const audioPref = prefs.audioLanguage || "";
        const subLang = prefs.subtitleLanguage || audioPref || FreeXI18n.lang();
        const mode = prefs.subtitleMode || "forced";
        const audios = media.audio || [];
        let audio = audios.filter((a) => a.default)[0] || audios[0];
        if (audioPref) {
            const matching = audios.filter((a) => normLang(a.language) === audioPref);
            if (matching.length) audio = matching.filter((a) => a.default)[0] || matching[0];
        }
        const subs = (media.subtitles || []).filter((s) => normLang(s.language) === subLang);
        const full = subs.filter((s) => !s.forced && s.textBased)[0] || subs.filter((s) => !s.forced)[0];
        const forced = subs.filter((s) => s.forced)[0];
        const audioLang = audio ? normLang(audio.language) : "";
        let sub = null;
        if (mode === "always") sub = full || forced;
        else if (mode === "foreign" && audioLang && audioLang !== subLang) sub = full || forced;
        else if (mode !== "off") sub = forced;
        return {audio: audio ? audio.index : -1, sub: sub ? sub.id : null};
    }

    window.FX = {
        S, persist, h, clear, icon, toast, normalizeServer, api, text, ApiError, imageUrl, artPath, setArt, lazyArt,
        clock, duration, episodeCode, normLang, language, audioLabel, subtitleLabel, defaultTracks, t,
        set onSignedOut(f) {
            onSignedOut = f;
        },
    };
})();
