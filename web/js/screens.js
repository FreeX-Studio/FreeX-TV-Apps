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
 * The screens of FreeX TV: connecting to a server, signing in, the main view with its tabs (home,
 * libraries, watchlist, search, settings) and the detail page of a movie, show or episode.
 *
 * A screen is {el, initial, onBack, onKey, refresh}; app.js stacks them (FreeXApp.push / pop).
 */
(function () {
    "use strict";

    const FX = window.FX;
    const h = FX.h;
    const t = FX.t;
    const Nav = window.FreeXNav;
    const P = window.FreeXPlatform;

    const App = () => window.FreeXApp;

    const APP_VERSION = "1.1.0";

    // ------------------------------------------------------------------ building blocks

    function logo(cls) {
        return h("img", {class: "logo " + (cls || ""), src: "img/logo.svg", alt: "FreeX"});
    }

    function btn(label, onclick, opts) {
        opts = opts || {};
        return h("button", {class: "btn f" + (opts.primary ? " primary" : "") + (opts.cls ? " " + opts.cls : ""), onclick},
            opts.icon ? FX.icon(opts.icon) : null, label ? h("span", null, label) : null);
    }

    function field(label, attrs) {
        const input = h("input", Object.assign({class: "f", spellcheck: "false", autocomplete: "off", autocapitalize: "off"}, attrs));
        return {input, el: h("label", {class: "field"}, h("span", null, label), input)};
    }

    /** Subtitle line of a card: year, number of episodes, episode code. */
    function caption(it) {
        if (it.type === "episode") return FX.episodeCode(it);
        if (it.type === "show") return it.leafCount ? episodes(it.leafCount) : it.year || "";
        if (it.type === "season") return it.leafCount ? episodes(it.leafCount) : "";
        return it.year || "";
    }

    function episodes(n) {
        return n === 1 ? t("1 episode") : t("{0} episodes", n);
    }

    function progressOf(it) {
        const p = it.progress;
        const dur = it.media && it.media.durationMs;
        if (!p || p.watched || !p.offsetMs || !dur) return 0;
        return Math.min(1, p.offsetMs / dur);
    }

    /** A focusable card: "poster" (2:3) or "land" (16:9 with the episode picture). */
    function card(it, style, onclick) {
        const land = style === "land";
        const art = h("div", {class: "art"});
        let kind = "poster";
        if (land) kind = it.type === "episode" ? "thumb" : "backdrop";
        FX.lazyArt(art, FX.artPath(it, kind), it.type === "episode" && land ? it.showTitle || it.title : it.title);
        const p = progressOf(it);
        const unwatched = (it.type === "show" || it.type === "season") && it.leafCount ? it.leafCount - (it.viewedLeafCount || 0) : 0;
        const watched = it.type === "show" || it.type === "season" ? it.leafCount > 0 && unwatched === 0 : it.progress && it.progress.watched;
        const title = land && it.type === "episode" ? it.showTitle || it.title : it.title;
        const sub = land && it.type === "episode" ? FX.episodeCode(it) + " · " + it.title : caption(it);
        const c = h("div", {class: "card f " + (land ? "land" : "poster"), onclick: onclick || (() => openItem(it))},
            art,
            unwatched > 0 ? h("span", {class: "badge"}, String(unwatched)) : null,
            watched ? h("span", {class: "badge done"}, FX.icon("check")) : null,
            p > 0 ? h("div", {class: "prog"}, h("i", {style: {width: (p * 100).toFixed(1) + "%"}})) : null,
            h("div", {class: "cap"}, h("div", {class: "t"}, title), h("div", {class: "s"}, String(sub || ""))));
        c._item = it;
        return c;
    }

    function row(title, items, style) {
        const cards = items.map((it) => card(it, style));
        return h("section", {class: "row", "data-scroll-anchor": ""},
            h("h2", null, title),
            h("div", {class: "cards hscroll", "data-remember": ""}, cards));
    }

    function openItem(it) {
        if (it.type === "season") return App().push(details(it.showId || it.parentId, {season: it.id}));
        App().push(details(it.id));
    }

    function loading() {
        return h("div", {class: "loading"}, h("div", {class: "spinner"}));
    }

    function empty(text) {
        return h("div", {class: "empty"}, text);
    }

    function errorBox(e, retry) {
        return h("div", {class: "empty"}, h("p", null, e.message || String(e)), retry ? btn(t("Try again"), retry, {primary: true}) : null);
    }

    function meta(it) {
        const parts = [];
        if (it.type === "episode" && it.metadata && it.metadata.airDate) parts.push(it.metadata.airDate.slice(0, 4));
        else if (it.year) parts.push(String(it.year));
        const cr = (it.metadata && it.metadata.contentRating) || it.contentRating;
        if (cr) parts.push(h("span", {class: "pill"}, cr));
        if (it.media && it.media.durationMs) parts.push(FX.duration(it.media.durationMs));
        if (it.type === "show" && it.childCount) parts.push(it.childCount === 1 ? t("1 season") : t("{0} seasons", it.childCount));
        if (it.rating) parts.push("★ " + Number(it.rating).toFixed(1));
        if (it.media && it.media.resolution) parts.push(h("span", {class: "pill"}, it.media.resolution));
        if (it.media && it.media.hdr) parts.push(h("span", {class: "pill"}, it.media.doviProfile ? "Dolby Vision" : String(it.media.hdr).toUpperCase()));
        const out = h("div", {class: "meta"});
        parts.forEach((p, i) => {
            if (i) out.appendChild(h("span", {class: "dot"}, "·"));
            out.appendChild(typeof p === "string" ? h("span", null, p) : p);
        });
        return out;
    }

    /** A small modal with a question and buttons. Resolves with the index of the button. */
    function dialog(text, buttons) {
        return new Promise((resolve) => {
            const bs = buttons.map((b, i) => btn(b, () => done(i), {primary: i === 0}));
            const box = h("div", {class: "dialog"}, h("div", {class: "box"}, h("p", null, text), h("div", {class: "row-buttons"}, bs)));
            document.getElementById("app").appendChild(box);
            const layer = Nav.push({el: box, initial: bs[0], onBack: () => done(-1)});

            function done(i) {
                Nav.pop(layer);
                box.remove();
                resolve(i);
            }
        });
    }

    // ------------------------------------------------------------------ connect

    function connect() {
        const f = field(t("Server address"), {type: "url", placeholder: "192.168.1.10:32500", value: FX.S.server.replace(/^http:\/\//, "")});
        const msg = h("p", {class: "msg"});
        const go = btn(t("Connect"), submit, {primary: true});
        f.input.addEventListener("tvsubmit", () => setTimeout(() => Nav.focus(go), 0));
        const el = h("div", {class: "screen center"},
            h("div", {class: "panel"},
                logo("big"),
                h("h1", null, t("Connect to your FreeX server")),
                h("p", {class: "muted"}, t("Enter the address of your FreeX Media Server, e.g. 192.168.1.10 or media.example.org. Without a port, 32500 is used.")),
                f.el, msg, h("div", {class: "row-buttons"}, go)));

        async function submit() {
            const server = FX.normalizeServer(f.input.value);
            if (!server) {
                msg.textContent = t("Please enter a valid address.");
                return Nav.focus(f.input);
            }
            msg.textContent = t("Connecting …");
            let status;
            try {
                const ctrl = typeof AbortController === "function" ? new AbortController() : null;
                const timer = ctrl ? setTimeout(() => ctrl.abort(), 10000) : 0;
                const res = await fetch(server + "/api/status", {credentials: "omit", signal: ctrl ? ctrl.signal : undefined});
                clearTimeout(timer);
                status = await res.json();
            } catch (e) {
                msg.textContent = t("No FreeX server answers at {0}.", server);
                return;
            }
            if (status.setupRequired) {
                msg.textContent = t("This server is not set up yet. Open {0} in a browser and create the admin account first.", server);
                return;
            }
            if (server !== FX.S.server) {
                FX.S.token = "";
                FX.S.user = null;
            }
            FX.S.server = server;
            FX.S.serverName = status.name || "FreeX";
            FX.persist();
            App().reset(login());
        }

        return {el, initial: f.input.value ? go : f.input, onBack: () => App().exit()};
    }

    // ------------------------------------------------------------------ sign-in

    function login() {
        const user = field(t("Username"), {type: "text", autocomplete: "username"});
        const pass = field(t("Password"), {type: "password", autocomplete: "current-password"});
        const msg = h("p", {class: "msg"});
        const go = btn(t("Sign in"), submit, {primary: true});
        user.input.addEventListener("tvsubmit", () => setTimeout(() => Nav.focus(pass.input), 0));
        pass.input.addEventListener("tvsubmit", () => setTimeout(() => Nav.focus(go), 0));
        const server = btn(t("Change server"), () => App().reset(connect()));
        const el = h("div", {class: "screen center"},
            h("div", {class: "panel"},
                logo("big"),
                h("h1", null, t("Sign in to {0}", FX.S.serverName || "FreeX")),
                h("p", {class: "muted"}, FX.S.server),
                user.el, pass.el, msg, h("div", {class: "row-buttons"}, go, server)));

        async function submit() {
            msg.textContent = t("Signing in …");
            let res;
            try {
                res = await FX.api("POST", "/api/login", {username: user.input.value.trim(), password: pass.input.value});
            } catch (e) {
                msg.textContent = e.message;
                return;
            }
            if (res.twoFactorRequired) return App().reset(secondFactor(res.challenge));
            App().signedIn(res);
        }

        return {el, initial: user.input, onBack: () => App().exit()};
    }

    function secondFactor(challenge) {
        const code = field(t("Code from your authenticator app or a recovery code"), {type: "text", inputmode: "numeric"});
        const msg = h("p", {class: "msg"});
        const go = btn(t("Confirm"), submit, {primary: true});
        code.input.addEventListener("tvsubmit", () => setTimeout(() => Nav.focus(go), 0));
        const el = h("div", {class: "screen center"},
            h("div", {class: "panel"}, logo("big"), h("h1", null, t("Two-factor authentication")), code.el, msg,
                h("div", {class: "row-buttons"}, go, btn(t("Back"), () => App().reset(login())))));

        async function submit() {
            try {
                App().signedIn(await FX.api("POST", "/api/login/verify", {challenge, code: code.input.value.replace(/\s+/g, "")}));
            } catch (e) {
                msg.textContent = e.message;
            }
        }

        return {el, initial: code.input, onBack: () => App().reset(login())};
    }

    // ------------------------------------------------------------------ main view

    /** The main view: a menu bar on top and the content of the chosen tab below. */
    function main() {
        const content = h("div", {class: "content"});
        const tabs = h("nav", {class: "topbar", "data-remember": ""});
        const el = h("div", {class: "screen main"}, h("div", {class: "topbar-wrap"}, logo("small"), tabs,
            h("div", {class: "who"}, FX.icon("user"), h("span", null, FX.S.user ? FX.S.user.username : ""))), content);
        let current = null;
        let currentKey = "";
        let libraries = [];
        const screen = {
            el,
            initial: () => (current && current.initial ? current.initial() : null) || tabs.querySelector(".on"),
            onKey: (a, ev) => current && current.onKey ? current.onKey(a, ev) : false,
            onBack,
            refresh: () => current && current.refresh && current.refresh(),
        };

        function tab(key, label, ic) {
            return h("button", {class: "tab f", dataset: {key}, onclick: () => show(key)}, ic ? FX.icon(ic) : null, h("span", null, label));
        }

        function buildTabs() {
            FX.clear(tabs);
            tabs.appendChild(tab("search", t("Search"), "search"));
            tabs.appendChild(tab("home", t("Home"), "home"));
            libraries.forEach((l) => tabs.appendChild(tab("library:" + l.id, l.name, l.type === "shows" ? "tv" : "movie")));
            tabs.appendChild(tab("watchlist", t("Watchlist"), "bookmark"));
            tabs.appendChild(tab("settings", t("Settings"), "gear"));
            markTab();
        }

        function markTab() {
            Array.prototype.forEach.call(tabs.children, (b) => {
                b.classList.toggle("on", b.dataset.key === currentKey);
                // Up from the content lands on the open tab.
                if (b.dataset.key === currentKey) tabs._last = b;
            });
        }

        function show(key, keepFocus) {
            if (current && current.destroy) current.destroy();
            currentKey = key;
            markTab();
            if (key === "home") current = home();
            else if (key === "watchlist") current = watchlist();
            else if (key === "search") current = search();
            else if (key === "settings") current = settings();
            else current = library(libraries.filter((l) => "library:" + l.id === key)[0]);
            FX.clear(content).appendChild(current.el);
            el.classList.toggle("with-hero", !!current.hero);
            if (!keepFocus) setTimeout(() => {
                const first = current.initial && current.initial();
                if (first) Nav.focus(first);
            }, 0);
        }

        function onBack() {
            const f = Nav.focused;
            if (f && !tabs.contains(f)) {
                Nav.focus(tabs.querySelector(".on") || tabs.firstChild);
                content.querySelectorAll(".vscroll").forEach((v) => v.scrollTop = 0);
                return;
            }
            if (currentKey !== "home") return show("home");
            dialog(t("Close FreeX?"), [t("Close"), t("Cancel")]).then((i) => {
                if (i === 0) App().exit();
            });
        }

        FX.api("GET", "/api/libraries").then((ls) => {
            libraries = ls || [];
            buildTabs();
        }).catch(() => buildTabs());
        buildTabs();
        show("home");
        return screen;
    }

    // ------------------------------------------------------------------ home

    function home() {
        const hero = h("div", {class: "hero"});
        const heroArt = h("div", {class: "hero-art"});
        const heroText = h("div", {class: "hero-text"});
        hero.appendChild(heroArt);
        hero.appendChild(heroText);
        const rows = h("div", {class: "rows vscroll", "data-align": "start", "data-offset": "0.5"}, loading());
        const el = h("div", {class: "tabview home"}, hero, rows);
        let heroTimer = 0;
        let heroItem = null;

        el.addEventListener("tvfocus", (e) => {
            const c = e.target.closest && e.target.closest(".card");
            if (!c || !c._item) return;
            clearTimeout(heroTimer);
            heroTimer = setTimeout(() => setHero(c._item), 180);
        });

        function setHero(it) {
            if (heroItem === it) return;
            heroItem = it;
            heroArt.classList.remove("loaded");
            FX.setArt(heroArt, FX.artPath(it.type === "episode" && it.showId ? it.showId : it, "backdrop"));
            FX.clear(heroText).appendChild(h("h1", null, it.type === "episode" ? it.showTitle || it.title : it.title));
            if (it.type === "episode") heroText.appendChild(h("div", {class: "ep"}, FX.episodeCode(it) + " · " + it.title));
            heroText.appendChild(meta(it));
            if (it.summary) heroText.appendChild(h("p", {class: "summary"}, it.summary));
        }

        /** Loads the rows; `again` keeps the focus on the same title (or place) after the player. */
        async function load(again) {
            const f = Nav.focused;
            const had = again && f && el.contains(f) && f._item ? {hub: f.closest(".row").dataset.hub, id: f._item.id,
                index: Array.prototype.indexOf.call(f.parentNode.children, f)} : null;
            try {
                const hubs = await FX.api("GET", "/api/hubs");
                FX.clear(rows);
                const nonEmpty = (hubs || []).filter((hub) => hub.items && hub.items.length);
                if (!nonEmpty.length) return rows.appendChild(empty(t("Nothing here yet. Add libraries to your server in FreeX Web.")));
                nonEmpty.forEach((hub) => {
                    const r = row(hub.title, hub.items, hub.style === "landscape" ? "land" : "poster");
                    r.dataset.hub = hub.key;
                    rows.appendChild(r);
                });
                rows.appendChild(h("div", {class: "rows-end"}));
                let target = null;
                if (had) {
                    const r = rows.querySelector('.row[data-hub="' + had.hub + '"]');
                    const cards = r ? r.querySelectorAll(".card") : [];
                    target = Array.prototype.filter.call(cards, (c) => c._item.id === had.id)[0] || cards[Math.min(had.index, cards.length - 1)] || null;
                }
                const first = target || rows.querySelector(".card");
                if (!first) return;
                setHero(first._item);
                // Focus moves into the rows unless the user is in the menu bar meanwhile.
                const now = Nav.focused;
                if (!now || !now.isConnected || el.contains(now) || had) Nav.focus(first);
            } catch (e) {
                FX.clear(rows).appendChild(errorBox(e, () => load()));
            }
        }

        load();
        return {
            el, hero: true,
            initial: () => rows.querySelector(".card") || rows.querySelector(".btn"),
            refresh: () => load(true),
            destroy: () => clearTimeout(heroTimer),
        };
    }

    // ------------------------------------------------------------------ library

    const SORTS = [
        {key: "title", order: "asc", label: "Title"},
        {key: "added", order: "desc", label: "Recently added"},
        {key: "year", order: "desc", label: "Year"},
        {key: "rating", order: "desc", label: "Rating"},
    ];

    function library(lib) {
        if (!lib) return {el: empty(t("This library is gone.")), initial: () => null};
        let sort = 0;
        let unwatchedOnly = false;
        const sortBtn = btn("", () => {
            sort = (sort + 1) % SORTS.length;
            load();
        }, {icon: "sort"});
        const filterBtn = btn("", () => {
            unwatchedOnly = !unwatchedOnly;
            load();
        }, {icon: "filter"});
        const count = h("span", {class: "muted"});
        const grid = h("div", {class: "grid"});
        const body = h("div", {class: "vscroll lib-body"}, grid);
        const el = h("div", {class: "tabview library"}, h("div", {class: "lib-head"}, h("h1", null, lib.name), count, h("span", {class: "spacer"}), sortBtn, filterBtn), body);
        let items = [];
        let shown = 0;
        const CHUNK = 60;

        function more() {
            const end = Math.min(items.length, shown + CHUNK);
            for (let i = shown; i < end; i++) grid.appendChild(card(items[i], "poster"));
            shown = end;
        }

        // Cards are added in pieces while the user scrolls down.
        grid.addEventListener("tvfocus", (e) => {
            const index = Array.prototype.indexOf.call(grid.children, e.target);
            if (shown < items.length && index > shown - 24) more();
        });

        function label(b, text) {
            const span = b.querySelector("span");
            if (span) span.textContent = text;
            else b.appendChild(h("span", null, text));
        }

        async function load() {
            const s = SORTS[sort];
            label(sortBtn, t(s.label));
            label(filterBtn, unwatchedOnly ? t("Unwatched") : t("All"));
            FX.clear(grid).appendChild(loading());
            try {
                const res = await FX.api("GET", "/api/libraries/" + encodeURIComponent(lib.id) + "/items?sort=" + s.key + "&order=" + s.order +
                    (unwatchedOnly ? "&watched=unwatched" : ""));
                items = res.items || [];
                shown = 0;
                FX.clear(grid);
                count.textContent = items.length === 1 ? t("1 title") : t("{0} titles", items.length);
                if (!items.length) grid.appendChild(empty(t("No titles.")));
                more();
                body.scrollTop = 0;
            } catch (e) {
                FX.clear(grid).appendChild(errorBox(e, load));
            }
        }

        load();
        // Back from a title the grid stays as it was, with the focus where it was.
        return {el, initial: () => grid.querySelector(".card") || sortBtn};
    }

    // ------------------------------------------------------------------ watchlist

    function watchlist() {
        const grid = h("div", {class: "grid"}, loading());
        const el = h("div", {class: "tabview library"}, h("div", {class: "lib-head"}, h("h1", null, t("Watchlist"))), h("div", {class: "vscroll lib-body"}, grid));

        async function load() {
            try {
                const items = await FX.api("GET", "/api/watchlist");
                FX.clear(grid);
                if (!items || !items.length) grid.appendChild(empty(t("Your watchlist is empty. Add movies and shows on their page.")));
                (items || []).forEach((it) => grid.appendChild(card(it, "poster")));
            } catch (e) {
                FX.clear(grid).appendChild(errorBox(e, load));
            }
        }

        load();
        return {el, initial: () => grid.querySelector(".card"), refresh: load};
    }

    // ------------------------------------------------------------------ search

    function search() {
        const f = field(t("Search"), {type: "search", placeholder: t("Title, actor, director …")});
        const results = h("div", {class: "results"});
        const body = h("div", {class: "rows vscroll"}, results);
        const el = h("div", {class: "tabview search"}, h("div", {class: "search-head"}, f.el), body);
        let timer = 0;
        let seq = 0;

        async function run() {
            const q = f.input.value.trim();
            const mine = ++seq;
            if (q.length < 2) {
                FX.clear(results);
                return;
            }
            try {
                const r = await FX.api("GET", "/api/search?q=" + encodeURIComponent(q));
                if (mine !== seq) return;
                FX.clear(results);
                if (r.movies && r.movies.length) results.appendChild(row(t("Movies"), r.movies, "poster"));
                if (r.shows && r.shows.length) results.appendChild(row(t("Shows"), r.shows, "poster"));
                if (r.episodes && r.episodes.length) results.appendChild(row(t("Episodes"), r.episodes, "land"));
                if (!results.children.length) results.appendChild(empty(t("Nothing found for “{0}”.", q)));
            } catch (e) {
                FX.clear(results).appendChild(errorBox(e));
            }
        }

        f.input.addEventListener("input", () => {
            clearTimeout(timer);
            timer = setTimeout(run, 450);
        });
        f.input.addEventListener("tvsubmit", () => {
            clearTimeout(timer);
            run().then(() => {
                const first = results.querySelector(".card");
                if (first) Nav.focus(first);
            });
        });
        return {el, initial: () => f.input, destroy: () => clearTimeout(timer)};
    }

    // ------------------------------------------------------------------ settings

    function settings() {
        const S = FX.S;
        const info = h("div", {class: "about muted"}, loading());
        const switchBtn = btn(t("Switch user"), () => App().push(switchUser()), {icon: "user"});
        switchBtn.hidden = true;
        const el = h("div", {class: "tabview settings vscroll"},
            h("div", {class: "settings-body"},
                h("h1", null, t("Settings")),
                h("div", {class: "card-box"},
                    h("div", {class: "kv"}, h("span", null, t("Signed in as")), h("b", null, S.user ? S.user.username : "")),
                    h("div", {class: "kv"}, h("span", null, t("Server")), h("b", null, (S.serverName || "FreeX") + " · " + S.server)),
                    h("div", {class: "kv"}, h("span", null, t("Device")), h("b", null, P.deviceName()))),
                h("div", {class: "row-buttons"},
                    switchBtn,
                    btn(t("Sign out"), signOut, {icon: "exit"}),
                    btn(t("Change server"), () => {
                        App().signOut(true).then(() => App().reset(connect()));
                    }, {icon: "server"})),
                h("p", {class: "muted small"}, t("Audio and subtitle languages, the subtitle style and the default quality are set in FreeX Web in your settings; FreeX TV uses them too.")),
                info));

        function signOut() {
            dialog(t("Sign out from this TV?"), [t("Sign out"), t("Cancel")]).then((i) => {
                if (i === 0) App().signOut();
            });
        }

        FX.api("GET", "/api/status").then((st) => {
            FX.clear(info).appendChild(h("div", null,
                h("div", null, "FreeX TV " + APP_VERSION + " · " + P.platform),
                st && st.version ? h("div", null, "FreeX Media Server " + st.version + (st.webVersion ? " · FreeX Web " + st.webVersion : "")) : null));
        }).catch(() => FX.clear(info));
        FX.api("GET", "/api/switch").then((list) => {
            switchBtn.hidden = !(list && list.length);
        }).catch(() => null);
        return {el, initial: () => el.querySelector(".btn:not([hidden])")};
    }

    function switchUser() {
        const list = h("div", {class: "users"}, loading());
        const el = h("div", {class: "screen center"}, h("div", {class: "panel wide"}, h("h1", null, t("Switch user")), list));
        const screen = {el, initial: () => list.querySelector(".f"), onBack: () => App().pop()};

        FX.api("GET", "/api/switch").then((users) => {
            FX.clear(list);
            (users || []).forEach((u) => list.appendChild(h("button", {class: "user f", onclick: () => askPin(u)},
                h("span", {class: "avatar"}, (u.username || "?").slice(0, 1).toUpperCase()), h("span", null, u.username))));
            if (!users || !users.length) list.appendChild(empty(t("No other accounts with a PIN.")));
            Nav.focusFirst();
        }).catch((e) => FX.clear(list).appendChild(errorBox(e)));

        function askPin(u) {
            const pin = field(t("PIN of {0}", u.username), {type: "password", inputmode: "numeric", maxlength: "8"});
            const msg = h("p", {class: "msg"});
            const ok = btn(t("Switch"), submit, {primary: true});
            pin.input.addEventListener("tvsubmit", () => setTimeout(() => Nav.focus(ok), 0));
            const box = h("div", {class: "dialog"}, h("div", {class: "box"}, pin.el, msg, h("div", {class: "row-buttons"}, ok, btn(t("Cancel"), close))));
            el.appendChild(box);
            const layer = Nav.push({el: box, initial: pin.input, onBack: close});

            function close() {
                Nav.pop(layer);
                box.remove();
            }

            async function submit() {
                try {
                    const res = await FX.api("POST", "/api/switch", {userId: u.id, pin: pin.input.value});
                    close();
                    App().signedIn(res);
                } catch (e) {
                    msg.textContent = e.message;
                }
            }
        }

        return screen;
    }

    // ------------------------------------------------------------------ details

    /**
     * The page of a movie, show or episode. For shows the seasons and their episodes, for episodes
     * the other episodes of the season.
     */
    function details(id, opts) {
        opts = opts || {};
        const backdrop = h("div", {class: "backdrop"});
        const body = h("div", {class: "details-body vscroll"}, loading());
        const el = h("div", {class: "screen details"}, backdrop, h("div", {class: "shade"}), body);
        let item = null;
        let seasonId = opts.season || null;
        let lastFocusKey = null;

        const screen = {
            el,
            initial: () => body.querySelector(".btn.primary") || body.querySelector(".f"),
            onBack: () => App().pop(),
            refresh: () => load(true),
        };

        async function load(keepFocus) {
            const f = Nav.focused;
            lastFocusKey = keepFocus && f && el.contains(f) ? focusKey(f) : null;
            try {
                item = await FX.api("GET", "/api/items/" + encodeURIComponent(id));
            } catch (e) {
                FX.clear(body).appendChild(errorBox(e, () => load()));
                return;
            }
            if (item.type === "season") {
                // a season is shown on its show's page
                seasonId = item.id;
                id = item.showId || item.parentId;
                return load(keepFocus);
            }
            FX.setArt(backdrop, FX.artPath(item.type === "episode" && item.showId ? item.showId : item, "backdrop"));
            await render();
            restoreFocus();
        }

        function focusKey(f) {
            if (f._item) return "item:" + f._item.id;
            if (f.dataset.key) return "key:" + f.dataset.key;
            return null;
        }

        function restoreFocus() {
            let target = null;
            if (lastFocusKey) {
                const all = body.querySelectorAll(".f");
                for (let i = 0; i < all.length; i++) {
                    if (focusKey(all[i]) === lastFocusKey) {
                        target = all[i];
                        break;
                    }
                }
            }
            Nav.focus(target || screen.initial());
        }

        function playButtons(playable, label) {
            const out = [];
            const p = playable.progress || {};
            const resume = !p.watched && p.offsetMs > 0;
            out.push(h("button", {class: "btn primary f", dataset: {key: "play"}, onclick: () => play(playable)},
                FX.icon("play"), h("span", null, resume ? t("Resume from {0}", FX.clock(p.offsetMs)) : label || t("Play"))));
            if (resume) out.push(h("button", {class: "btn f", dataset: {key: "restart"}, onclick: () => play(playable, 0)}, FX.icon("restart"), h("span", null, t("From the start"))));
            return out;
        }

        function play(it, startMs) {
            window.FreeXPlayer.open(it.id, {startMs, onClose: () => App().refreshTop()});
        }

        async function toggleWatched() {
            const watched = item.type === "show" ? item.leafCount > 0 && item.viewedLeafCount === item.leafCount : item.progress && item.progress.watched;
            try {
                await FX.api(watched ? "DELETE" : "POST", "/api/items/" + encodeURIComponent(item.id) + "/watched");
                load(true);
            } catch (e) {
                FX.toast(e.message, true);
            }
        }

        async function toggleWatchlist() {
            try {
                await FX.api(item.onWatchlist ? "DELETE" : "PUT", "/api/watchlist/" + encodeURIComponent(item.id));
                FX.toast(item.onWatchlist ? t("Removed from the watchlist") : t("Added to the watchlist"));
                load(true);
            } catch (e) {
                FX.toast(e.message, true);
            }
        }

        async function render() {
            const it = item;
            const buttons = h("div", {class: "row-buttons actions"});
            const head = h("div", {class: "d-head", "data-scroll-anchor": ""});
            const poster = h("div", {class: "d-poster"});
            FX.setArt(poster, FX.artPath(it, it.type === "episode" ? "thumb" : "poster"), it.title);
            if (it.type === "episode") poster.classList.add("land");
            const text = h("div", {class: "d-text"});
            if (it.type === "episode") {
                text.appendChild(h("div", {class: "kicker"}, it.showTitle || ""));
                text.appendChild(h("h1", null, it.title));
                text.appendChild(h("div", {class: "ep"}, FX.episodeCode(it)));
            } else {
                text.appendChild(h("h1", null, it.title));
                if (it.tagline) text.appendChild(h("div", {class: "tagline"}, it.tagline));
            }
            text.appendChild(meta(it));
            if (it.genres) text.appendChild(h("div", {class: "genres muted"}, String(it.genres).split(/,\s*/).join(" · ")));
            if (it.summary) text.appendChild(h("p", {class: "summary"}, it.summary));
            const md = it.metadata || {};
            if (md.directors && md.directors.length) text.appendChild(h("div", {class: "credits muted"}, t("Director: {0}", md.directors.join(", "))));
            if (it.media) text.appendChild(h("div", {class: "tech muted"}, techLine(it.media)));
            text.appendChild(buttons);
            head.appendChild(poster);
            head.appendChild(text);
            const sections = [head];

            if (it.type === "movie" || it.type === "episode" || it.type === "extra") {
                playButtons(it).forEach((b) => buttons.appendChild(b));
            } else if (it.type === "show") {
                const next = it.onDeck;
                if (next) playButtons(next, t("Play {0}", FX.episodeCode(next))).forEach((b) => buttons.appendChild(b));
            }
            if (it.type !== "extra") {
                const watched = it.type === "show" ? it.leafCount > 0 && it.viewedLeafCount === it.leafCount : it.progress && it.progress.watched;
                buttons.appendChild(h("button", {class: "btn f", dataset: {key: "watched"}, onclick: toggleWatched},
                    FX.icon("check"), h("span", null, watched ? t("Mark as unwatched") : t("Mark as watched"))));
            }
            if (it.type === "movie" || it.type === "show") {
                buttons.appendChild(h("button", {class: "btn f", dataset: {key: "watchlist"}, onclick: toggleWatchlist},
                    FX.icon(it.onWatchlist ? "check" : "plus"), h("span", null, t("Watchlist"))));
            }
            if (it.type === "episode" && it.showId) {
                buttons.appendChild(h("button", {class: "btn f", dataset: {key: "show"}, onclick: () => App().push(details(it.showId, {season: it.seasonId}))},
                    FX.icon("tv"), h("span", null, t("Go to show"))));
            }

            if (it.type === "show") {
                const seasons = (it.children || []).filter((c) => c.type === "season");
                if (!seasonId || !seasons.some((s) => s.id === seasonId)) {
                    const deckSeason = it.onDeck && it.onDeck.seasonId;
                    seasonId = deckSeason && seasons.some((s) => s.id === deckSeason) ? deckSeason : seasons.length ? seasons[0].id : null;
                }
                if (seasons.length) {
                    const tabs = h("div", {class: "season-tabs hscroll", "data-remember": ""}, seasons.map((s) => {
                        const b = h("button", {class: "pill-btn f" + (s.id === seasonId ? " on" : ""), dataset: {key: "season:" + s.id}, onclick: () => {
                            seasonId = s.id;
                            lastFocusKey = "key:season:" + s.id;
                            render().then(restoreFocus);
                        }}, s.title + (s.leafCount && s.viewedLeafCount === s.leafCount ? " ✓" : ""));
                        return b;
                    }));
                    sections.push(h("section", {class: "row", "data-scroll-anchor": ""}, h("h2", null, t("Seasons")), tabs));
                }
                if (seasonId) {
                    const episodesRow = h("section", {class: "row", "data-scroll-anchor": ""}, h("h2", null, t("Episodes")), loading());
                    sections.push(episodesRow);
                    loadEpisodes(seasonId, episodesRow, it.onDeck && it.onDeck.id);
                }
            } else if (it.type === "episode" && it.seasonId) {
                const episodesRow = h("section", {class: "row", "data-scroll-anchor": ""}, h("h2", null, t("More from this season")), loading());
                sections.push(episodesRow);
                loadEpisodes(it.seasonId, episodesRow, it.id);
            }

            const extras = it.extras || [];
            if (extras.length) sections.push(row(t("Trailers and extras"), extras, "land"));
            const cast = md.cast || [];
            if (cast.length) {
                sections.push(h("section", {class: "row", "data-scroll-anchor": ""}, h("h2", null, t("Cast")),
                    h("div", {class: "cards hscroll people", "data-remember": ""}, cast.slice(0, 30).map((p) => {
                        const ph = h("div", {class: "face"});
                        if (p.hasImage) FX.lazyArt(ph, "/api/people/" + encodeURIComponent(p.id) + "/image", p.name.slice(0, 1));
                        else ph.appendChild(h("span", {class: "fallback"}, p.name.slice(0, 1)));
                        return h("div", {class: "person f"}, ph, h("div", {class: "t"}, p.name), h("div", {class: "s"}, p.role || ""));
                    }))));
            }
            FX.clear(body);
            sections.forEach((s) => body.appendChild(s));
        }

        async function loadEpisodes(sid, section, focusId) {
            try {
                const season = await FX.api("GET", "/api/items/" + encodeURIComponent(sid));
                const eps = (season.children || []).filter((c) => c.type === "episode");
                const list = h("div", {class: "cards hscroll", "data-remember": ""}, eps.map((e) => {
                    const c = card(e, "land", () => App().push(details(e.id)));
                    c.classList.add("episode");
                    c.querySelector(".cap .t").textContent = e.index + ". " + e.title;
                    c.querySelector(".cap .s").textContent = e.media && e.media.durationMs ? FX.duration(e.media.durationMs) : "";
                    return c;
                }));
                const old = section.querySelector(".loading");
                if (old) old.remove();
                section.appendChild(list);
                const mark = eps.filter((e) => e.id === focusId)[0];
                if (mark) {
                    const target = Array.prototype.filter.call(list.children, (c) => c._item === mark)[0];
                    list._last = target;
                    // scroll the row so that the next episode is in view
                    setTimeout(() => {
                        if (target) list.scrollLeft = Math.max(0, target.offsetLeft - list.clientWidth * 0.1);
                    }, 0);
                }
                if (lastFocusKey) restoreFocus();
            } catch (e) {
                section.appendChild(errorBox(e));
            }
        }

        load();
        return screen;
    }

    function techLine(m) {
        const parts = [];
        if (m.videoCodec) parts.push(String(m.videoCodec).toUpperCase() + (m.resolution ? " " + m.resolution : ""));
        const audio = (m.audio || []).map((a) => FX.language(a.language)).filter((v, i, a) => a.indexOf(v) === i);
        if (audio.length) parts.push(t("Audio: {0}", audio.join(", ")));
        const subs = (m.subtitles || []).map((s) => FX.language(s.language)).filter((v, i, a) => a.indexOf(v) === i);
        if (subs.length) parts.push(t("Subtitles: {0}", subs.join(", ")));
        return parts.join("  ·  ");
    }

    window.FreeXScreens = {connect, login, main, details, dialog, APP_VERSION};
})();
