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
 * The player screen: asks the server how to play a title, hands the URL to the platform's player
 * (see backends.js) and draws the controls, subtitles, seek previews, Skip intro and Up next over
 * the picture. Reports the position to the server like FreeX Web does.
 *
 * Remote: OK pauses or plays, Left/Right jump (faster when held), Up/Down show the controls,
 * Back hides them or closes the player. Media keys work everywhere.
 */
(function () {
    "use strict";

    const FX = window.FX;
    const h = FX.h;
    const t = FX.t;
    const Nav = window.FreeXNav;
    const P = window.FreeXPlatform;

    const PROGRESS_EVERY_MS = 10000;
    const OSD_HIDE_MS = 5000;
    const UP_NEXT_SECONDS = 12;

    /**
     * Opens the player. `opts.startMs`: where to start (undefined = resume where the user stopped),
     * `opts.onClose`: called when the player is closed.
     */
    async function open(itemId, opts) {
        opts = opts || {};
        let item;
        try {
            item = await FX.api("GET", "/api/items/" + encodeURIComponent(itemId));
        } catch (e) {
            FX.toast(e.message, true);
            return;
        }
        if (!item.media) {
            FX.toast(t("This title cannot be played."), true);
            return;
        }
        const prefs = (FX.S.user && FX.S.user.preferences) || {};
        const tracks = FX.defaultTracks(item.media, prefs);
        const resume = item.progress && !item.progress.watched ? item.progress.offsetMs : 0;
        new Player(item, {
            startMs: opts.startMs === undefined ? resume : opts.startMs,
            audio: tracks.audio,
            subtitle: tracks.sub,
            onClose: opts.onClose,
        });
    }

    function Player(item, o) {
        const self = this;
        const S = FX.S;
        const prefs = (S.user && S.user.preferences) || {};
        const state = {
            item,
            audio: o.audio,
            subtitle: o.subtitle,
            quality: "auto",
            plan: null,
            directPlay: true,
            triedHtml: false,
            cues: [],
            scrubMs: null,
            scrubStep: 0,
            lastScrub: 0,
            lastReport: 0,
            closed: false,
            upNextCancelled: false,
            upNextTimer: 0,
            upNextShownFor: null,
            loading: true,
            forceHtml: false,
        };

        // ---- DOM

        const subs = h("div", {class: "subtitles style-" + subtitleStyleClass(prefs.subtitleStyle)});
        const spinner = h("div", {class: "spinner"});
        const title = h("div", {class: "p-title"});
        const subtitle = h("div", {class: "p-sub"});
        const info = h("div", {class: "p-info"});
        const fill = h("div", {class: "fill"});
        const knob = h("div", {class: "knob"});
        const marks = h("div", {class: "marks"});
        const bar = h("div", {class: "bar"}, marks, fill, knob);
        const previewImg = h("div", {class: "pv-img"});
        const previewTime = h("div", {class: "pv-time"});
        const preview = h("div", {class: "preview", hidden: true}, previewImg, previewTime);
        const seek = h("div", {class: "seek f", onclick: () => commitScrub(true)}, bar, preview);
        const cur = h("span", {class: "cur"});
        const ends = h("span", {class: "ends"});
        const total = h("span", {class: "total"});
        const btnPlay = button("pause", t("Pause"), togglePause);
        const btnNext = button("next", t("Next episode"), () => playNext());
        const buttons = h("div", {class: "p-buttons"},
            btnPlay,
            button("back10", t("Back 10 s"), () => jump(-10000)),
            button("fwd30", t("Forward 30 s"), () => jump(30000)),
            h("span", {class: "spacer"}),
            button("audio", t("Audio"), audioMenu),
            button("subtitles", t("Subtitles"), subtitleMenu),
            button("quality", t("Quality"), qualityMenu),
            btnNext);
        const osd = h("div", {class: "osd"},
            h("div", {class: "osd-top"}, title, subtitle),
            h("div", {class: "osd-bottom"}, seek, h("div", {class: "times"}, cur, ends, total), buttons, info));
        const skipBtn = h("button", {class: "skip-btn f", hidden: true, onclick: skip});
        const upNext = h("div", {class: "up-next", hidden: true});
        const notice = h("div", {class: "p-notice", hidden: true});
        const el = h("div", {class: "player"}, subs, spinner, osd, skipBtn, upNext, notice);
        document.getElementById("app").appendChild(el);
        document.body.classList.add("video-mode");
        document.documentElement.classList.add("video-mode");

        function button(ic, label, fn) {
            return h("button", {class: "p-btn f", title: label, "aria-label": label, onclick: fn}, FX.icon(ic), h("span", {class: "tip"}, label));
        }

        // ---- the platform's player

        let backend = P.createBackend(onEvent, false);
        let tick = setInterval(update, 250);

        const layer = Nav.push({
            el,
            initial: () => (skipBtn.hidden ? seek : skipBtn),
            onKey,
            onBack: () => close(),
        });

        let osdTimer = 0;
        let osdVisible = false;

        function showOsd(focusSeek) {
            osd.classList.add("on");
            el.classList.add("osd-on");
            osdVisible = true;
            if (focusSeek || !Nav.focused || !el.contains(Nav.focused) || Nav.focused === skipBtn) Nav.focus(seek);
            clearTimeout(osdTimer);
            osdTimer = setTimeout(hideOsd, OSD_HIDE_MS);
        }

        function hideOsd(force) {
            if (force !== true && backend.paused() && !state.loading) {
                // stays visible while paused
                clearTimeout(osdTimer);
                osdTimer = setTimeout(hideOsd, OSD_HIDE_MS);
                return;
            }
            osd.classList.remove("on");
            el.classList.remove("osd-on");
            osdVisible = false;
            preview.hidden = true;
            if (!skipBtn.hidden) Nav.focus(skipBtn);
        }

        function poke() {
            if (osdVisible) {
                clearTimeout(osdTimer);
                osdTimer = setTimeout(hideOsd, OSD_HIDE_MS);
            }
        }

        function onKey(action) {
            if (state.closed) return true;
            switch (action) {
                case "playpause":
                    togglePause();
                    return true;
                case "play":
                    backend.play();
                    report("playing");
                    return true;
                case "pause":
                    backend.pause();
                    showOsd();
                    report("paused");
                    return true;
                case "stop":
                    close();
                    return true;
                case "ff":
                    scrub(+1, 30000);
                    return true;
                case "rw":
                    scrub(-1, 10000);
                    return true;
                case "next":
                    if (nextItem()) playNext();
                    return true;
                case "info":
                case "menu":
                    if (osdVisible) hideOsd(true);
                    else showOsd();
                    return true;
                default:
                    break;
            }
            if (!upNext.hidden && (action === "ok" || action === "back")) {
                if (action === "ok") playNext();
                else cancelUpNext();
                return true;
            }
            if (!osdVisible) {
                if (action === "left" || action === "right") {
                    scrub(action === "right" ? 1 : -1);
                    return true;
                }
                if (action === "up" || action === "down") {
                    showOsd(true);
                    return true;
                }
                if (action === "ok") {
                    if (!skipBtn.hidden && Nav.focused === skipBtn) {
                        skip();
                        return true;
                    }
                    togglePause();
                    showOsd(true);
                    return true;
                }
                if (action === "back") {
                    if (state.scrubMs !== null) {
                        cancelScrub();
                        return true;
                    }
                    return false; // closes the player
                }
                return false;
            }
            poke();
            if (Nav.focused === seek && (action === "left" || action === "right")) {
                scrub(action === "right" ? 1 : -1);
                return true;
            }
            if (Nav.focused === seek && action === "down") {
                Nav.focus(btnPlay);
                return true;
            }
            if (Nav.focused === seek && action === "ok") {
                if (state.scrubMs !== null) commitScrub(true);
                else togglePause();
                return true;
            }
            if (action === "back") {
                if (state.scrubMs !== null) cancelScrub();
                else hideOsd(true);
                return true;
            }
            return false;
        }

        // ---- loading

        async function start(atMs) {
            state.loading = true;
            spinner.hidden = false;
            notice.hidden = true;
            const old = state.plan;
            let plan;
            try {
                plan = await FX.api("POST", "/api/items/" + encodeURIComponent(item.id) + "/playback", {
                    caps: P.caps(state.directPlay),
                    quality: state.quality,
                    audio: state.audio,
                    subtitle: state.subtitle || undefined,
                    startMs: Math.max(0, Math.round(atMs || 0)),
                    client: S.clientId,
                    device: P.deviceName(),
                    tokenUrls: true,
                }, {timeout: 60000});
            } catch (e) {
                return fail(e.message);
            }
            if (state.closed) {
                if (plan.session) stopSession(plan.session);
                return;
            }
            if (old && old.session && old.session !== plan.session) stopSession(old.session);
            state.plan = plan;
            if (typeof plan.audio === "number") state.audio = plan.audio;
            info.textContent = modeLabel(plan);
            try {
                backend.stop();
                await backend.open(S.server + plan.url, {
                    hls: !!plan.session,
                    startMs: plan.startMs || 0,
                    uhd: (item.media.height || 0) > 1100 || (item.media.width || 0) > 2000,
                });
            } catch (e) {
                if (state.closed) return;
                return recover(e && e.message);
            }
            if (state.closed) return;
            state.loading = false;
            spinner.hidden = true;
            backend.play();
            report("playing", true);
            loadSubtitles();
            renderMarks();
            if (!osdVisible) showOsd(false);
        }

        /** A failed start: once without direct play, then (Samsung) once with the browser's player. */
        function recover(message) {
            const plan = state.plan;
            if (plan && plan.mode === "direct" && state.directPlay) {
                state.directPlay = false;
                return start(backend.position() || (plan && plan.startMs) || 0);
            }
            if (P.isTizen && !state.forceHtml && plan && plan.session) {
                state.forceHtml = true;
                backend.destroy();
                backend = P.createBackend(onEvent, true);
                return start(backend.position() || (plan && plan.startMs) || 0);
            }
            fail(t("The title cannot be played on this device.") + (message ? " (" + message + ")" : ""));
        }

        function fail(message) {
            state.loading = false;
            spinner.hidden = true;
            notice.hidden = false;
            FX.clear(notice).appendChild(h("div", null,
                h("p", null, message),
                h("div", {class: "row-buttons"},
                    h("button", {class: "btn f", onclick: () => start(backend.position() || 0)}, t("Try again")),
                    h("button", {class: "btn f", onclick: close}, t("Close")))));
            Nav.focus(notice.querySelector(".btn"));
        }

        function modeLabel(plan) {
            const mode = {direct: t("Direct play"), remux: t("Direct stream"), audio: t("Audio converted"), transcode: t("Converted")}[plan.mode] || plan.mode;
            return mode + (plan.reason ? " · " + plan.reason : "") + " · " + backend.name;
        }

        function stopSession(id) {
            FX.api("DELETE", "/api/transcode/" + encodeURIComponent(id)).catch(() => null);
        }

        // ---- events of the player

        function onEvent(e) {
            if (state.closed) return;
            if (e.type === "buffering") {
                spinner.hidden = !e.on;
            } else if (e.type === "state") {
                update();
            } else if (e.type === "ended") {
                ended();
            } else if (e.type === "error" && !state.loading) {
                recover(e.message);
            }
        }

        function position() {
            return state.scrubMs !== null ? state.scrubMs : backend.position();
        }

        function durationMs() {
            return backend.duration() || (state.plan && state.plan.durationMs) || item.media.durationMs || 0;
        }

        function update() {
            if (state.closed) return;
            const pos = backend.position();
            const dur = durationMs();
            const shown = position();
            const pct = dur ? Math.min(100, shown / dur * 100) : 0;
            fill.style.width = pct + "%";
            knob.style.left = pct + "%";
            cur.textContent = FX.clock(shown);
            total.textContent = FX.clock(dur);
            if (dur) {
                const end = new Date(Date.now() + (dur - pos));
                ends.textContent = t("ends at {0}", end.toLocaleTimeString(FreeXI18n.lang(), {hour: "2-digit", minute: "2-digit"}));
            }
            const icon = backend.paused() ? "play" : "pause";
            if (btnPlay.dataset.icon !== icon) {
                btnPlay.dataset.icon = icon;
                btnPlay.replaceChild(FX.icon(icon), btnPlay.firstChild);
            }
            renderCue(pos);
            markers(pos, dur);
            if (!state.loading && !backend.paused() && Date.now() - state.lastReport > PROGRESS_EVERY_MS) report("playing");
            if (state.scrubMs !== null && Date.now() - state.lastScrub > 1100) commitScrub(false);
        }

        // ---- seeking

        function scrub(dir, fixed) {
            if (state.loading) return;
            const now = Date.now();
            const quick = now - state.lastScrub < 450;
            state.scrubStep = quick ? state.scrubStep + 1 : 0;
            const steps = [10000, 10000, 10000, 20000, 30000, 30000, 60000, 60000, 120000];
            const step = fixed || steps[Math.min(state.scrubStep, steps.length - 1)];
            const base = state.scrubMs !== null ? state.scrubMs : backend.position();
            state.scrubMs = Math.max(0, Math.min(durationMs() - 2000, base + dir * step));
            state.lastScrub = now;
            showOsd(false);
            if (Nav.focused !== seek) Nav.focus(seek);
            showPreview(state.scrubMs);
            update();
        }

        function commitScrub() {
            if (state.scrubMs === null) return;
            const to = state.scrubMs;
            state.scrubMs = null;
            preview.hidden = true;
            backend.seek(to);
            report(backend.paused() ? "paused" : "playing", true);
        }

        function cancelScrub() {
            state.scrubMs = null;
            preview.hidden = true;
            update();
        }

        function jump(delta) {
            backend.seek(Math.max(0, Math.min(durationMs() - 2000, backend.position() + delta)));
            poke();
        }

        function togglePause() {
            if (state.loading) return;
            if (backend.paused()) {
                backend.play();
                report("playing", true);
            } else {
                backend.pause();
                report("paused", true);
            }
            update();
        }

        // Seek previews: one sprite sheet per title, frames in a grid.
        let sprite = null;

        function showPreview(ms) {
            const pv = item.previews;
            const dur = durationMs();
            preview.hidden = false;
            previewTime.textContent = FX.clock(ms);
            preview.style.left = (dur ? Math.min(100, ms / dur * 100) : 0) + "%";
            if (!pv || !pv.count) {
                previewImg.hidden = true;
                return;
            }
            previewImg.hidden = false;
            const scale = 320 / pv.width;
            const n = Math.min(pv.count - 1, Math.floor(ms / pv.intervalMs));
            previewImg.style.width = Math.round(pv.width * scale) + "px";
            previewImg.style.height = Math.round(pv.height * scale) + "px";
            previewImg.style.backgroundSize = (pv.columns * pv.width * scale) + "px " + (pv.rows * pv.height * scale) + "px";
            previewImg.style.backgroundPosition = -(n % pv.columns) * pv.width * scale + "px " + -Math.floor(n / pv.columns) * pv.height * scale + "px";
            if (!sprite) {
                sprite = FX.imageUrl("/api/items/" + encodeURIComponent(item.id) + "/previews?v=" + encodeURIComponent(pv.version || ""));
                sprite.then((u) => {
                    if (u) previewImg.style.backgroundImage = "url(\"" + u + "\")";
                });
            }
        }

        // ---- intro, credits, next episode

        function renderMarks() {
            FX.clear(marks);
            const dur = durationMs();
            const chapters = (item.media && item.media.chapters) || [];
            if (!dur) return;
            chapters.forEach((c) => {
                if (c.startMs > 0) marks.appendChild(h("i", {style: {left: c.startMs / dur * 100 + "%"}}));
            });
        }

        function nextItem() {
            return item.next || null;
        }

        function markers(pos, dur) {
            const mk = item.markers || {};
            let kind = null;
            if (mk.intro && pos >= mk.intro.startMs && pos < mk.intro.endMs - 1500) kind = "intro";
            else if (mk.credits && pos >= mk.credits.startMs && pos < mk.credits.endMs - 1500) kind = nextItem() ? "next" : "credits";
            if (!kind && !mk.credits && nextItem() && dur > 0 && dur - pos < 30000 && dur - pos > 1000) kind = "next";
            if (kind === "next" && !state.upNextCancelled && !state.loading && upNext.hidden && state.upNextShownFor !== item.id) {
                showUpNext();
            }
            if (kind === "next" && !upNext.hidden) kind = null; // the card has the button
            const label = {intro: t("Skip intro"), credits: t("Skip credits"), next: t("Next episode")}[kind];
            if (!kind) {
                if (!skipBtn.hidden) {
                    const hadFocus = Nav.focused === skipBtn;
                    skipBtn.hidden = true;
                    if (hadFocus) {
                        if (osdVisible) Nav.focus(seek);
                        else Nav.focus(seek, {noScroll: true});
                    }
                }
                return;
            }
            if (skipBtn.dataset.kind !== kind || skipBtn.hidden) {
                skipBtn.dataset.kind = kind;
                FX.clear(skipBtn).appendChild(FX.icon("skip"));
                skipBtn.appendChild(document.createTextNode(label));
                skipBtn.hidden = false;
                if (!osdVisible) Nav.focus(skipBtn);
            }
        }

        function skip() {
            const mk = item.markers || {};
            const kind = skipBtn.dataset.kind;
            if (kind === "intro" && mk.intro) backend.seek(mk.intro.endMs);
            else if (kind === "credits" && mk.credits) backend.seek(Math.max(0, mk.credits.endMs - 500));
            else if (kind === "next") playNext();
            skipBtn.hidden = true;
            report("playing", true);
        }

        function showUpNext() {
            const next = nextItem();
            if (!next) return;
            state.upNextShownFor = item.id;
            let left = UP_NEXT_SECONDS;
            const art = h("div", {class: "art"});
            FX.setArt(art, FX.artPath(next, "thumb"), "");
            const count = h("div", {class: "count"});
            const play = h("button", {class: "btn primary f", onclick: playNext}, FX.icon("play"), t("Play now"));
            const cancel = h("button", {class: "btn f", onclick: cancelUpNext}, t("Cancel"));
            FX.clear(upNext).appendChild(h("div", {class: "card"}, art, h("div", {class: "txt"},
                count,
                h("div", {class: "t"}, FX.episodeCode(next) + " · " + next.title),
                h("div", {class: "row-buttons"}, play, cancel))));
            upNext.hidden = false;
            hideOsd();
            Nav.focus(play);
            const tickCount = () => {
                count.textContent = t("Up next in {0} s", left);
                if (left-- <= 0) return playNext();
                state.upNextTimer = setTimeout(tickCount, 1000);
            };
            tickCount();
        }

        function cancelUpNext() {
            state.upNextCancelled = true;
            clearTimeout(state.upNextTimer);
            upNext.hidden = true;
            Nav.focus(seek, {noScroll: true});
        }

        function ended() {
            const dur = durationMs();
            report("playing", true, dur);
            if (nextItem() && !state.upNextCancelled) return playNext();
            close(true);
        }

        function playNext() {
            const next = nextItem();
            if (!next) return;
            clearTimeout(state.upNextTimer);
            const onClose = o.onClose;
            o.onClose = null;
            close(true, () => open(next.id, {startMs: next.progress && !next.progress.watched ? next.progress.offsetMs : 0, onClose}));
        }

        // ---- progress

        function report(st, now, offset) {
            if (!state.plan || item.type === "extra" && !now) return;
            state.lastReport = Date.now();
            const pos = offset !== undefined ? offset : backend.position();
            return FX.api("PUT", "/api/items/" + encodeURIComponent(item.id) + "/progress", {
                offsetMs: Math.round(pos), durationMs: Math.round(durationMs()), state: st, client: S.clientId, device: P.deviceName(),
            }).catch(() => null);
        }

        // ---- subtitles

        function subtitleTrack(id) {
            return (item.media.subtitles || []).filter((s) => s.id === id)[0] || null;
        }

        async function loadSubtitles() {
            state.cues = [];
            FX.clear(subs);
            const id = state.subtitle;
            const plan = state.plan;
            if (!id || !plan || plan.burnedSubtitle === id) return;
            const track = subtitleTrack(id);
            if (!track || !track.textBased) return;
            try {
                const vtt = await FX.text("/api/items/" + encodeURIComponent(item.id) + "/subtitles/" + encodeURIComponent(id) + ".vtt");
                if (state.subtitle === id) state.cues = parseVtt(vtt);
            } catch (e) {
                FX.toast(t("The subtitles could not be loaded."), true);
            }
        }

        let shownCue = null;

        function renderCue(pos) {
            const cues = state.cues;
            let cue = null;
            for (let i = 0; i < cues.length; i++) {
                if (cues[i].start <= pos && pos < cues[i].end) {
                    cue = cues[i];
                    break;
                }
                if (cues[i].start > pos) break;
            }
            if (cue === shownCue) return;
            shownCue = cue;
            FX.clear(subs);
            if (cue) cue.lines.forEach((l) => subs.appendChild(h("span", null, l)));
        }

        // ---- menus

        function audioMenu() {
            const list = (item.media.audio || []).map((a) => ({label: FX.audioLabel(a), value: a.index, on: a.index === state.audio}));
            if (list.length < 2) return FX.toast(t("This title has only one audio track."));
            menu(t("Audio"), list, (v) => {
                state.audio = v;
                start(backend.position());
            });
        }

        function subtitleMenu() {
            const list = [{label: t("Off"), value: null, on: !state.subtitle}].concat((item.media.subtitles || []).map((s) => ({
                label: FX.subtitleLabel(s) + (s.textBased ? "" : " · " + t("burned in")), value: s.id, on: s.id === state.subtitle,
            })));
            menu(t("Subtitles"), list, (v) => {
                const before = subtitleTrack(state.subtitle);
                const after = subtitleTrack(v);
                state.subtitle = v;
                // Picture subtitles are burned in by the server: that needs a new stream.
                const restream = (after && !after.textBased) || (before && !before.textBased) ||
                    (state.plan && state.plan.burnedSubtitle);
                if (restream) start(backend.position());
                else loadSubtitles();
            });
        }

        function qualityMenu() {
            const qs = (state.plan && state.plan.qualities) || [];
            const list = [{label: t("Automatic"), value: "auto", on: state.quality === "auto"}].concat(qs.map((q) => ({
                label: q.id === "original" ? t("Original") : q.label, value: q.id, on: state.quality === q.id,
            })));
            menu(t("Quality"), list, (v) => {
                state.quality = v;
                start(backend.position());
            });
        }

        function menu(heading, entries, pick) {
            clearTimeout(osdTimer);
            const items = entries.map((e) => h("button", {class: "menu-item f" + (e.on ? " on" : ""), onclick: () => {
                done();
                if (!e.on) pick(e.value);
            }}, h("span", {class: "mark"}, e.on ? FX.icon("check") : null), e.label));
            const sheet = h("div", {class: "sheet vscroll"}, h("h3", null, heading), items);
            const wrap = h("div", {class: "menu-layer"}, sheet);
            el.appendChild(wrap);
            const ml = Nav.push({el: wrap, initial: () => items.filter((i) => i.classList.contains("on"))[0] || items[0], onBack: done});

            function done() {
                Nav.pop(ml);
                wrap.remove();
                showOsd(false);
            }
        }

        // ---- closing

        function onVisibility() {
            if (document.hidden) {
                if (!backend.paused()) {
                    backend.pause();
                    report("paused", true);
                }
                if (backend.suspend) backend.suspend();
            } else if (backend.restore) {
                backend.restore();
                showOsd(true);
            }
        }

        document.addEventListener("visibilitychange", onVisibility);

        function close(silent, then) {
            if (state.closed) return;
            const pos = backend.position();
            if (state.plan) {
                FX.api("PUT", "/api/items/" + encodeURIComponent(item.id) + "/progress", {
                    offsetMs: Math.round(pos), durationMs: Math.round(durationMs()), state: "stopped", stopped: true, client: S.clientId,
                    device: P.deviceName(),
                }).catch(() => null);
                if (state.plan.session) stopSession(state.plan.session);
            }
            state.closed = true;
            clearInterval(tick);
            clearTimeout(osdTimer);
            clearTimeout(state.upNextTimer);
            document.removeEventListener("visibilitychange", onVisibility);
            backend.destroy();
            Nav.pop(layer);
            el.remove();
            document.body.classList.remove("video-mode");
            document.documentElement.classList.remove("video-mode");
            if (then) then();
            else if (o.onClose) o.onClose();
        }

        self.close = close;
        title.textContent = item.type === "episode" ? item.showTitle || item.title : item.title;
        subtitle.textContent = item.type === "episode" ? FX.episodeCode(item) + " · " + item.title : (item.year || "");
        btnNext.hidden = !nextItem();
        start(o.startMs);
    }

    function subtitleStyleClass(st) {
        st = st || {};
        return [st.size || "m", st.background || "box", st.position || "bottom", st.color || "white"].join(" style-");
    }

    // ---- WebVTT

    function parseTime(s) {
        const p = s.trim().split(":").map(Number);
        return p.length === 3 ? (p[0] * 3600 + p[1] * 60 + p[2]) * 1000 : (p[0] * 60 + p[1]) * 1000;
    }

    function parseVtt(text) {
        const cues = [];
        text.replace(/\r/g, "").split(/\n\n+/).forEach((block) => {
            const lines = block.split("\n");
            let i = -1;
            for (let k = 0; k < lines.length; k++) {
                if (lines[k].indexOf("-->") >= 0) {
                    i = k;
                    break;
                }
            }
            if (i < 0) return;
            const parts = lines[i].split("-->");
            const start = parseTime(parts[0]);
            const end = parseTime(parts[1].trim().split(/\s+/)[0]);
            const body = lines.slice(i + 1).map((l) => l.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")).filter((l) => l.trim());
            if (body.length && isFinite(start) && isFinite(end)) cues.push({start, end, lines: body});
        });
        cues.sort((a, b) => a.start - b.start);
        return cues;
    }

    window.FreeXPlayer = {open, parseVtt};
})();
