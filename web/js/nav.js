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
 * Remote control: keys to actions, and spatial navigation between focusable elements.
 *
 * Every element with the class "f" can be focused. The arrow keys move to the nearest focusable
 * element in that direction inside the top layer (a screen, or a menu over it). Focus is a class
 * ("focused"), not the browser's focus, so the page never jumps; only text fields get the real
 * focus while the TV's keyboard is open. Containers with data-remember bring focus back to the
 * element that was focused in them last.
 */
(function () {
    "use strict";

    const KEYS = {
        37: "left", 38: "up", 39: "right", 40: "down", 13: "ok", 32: "ok",
        10009: "back", 27: "back", 8: "back", 461: "back", // Tizen, browsers, webOS-style back
        415: "play", 19: "pause", 10252: "playpause", 179: "playpause", 413: "stop", 178: "stop",
        417: "ff", 228: "ff", 412: "rw", 227: "rw", 10233: "next", 176: "next", 10232: "prev", 177: "prev",
        457: "info", 73: "info", 77: "menu", 93: "menu",
    };

    /** Layers: the screen at the bottom, menus and dialogs above. Only the top one gets keys. */
    const layers = [];
    let focused = null;

    function top() {
        return layers[layers.length - 1] || null;
    }

    function visible(el) {
        if (!el || !el.isConnected || el.offsetParent === null) return false;
        if (el.closest("[hidden]")) return false;
        return true;
    }

    function focusables(scope) {
        return Array.prototype.filter.call(scope.querySelectorAll(".f"), (el) => !el.disabled && !el.classList.contains("off") && visible(el));
    }

    function focus(el, opts) {
        if (!el) return;
        if (focused && focused !== el) {
            focused.classList.remove("focused");
            focused.dispatchEvent(new CustomEvent("tvblur", {bubbles: true}));
        }
        focused = el;
        el.classList.add("focused");
        const remember = el.parentElement && el.parentElement.closest("[data-remember]");
        if (remember) remember._last = el;
        const layer = top();
        if (layer) layer.last = el;
        if (!(opts && opts.noScroll)) ensureVisible(el);
        el.dispatchEvent(new CustomEvent("tvfocus", {bubbles: true}));
    }

    /** Scrolls the containers around an element so that it is fully on screen. */
    function ensureVisible(el) {
        let c = el.parentElement;
        const r = el.getBoundingClientRect();
        while (c && c !== document.body) {
            if (c.classList.contains("hscroll")) {
                const cr = c.getBoundingClientRect();
                const pad = parseFloat(getComputedStyle(c).paddingLeft) || 0;
                if (r.left < cr.left + pad) c.scrollLeft -= cr.left + pad - r.left;
                else if (r.right > cr.right - pad) c.scrollLeft += r.right - (cr.right - pad);
            }
            if (c.classList.contains("vscroll")) {
                const cr = c.getBoundingClientRect();
                const anchor = el.closest("[data-scroll-anchor]") || el;
                const ar = anchor.getBoundingClientRect();
                if (c.dataset.align === "start") {
                    // Rows of the home screen: the focused row always sits at the same height.
                    const offset = parseFloat(c.dataset.offset || "0") * window.innerHeight;
                    c.scrollTop += ar.top - cr.top - offset;
                } else {
                    const pad = window.innerHeight * 0.12;
                    if (ar.top < cr.top + pad) c.scrollTop -= cr.top + pad - ar.top;
                    else if (ar.bottom > cr.bottom - pad) c.scrollTop += ar.bottom - (cr.bottom - pad);
                }
            }
            c = c.parentElement;
        }
    }

    /** The nearest focusable element in a direction, or null. */
    function nearest(from, dir, scope) {
        const a = from.getBoundingClientRect();
        const ax = a.left + a.width / 2;
        const ay = a.top + a.height / 2;
        const horizontal = dir === "left" || dir === "right";
        const found = [];
        focusables(scope).forEach((el) => {
            if (el === from) return;
            const b = el.getBoundingClientRect();
            if (!b.width && !b.height) return;
            const bx = b.left + b.width / 2;
            const by = b.top + b.height / 2;
            let primary;
            let secondary;
            const tol = 2;
            if (dir === "right") {
                if (b.left < a.right - tol && bx <= ax + tol) return;
                if (bx <= ax) return;
                primary = Math.max(0, b.left - a.right);
            } else if (dir === "left") {
                if (b.right > a.left + tol && bx >= ax - tol) return;
                if (bx >= ax) return;
                primary = Math.max(0, a.left - b.right);
            } else if (dir === "down") {
                if (by <= ay + tol || b.top < a.top + tol) return;
                primary = Math.max(0, b.top - a.bottom);
            } else {
                if (by >= ay - tol || b.bottom > a.bottom - tol) return;
                primary = Math.max(0, a.top - b.bottom);
            }
            if (horizontal) {
                const overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
                secondary = overlap > 0 ? 0 : Math.abs(by - ay);
                // Stay in the same row whenever possible.
                if (overlap <= 0) primary += 4000;
            } else {
                secondary = Math.abs(bx - ax);
            }
            found.push({el, primary, secondary});
        });
        let best = null;
        if (horizontal) {
            let bestScore = Infinity;
            found.forEach((c) => {
                const score = c.primary + c.secondary * 2;
                if (score < bestScore) {
                    bestScore = score;
                    best = c.el;
                }
            });
        } else {
            // Up and down go to the next line first, and there to the element nearest across.
            let min = Infinity;
            found.forEach((c) => min = Math.min(min, c.primary));
            const band = min + Math.max(24, a.height * 0.5);
            let bestSecondary = Infinity;
            found.forEach((c) => {
                if (c.primary <= band && c.secondary < bestSecondary) {
                    bestSecondary = c.secondary;
                    best = c.el;
                }
            });
        }
        if (best && !horizontal) {
            // Coming into a remembered row: back to the element focused there last.
            const row = best.parentElement && best.parentElement.closest("[data-remember]");
            const fromRow = from.parentElement && from.parentElement.closest("[data-remember]");
            if (row && row !== fromRow && row._last && row._last.isConnected && visible(row._last) && scope.contains(row._last)) {
                best = row._last;
            }
        }
        return best;
    }

    function move(dir) {
        const layer = top();
        if (!layer) return false;
        if (!focused || !layer.el.contains(focused) || !visible(focused)) {
            focusFirst();
            return true;
        }
        const next = nearest(focused, dir, layer.el);
        if (next) focus(next);
        return !!next;
    }

    /** Focuses the layer's last focused element, its preferred one, or the first one. */
    function focusFirst() {
        const layer = top();
        if (!layer) return;
        const cand = [layer.last, typeof layer.initial === "function" ? layer.initial() : layer.initial];
        for (let i = 0; i < cand.length; i++) {
            if (cand[i] && cand[i].isConnected && layer.el.contains(cand[i]) && visible(cand[i])) return focus(cand[i]);
        }
        const all = focusables(layer.el);
        if (all.length) focus(all[0]);
    }

    /**
     * Adds a layer. `onKey(action, event)` may handle any key first (return true); `onBack()`
     * handles Back when nothing else did. `initial` is the element (or a function returning it)
     * to focus first.
     */
    function push(layer) {
        layers.push(layer);
        setTimeout(focusFirst, 0);
        return layer;
    }

    function pop(layer) {
        const i = layers.indexOf(layer);
        if (i < 0) return;
        layers.splice(i, 1);
        if (focused && layer.el.contains(focused)) {
            focused.classList.remove("focused");
            focused = null;
        }
        if (i === layers.length) setTimeout(focusFirst, 0);
    }

    // ------------------------------------------------------------------ keys

    let lastRepeat = 0;

    function dispatch(action, ev) {
        const layer = top();
        if (!layer) return;
        if (layer.onKey && layer.onKey(action, ev)) return;
        if (action === "left" || action === "right" || action === "up" || action === "down") {
            move(action);
        } else if (action === "ok") {
            if (focused && layer.el.contains(focused)) activate(focused);
            else focusFirst();
        } else if (action === "back") {
            if (layer.onBack) layer.onBack();
        }
    }

    /** OK on an element: a text field opens the TV keyboard, everything else is clicked. */
    function activate(el) {
        if (el.tagName === "INPUT") {
            el.focus();
            if (typeof el.select === "function" && el.type !== "password") {
                try {
                    el.setSelectionRange(el.value.length, el.value.length);
                } catch (e) {
                    // some input types have no selection
                }
            }
            return;
        }
        el.click();
    }

    function onKeyDown(ev) {
        const code = ev.keyCode;
        const inInput = document.activeElement && document.activeElement.tagName === "INPUT";
        if (inInput) {
            const input = document.activeElement;
            // The TV keyboard's Done (65376) and Cancel (65385), Enter and Back close it.
            if (code === 13 || code === 65376) {
                ev.preventDefault();
                input.blur();
                input.dispatchEvent(new CustomEvent("tvsubmit", {bubbles: true}));
                return;
            }
            if (code === 65385 || code === 10009 || code === 27) {
                ev.preventDefault();
                input.blur();
                return;
            }
            if (code === 38 || code === 40) {
                input.blur();
            } else {
                return; // typing, cursor keys inside the field
            }
        }
        const action = KEYS[code];
        if (!action) return;
        if (action === "back" && code === 8 && inInput) return;
        if (action === "ok" && code === 32 && inInput) return;
        if (action === "info" || action === "menu") {
            // letters only count on a keyboard without a field
            if (inInput) return;
        }
        ev.preventDefault();
        if (ev.repeat) {
            const now = Date.now();
            if (now - lastRepeat < 70) return;
            lastRepeat = now;
        }
        dispatch(action, ev);
    }

    document.addEventListener("keydown", onKeyDown, true);

    // A click (mouse, or Android's pointer on emulators) focuses and activates like the remote.
    document.addEventListener("click", (ev) => {
        const el = ev.target.closest && ev.target.closest(".f");
        if (el && el !== focused && ev.isTrusted) focus(el, {noScroll: true});
    }, true);

    window.FreeXNav = {
        push, pop, focus, focusFirst, dispatch, ensureVisible, top,
        get focused() {
            return focused;
        },
    };
    // Keys that the native shell (Android) catches and passes on.
    window.FreeXKey = (action) => dispatch(action, null);
})();
