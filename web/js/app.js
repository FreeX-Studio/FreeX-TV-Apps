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
 * Start of FreeX TV: the stack of screens, signing in and out, and the start itself (back to the
 * last server and account, otherwise connect and sign in).
 */
(function () {
    "use strict";

    const FX = window.FX;
    const Nav = window.FreeXNav;
    const P = window.FreeXPlatform;
    const Screens = window.FreeXScreens;
    const root = document.getElementById("app");

    /** Screens on top of each other; only the top one is shown. */
    const stack = [];

    function mount(screen) {
        screen.layer = Nav.push({
            el: screen.el,
            initial: screen.initial,
            onKey: screen.onKey,
            onBack: screen.onBack || pop,
        });
        root.appendChild(screen.el);
    }

    function push(screen) {
        const below = stack[stack.length - 1];
        if (below) {
            below.el.hidden = true;
            below.savedFocus = Nav.focused;
            Nav.pop(below.layer);
        }
        stack.push(screen);
        mount(screen);
    }

    function pop() {
        if (stack.length < 2) return;
        const s = stack.pop();
        Nav.pop(s.layer);
        if (s.destroy) s.destroy();
        s.el.remove();
        const below = stack[stack.length - 1];
        below.el.hidden = false;
        below.layer = Nav.push({el: below.el, initial: below.initial, onKey: below.onKey, onBack: below.onBack || pop});
        if (below.savedFocus && below.savedFocus.isConnected) {
            below.layer.last = below.savedFocus;
            Nav.focus(below.savedFocus, {noScroll: true});
        }
        if (below.refresh) below.refresh();
    }

    function clearStack() {
        while (stack.length) {
            const s = stack.pop();
            Nav.pop(s.layer);
            if (s.destroy) s.destroy();
            s.el.remove();
        }
    }

    function reset(screen) {
        clearStack();
        push(screen);
    }

    /** After the player: the screen below it shows the new watch state. */
    function refreshTop() {
        const top = stack[stack.length - 1];
        if (top && top.refresh) top.refresh();
    }

    function applyLanguage() {
        const pref = FX.S.user && FX.S.user.preferences && FX.S.user.preferences.uiLanguage;
        FreeXI18n.use(pref || "");
    }

    function signedIn(res) {
        FX.S.token = res.token;
        FX.S.user = res.user;
        FX.persist();
        applyLanguage();
        reset(Screens.main());
    }

    async function signOut(quiet) {
        try {
            if (FX.S.token) await FX.api("POST", "/api/logout", {});
        } catch (e) {
            // signed out locally anyway
        }
        FX.S.token = "";
        FX.S.user = null;
        FX.persist();
        if (!quiet) reset(Screens.login());
    }

    function exit() {
        P.exitApp();
    }

    FX.onSignedOut = () => {
        if (!FX.S.token) return;
        FX.S.token = "";
        FX.S.user = null;
        FX.persist();
        FX.toast(FX.t("Please sign in again."));
        reset(Screens.login());
    };

    /** Rem in px: the layout is made for 1920 × 1080 and scales with the screen. */
    function scale() {
        document.documentElement.style.fontSize = (window.innerWidth / 1920 * 10) + "px";
    }

    /** Whether the engine knows gap in flex boxes (Chromium 84 and newer). */
    function flexGap() {
        const d = document.createElement("div");
        d.style.cssText = "display:flex;flex-direction:column;row-gap:1px;position:absolute";
        d.appendChild(document.createElement("div"));
        d.appendChild(document.createElement("div"));
        document.body.appendChild(d);
        const ok = d.scrollHeight === 1;
        d.remove();
        return ok;
    }

    async function boot() {
        scale();
        if (!flexGap()) document.body.classList.add("no-gap");
        window.addEventListener("resize", scale);
        document.body.classList.add("platform-" + P.platform);
        P.registerKeys();
        applyLanguage();
        if (!FX.S.server) return reset(Screens.connect());
        if (!FX.S.token) return reset(Screens.login());
        const splash = FX.h("div", {class: "screen center splash"}, FX.h("img", {class: "logo big", src: "img/logo.svg", alt: ""}),
            FX.h("div", {class: "spinner"}));
        root.appendChild(splash);
        try {
            const me = await FX.api("GET", "/api/me", undefined, {timeout: 12000});
            FX.S.user = me;
            FX.persist();
            applyLanguage();
            splash.remove();
            reset(Screens.main());
        } catch (e) {
            splash.remove();
            if (e.status === 401) return reset(Screens.login());
            reset(offline(e));
        }
    }

    /** The server cannot be reached at the start. */
    function offline(e) {
        const h = FX.h;
        const retry = h("button", {class: "btn primary f", onclick: () => {
            clearStack();
            boot();
        }}, FX.t("Try again"));
        const change = h("button", {class: "btn f", onclick: () => reset(Screens.connect())}, FX.t("Change server"));
        return {
            el: h("div", {class: "screen center"}, h("div", {class: "panel"},
                h("img", {class: "logo big", src: "img/logo.svg", alt: ""}),
                h("h1", null, FX.t("{0} cannot be reached", FX.S.serverName || FX.S.server)),
                h("p", {class: "muted"}, e.message + " · " + FX.S.server),
                h("div", {class: "row-buttons"}, retry, change))),
            initial: retry,
            onBack: exit,
        };
    }

    window.FreeXApp = {push, pop, reset, refreshTop, signedIn, signOut, exit};
    boot();
})();
