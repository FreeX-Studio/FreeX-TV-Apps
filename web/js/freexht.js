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
 * FreeXHT, the FreeX system image for Raspberry Pi and PCs (repository FreeX-HT): what the
 * interface needs there and the TVs bring themselves.
 *
 *  - an on-screen keyboard for text fields (a TV remote has no letters),
 *  - the keys of the remote that arrive only as key names (Back, Select, media keys),
 *  - the box in the settings: network, Wi-Fi, restart and power off,
 *  - the server address from freexht.conf on the boot partition.
 *
 * Does nothing on other platforms. The native side is window.FreeXNative from FreeX-HT
 * (bridge.js): call("info" | "power" | "wifi.scan" | "wifi.connect", args) → Promise.
 */
(function () {
    "use strict";

    const P = window.FreeXPlatform;
    const N = window.FreeXNative;
    if (!P || !P.isFreeXHT || !N) {
        window.FreeXHT = null;
        return;
    }

    const FX = window.FX;
    const Nav = window.FreeXNav;
    const h = FX.h;
    const t = FX.t;
    const App = () => window.FreeXApp;
    const Screens = () => window.FreeXScreens;

    function btn(label, onclick, opts) {
        opts = opts || {};
        return h("button", {class: "btn f" + (opts.primary ? " primary" : ""), onclick},
            opts.icon ? FX.icon(opts.icon) : null, label ? h("span", null, label) : null);
    }

    // ------------------------------------------------------------------ weak boards

    // Raspberry Pi 3 (or lite_ui in freexht.conf): no transitions or animations, every frame the
    // browser does not have to draw is one the video and the remote get.
    if (N.info().lite) document.documentElement.classList.add("lite");

    // ------------------------------------------------------------------ server from freexht.conf

    if (!FX.S.server && N.defaultServer()) {
        const server = FX.normalizeServer(N.defaultServer());
        if (server) {
            FX.S.server = server;
            FX.persist();
        }
    }

    // ------------------------------------------------------------------ remote keys by name

    /** Keys the browser engine knows by name only (keyCode 0), as actions of nav.js. */
    const KEY_NAMES = {
        BrowserBack: "back", GoBack: "back", Exit: "back", Select: "ok",
        MediaPlayPause: "playpause", MediaPlay: "play", MediaPause: "pause", MediaStop: "stop",
        MediaFastForward: "ff", MediaRewind: "rw", MediaTrackNext: "next", MediaTrackPrevious: "prev",
        ContextMenu: "menu", Info: "info", Guide: "menu",
    };

    // ------------------------------------------------------------------ on-screen keyboard

    const LETTERS = {
        de: ["1234567890ß", "qwertzuiopü", "asdfghjklöä", "yxcvbnm-._@"],
        en: ["1234567890", "qwertyuiop", "asdfghjkl", "zxcvbnm-._@"],
    };
    const SYMBOLS = ["1234567890", "!@#$%&*()?", "-_=+/\\:;'\"", ",.<>[]{}~^"];

    const osk = {
        el: null, rows: null, preview: null, label: null,
        input: null, open: false, page: "letters", shift: false, r: 1, c: 0,
    };

    function oskBuild() {
        if (osk.el) return;
        osk.label = h("div", {class: "osk-label"});
        osk.preview = h("span", {class: "osk-value"});
        osk.field = h("div", {class: "osk-field"}, osk.preview, h("span", {class: "osk-caret"}));
        osk.rows = h("div", {class: "osk-rows"});
        osk.el = h("div", {class: "osk", hidden: true}, h("div", {class: "osk-head"}, osk.label, osk.field), osk.rows);
        // The mouse must not take the focus from the text field.
        osk.el.addEventListener("mousedown", (e) => e.preventDefault());
        document.body.appendChild(osk.el);
    }

    function oskKeys() {
        const lang = (window.FreeXI18n && window.FreeXI18n.lang()) === "de" ? "de" : "en";
        const rows = (osk.page === "symbols" ? SYMBOLS : LETTERS[lang]).map((row) => row.split("").map((ch) => {
            const v = osk.shift ? ch.toUpperCase() : ch;
            return {label: v, value: v};
        }));
        rows.push([
            {label: "⇧", action: "shift", w: 1.5, on: osk.shift},
            {label: osk.page === "symbols" ? "abc" : "#+=", action: "page", w: 1.5},
            {label: t("Space"), value: " ", w: 4},
            {label: "⌫", action: "delete", w: 1.5},
            {label: t("Done"), action: "done", w: 2.5, primary: true},
        ]);
        return rows;
    }

    function oskRender() {
        const rows = oskKeys();
        osk.r = Math.min(osk.r, rows.length - 1);
        osk.c = Math.min(osk.c, rows[osk.r].length - 1);
        FX.clear(osk.rows);
        rows.forEach((row, r) => {
            osk.rows.appendChild(h("div", {class: "osk-row"}, row.map((k, c) => {
                const el = h("div", {
                    class: "osk-key" + (k.primary ? " primary" : "") + (k.on ? " on" : "") + (r === osk.r && c === osk.c ? " focused" : ""),
                    style: "flex-grow:" + (k.w || 1),
                    onclick: () => {
                        osk.r = r;
                        osk.c = c;
                        oskPress();
                    },
                }, k.label);
                el._key = k;
                return el;
            })));
        });
        oskPreview();
    }

    function oskPreview() {
        const inp = osk.input;
        if (!inp) return;
        const v = inp.value || "";
        osk.preview.textContent = v ? (inp.type === "password" ? "•".repeat(v.length) : v) : inp.placeholder || "";
        osk.preview.classList.toggle("empty", !v);
        // A long text shows its end, where the next letter goes.
        osk.field.classList.toggle("overflow", osk.preview.scrollWidth > osk.field.clientWidth - 40);
    }

    function oskSet(value) {
        const inp = osk.input;
        if (inp.maxLength > 0 && value.length > inp.maxLength) return;
        inp.value = value;
        inp.dispatchEvent(new Event("input", {bubbles: true}));
        oskPreview();
    }

    function oskPress() {
        const row = osk.rows.children[osk.r];
        const el = row && row.children[osk.c];
        const k = el && el._key;
        if (!k || !osk.input) return;
        if (k.value !== undefined) {
            oskSet(osk.input.value + k.value);
            if (osk.shift && osk.page === "letters") {
                osk.shift = false;
                oskRender();
            }
            return;
        }
        if (k.action === "shift") {
            osk.shift = !osk.shift;
            oskRender();
        } else if (k.action === "page") {
            osk.page = osk.page === "symbols" ? "letters" : "symbols";
            osk.shift = false;
            oskRender();
        } else if (k.action === "delete") {
            oskSet(osk.input.value.slice(0, -1));
        } else if (k.action === "done") {
            // As nav.js does for the TV keyboard's Done: leave the field, then "tvsubmit".
            const inp = osk.input;
            inp.blur();
            inp.dispatchEvent(new CustomEvent("tvsubmit", {bubbles: true}));
        }
    }

    function oskMove(dir) {
        const rows = osk.rows.children;
        if (dir === "left" || dir === "right") {
            const n = rows[osk.r].children.length;
            osk.c = (osk.c + (dir === "left" ? n - 1 : 1)) % n;
        } else {
            const to = osk.r + (dir === "up" ? -1 : 1);
            if (to < 0 || to >= rows.length) return;
            // The key below/above the middle of the current one.
            const cur = rows[osk.r].children[osk.c].getBoundingClientRect();
            const x = cur.left + cur.width / 2;
            let best = 0;
            let bestD = Infinity;
            Array.prototype.forEach.call(rows[to].children, (el, i) => {
                const b = el.getBoundingClientRect();
                const d = Math.abs(b.left + b.width / 2 - x);
                if (d < bestD) {
                    bestD = d;
                    best = i;
                }
            });
            osk.r = to;
            osk.c = best;
        }
        Array.prototype.forEach.call(osk.rows.querySelectorAll(".osk-key.focused"), (el) => el.classList.remove("focused"));
        rows[osk.r].children[osk.c].classList.add("focused");
    }

    function oskOpen(input) {
        oskBuild();
        osk.input = input;
        osk.open = true;
        osk.page = input.inputMode === "numeric" ? "symbols" : "letters";
        osk.shift = false;
        osk.r = 1;
        osk.c = 0;
        const label = input.closest("label");
        const span = label && label.querySelector("span");
        osk.label.textContent = span ? span.textContent : "";
        oskRender();
        osk.el.hidden = false;
        document.body.classList.add("osk-on");
    }

    function oskClose() {
        osk.open = false;
        osk.input = null;
        if (osk.el) osk.el.hidden = true;
        document.body.classList.remove("osk-on");
    }

    const TEXT_TYPES = ["text", "password", "url", "search", "email", "number", "tel", ""];

    document.addEventListener("focusin", (e) => {
        const el = e.target;
        if (el && el.tagName === "INPUT" && TEXT_TYPES.indexOf(el.type) >= 0) oskOpen(el);
    });
    document.addEventListener("focusout", (e) => {
        if (osk.open && e.target === osk.input) oskClose();
    });

    window.addEventListener("keydown", (ev) => {
        if (osk.open) {
            // A real keyboard types into the field itself: the on-screen keyboard steps aside.
            if (ev.key && ev.key.length === 1 && !ev.ctrlKey && !ev.altKey && !ev.metaKey) {
                osk.el.hidden = true;
                osk.open = false;
                document.body.classList.remove("osk-on");
                return;
            }
            let handled = true;
            switch (ev.key) {
                case "ArrowUp": oskMove("up"); break;
                case "ArrowDown": oskMove("down"); break;
                case "ArrowLeft": oskMove("left"); break;
                case "ArrowRight": oskMove("right"); break;
                case "Enter": case "Select": oskPress(); break;
                case "Backspace": oskSet(osk.input.value.slice(0, -1)); break;
                case "Escape": case "BrowserBack": case "GoBack": case "Exit":
                    if (osk.input) osk.input.blur();
                    break;
                default: handled = !!KEY_NAMES[ev.key]; // swallow media keys while typing
            }
            if (handled) {
                ev.preventDefault();
                ev.stopImmediatePropagation();
            }
            return;
        }
        const action = KEY_NAMES[ev.key];
        if (action) {
            ev.preventDefault();
            ev.stopImmediatePropagation();
            Nav.dispatch(action, null);
        }
    }, true);

    // ------------------------------------------------------------------ network

    function describeNetwork(info) {
        const n = info && info.network;
        const ip = info && info.addresses && info.addresses[0];
        if (!n || n.kind === "none") return t("Not connected");
        const what = n.kind === "wifi" ? t("Wi-Fi “{0}”", n.name) : t("Network cable");
        return ip ? what + " · " + ip : what;
    }

    /** Signal strength as four bars. */
    function bars(signal) {
        const n = signal >= 75 ? 4 : signal >= 50 ? 3 : signal >= 25 ? 2 : 1;
        return h("span", {class: "bars", title: signal + " %"}, [1, 2, 3, 4].map((i) => h("i", {class: i <= n ? "on" : ""})));
    }

    function networkScreen() {
        const status = h("p", {class: "muted"}, t("Checking the network …"));
        const list = h("div", {class: "wifi-list vscroll"});
        const msg = h("p", {class: "msg"});
        const rescan = btn(t("Search again"), scan, {icon: "restart"});
        const back = btn(t("Back"), () => App().pop());
        const el = h("div", {class: "screen center"}, h("div", {class: "panel wide freexht-network"},
            h("h1", null, t("Network")), status, list, msg, h("div", {class: "row-buttons"}, rescan, back)));

        function refreshStatus() {
            return N.call("info").then((i) => {
                status.textContent = describeNetwork(i);
                return i;
            }).catch(() => null);
        }

        function scan() {
            msg.textContent = t("Searching for Wi-Fi networks …");
            FX.clear(list);
            return N.call("wifi.scan").then((nets) => {
                msg.textContent = nets.length ? "" : t("No Wi-Fi networks found.");
                nets.forEach((n) => {
                    const b = h("button", {class: "btn f wifi" + (n.active ? " active" : ""), onclick: () => choose(n)},
                        h("span", {class: "ssid"}, n.ssid),
                        h("span", {class: "meta"}, [n.active ? t("Connected") : "", n.secure ? t("Secured") : ""].filter(Boolean).join(" · "), bars(n.signal)));
                    list.appendChild(b);
                });
                // The list is new: the focus goes to its first network unless it is on a button below.
                const first = list.querySelector(".btn");
                const f = Nav.focused;
                if (first && (!f || !el.contains(f) || f === rescan || f === back || list.contains(f) || !f.isConnected)) Nav.focus(first);
            }).catch((e) => {
                msg.textContent = t("Wi-Fi is not available: {0}", e.message);
            });
        }

        function choose(n) {
            if (n.active) return;
            if (!n.secure) return connect(n.ssid, "");
            askPassword(n.ssid).then((pw) => {
                if (pw !== null) connect(n.ssid, pw);
            });
        }

        function connect(ssid, password) {
            msg.textContent = t("Connecting to “{0}” …", ssid);
            return N.call("wifi.connect", {ssid, password}).then(() => {
                msg.textContent = "";
                FX.toast(t("Connected to “{0}”.", ssid));
                return refreshStatus().then(scan);
            }).catch((e) => {
                msg.textContent = t("Could not connect: {0}", e.message);
            });
        }

        refreshStatus().then((i) => {
            if (i && i.network && i.network.wifiAvailable === false) {
                msg.textContent = t("This box has no Wi-Fi.");
                rescan.hidden = true;
            } else {
                scan();
            }
        });
        return {el, initial: () => list.querySelector(".btn") || back, onBack: () => App().pop()};
    }

    function askPassword(ssid) {
        return new Promise((resolve) => {
            const input = h("input", {class: "f", type: "password", spellcheck: "false", autocomplete: "off"});
            const field = h("label", {class: "field"}, h("span", null, t("Password for “{0}”", ssid)), input);
            const ok = btn(t("Connect"), () => done(input.value), {primary: true});
            const box = h("div", {class: "dialog"}, h("div", {class: "box"}, field, h("div", {class: "row-buttons"}, ok, btn(t("Cancel"), () => done(null)))));
            input.addEventListener("tvsubmit", () => setTimeout(() => Nav.focus(ok), 0));
            document.getElementById("app").appendChild(box);
            const layer = Nav.push({el: box, initial: input, onBack: () => done(null)});

            function done(v) {
                Nav.pop(layer);
                box.remove();
                resolve(v);
            }
        });
    }

    // ------------------------------------------------------------------ power

    function power(action) {
        const text = action === "reboot" ? t("Restart the box?") : t("Switch the box off?");
        const label = action === "reboot" ? t("Restart") : t("Switch off");
        return Screens().dialog(text, [label, t("Cancel")]).then((i) => {
            if (i !== 0) return;
            FX.toast(action === "reboot" ? t("Restarting …") : t("Switching off …"));
            return N.call("power", {action}).catch((e) => FX.toast(e.message));
        });
    }

    /** Back on the home screen: there is no app to close, the box can restart or switch off. */
    function powerMenu() {
        return Screens().dialog(t("Switch the box off?"), [t("Switch off"), t("Restart"), t("Cancel")]).then((i) => {
            if (i === 0) N.call("power", {action: "poweroff"}).catch((e) => FX.toast(e.message));
            if (i === 1) N.call("power", {action: "reboot"}).catch((e) => FX.toast(e.message));
        });
    }

    // ------------------------------------------------------------------ settings

    function settingsSection() {
        const info = N.info();
        const kv = (k, v) => h("div", {class: "kv"}, h("span", null, k), v);
        const net = h("b", null, "…");
        const host = h("b", null, "…");
        N.call("info").then((i) => {
            net.textContent = describeNetwork(i);
            host.textContent = i.hostname;
        }).catch(() => {
            net.textContent = "–";
            host.textContent = "–";
        });
        return h("div", {class: "freexht-system"},
            h("h2", null, t("This box")),
            h("div", {class: "card-box"},
                kv(t("Model"), h("b", null, info.model + " · FreeXHT " + info.version)),
                kv(t("Network"), net),
                kv(t("Name in the network"), host)),
            h("div", {class: "row-buttons"},
                btn(t("Network"), () => App().push(networkScreen()), {icon: "server"}),
                btn(t("Restart"), () => power("reboot"), {icon: "restart"}),
                btn(t("Switch off"), () => power("poweroff"), {icon: "exit"})));
    }

    /** For screens without a server yet (connect, offline): the network settings. */
    function networkButton() {
        return btn(t("Network"), () => App().push(networkScreen()), {icon: "server"});
    }

    window.FreeXHT = {settingsSection, networkButton, networkScreen, powerMenu};
})();
