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
 * Texts of FreeX TV. The English text is the key; German comes from the table below. The
 * language is the user's display language on the server, otherwise the one of the TV.
 */
(function () {
    "use strict";

    const DE = {
        "Added to the watchlist": "Zur Merkliste hinzugefügt",
        "All": "Alle",
        "Audio": "Audio",
        "Audio and subtitle languages, the subtitle style and the default quality are set in FreeX Web in your settings; FreeX TV uses them too.":
            "Audio- und Untertitelsprachen, der Untertitelstil und die Standardqualität werden in FreeX Web in deinen Einstellungen festgelegt; FreeX TV übernimmt sie.",
        "Audio converted": "Ton umgewandelt",
        "Audio: {0}": "Audio: {0}",
        "Automatic": "Automatisch",
        "Back": "Zurück",
        "Back 10 s": "10 s zurück",
        "Cancel": "Abbrechen",
        "Cast": "Besetzung",
        "Change server": "Server wechseln",
        "Close": "Schließen",
        "Close FreeX?": "FreeX beenden?",
        "Code from your authenticator app or a recovery code": "Code aus deiner Authenticator-App oder ein Wiederherstellungscode",
        "Confirm": "Bestätigen",
        "Connect": "Verbinden",
        "Connect to your FreeX server": "Mit deinem FreeX-Server verbinden",
        "Connecting …": "Verbinde …",
        "Converted": "Umgewandelt",
        "Device": "Gerät",
        "Direct play": "Direkte Wiedergabe",
        "Direct stream": "Direkter Stream",
        "Director: {0}": "Regie: {0}",
        "Enter the address of your FreeX Media Server, e.g. 192.168.1.10 or media.example.org. Without a port, 32500 is used.":
            "Gib die Adresse deines FreeX Media Servers ein, z. B. 192.168.1.10 oder media.example.org. Ohne Port wird 32500 verwendet.",
        "Episodes": "Folgen",
        "Error {0}": "Fehler {0}",
        "Forward 30 s": "30 s vor",
        "From the start": "Von vorne",
        "Go to show": "Zur Serie",
        "Home": "Start",
        "Mark as unwatched": "Als ungesehen markieren",
        "Mark as watched": "Als gesehen markieren",
        "More from this season": "Mehr aus dieser Staffel",
        "Movies": "Filme",
        "Next episode": "Nächste Folge",
        "No FreeX server answers at {0}.": "Unter {0} antwortet kein FreeX-Server.",
        "No other accounts with a PIN.": "Keine anderen Konten mit PIN.",
        "No titles.": "Keine Titel.",
        "Nothing found for “{0}”.": "Nichts gefunden für „{0}“.",
        "Nothing here yet. Add libraries to your server in FreeX Web.": "Hier ist noch nichts. Lege in FreeX Web Mediatheken auf deinem Server an.",
        "Off": "Aus",
        "Original": "Original",
        "PIN of {0}": "PIN von {0}",
        "Password": "Passwort",
        "Pause": "Pause",
        "Play": "Abspielen",
        "Play now": "Jetzt abspielen",
        "Play {0}": "{0} abspielen",
        "Please enter a valid address.": "Bitte gib eine gültige Adresse ein.",
        "Please sign in again.": "Bitte melde dich erneut an.",
        "Quality": "Qualität",
        "Rating": "Bewertung",
        "Recently added": "Zuletzt hinzugefügt",
        "Removed from the watchlist": "Von der Merkliste entfernt",
        "Resume from {0}": "Fortsetzen ab {0}",
        "Search": "Suche",
        "Seasons": "Staffeln",
        "Server": "Server",
        "Server address": "Serveradresse",
        "Settings": "Einstellungen",
        "Shows": "Serien",
        "Sign in": "Anmelden",
        "Sign in to {0}": "Bei {0} anmelden",
        "Sign out": "Abmelden",
        "Sign out from this TV?": "Auf diesem Fernseher abmelden?",
        "Signed in as": "Angemeldet als",
        "Signing in …": "Melde an …",
        "Skip credits": "Abspann überspringen",
        "Skip intro": "Intro überspringen",
        "Subtitles": "Untertitel",
        "Subtitles: {0}": "Untertitel: {0}",
        "Switch": "Wechseln",
        "Switch user": "Benutzer wechseln",
        "The server cannot be reached": "Der Server ist nicht erreichbar",
        "The subtitles could not be loaded.": "Die Untertitel konnten nicht geladen werden.",
        "The title cannot be played on this device.": "Der Titel kann auf diesem Gerät nicht abgespielt werden.",
        "This library is gone.": "Diese Mediathek gibt es nicht mehr.",
        "This server is not set up yet. Open {0} in a browser and create the admin account first.":
            "Dieser Server ist noch nicht eingerichtet. Öffne {0} im Browser und lege zuerst das Admin-Konto an.",
        "This title cannot be played.": "Dieser Titel kann nicht abgespielt werden.",
        "This title has only one audio track.": "Dieser Titel hat nur eine Tonspur.",
        "Title": "Titel",
        "Title, actor, director …": "Titel, Schauspieler, Regie …",
        "Trailers and extras": "Trailer und Extras",
        "Try again": "Erneut versuchen",
        "Two-factor authentication": "Zwei-Faktor-Anmeldung",
        "Unknown": "Unbekannt",
        "Unwatched": "Ungesehen",
        "Up next in {0} s": "Weiter in {0} s",
        "Username": "Benutzername",
        "Watchlist": "Merkliste",
        "Year": "Jahr",
        "Your watchlist is empty. Add movies and shows on their page.": "Deine Merkliste ist leer. Füge Filme und Serien auf ihrer Seite hinzu.",
        "burned in": "eingebrannt",
        "ends at {0}": "endet um {0}",
        "forced": "erzwungen",
        "1 episode": "1 Folge",
        "1 season": "1 Staffel",
        "1 title": "1 Titel",
        "{0} cannot be reached": "{0} ist nicht erreichbar",
        "{0} episodes": "{0} Folgen",
        "{0} h {1} min": "{0} Std. {1} Min.",
        "{0} min": "{0} Min.",
        "{0} seasons": "{0} Staffeln",
        "{0} titles": "{0} Titel",
    };

    const TABLES = {de: DE};

    function deviceLanguage() {
        const l = (navigator.language || "en").slice(0, 2).toLowerCase();
        return TABLES[l] ? l : "en";
    }

    let lang = deviceLanguage();

    /** "" follows the TV, "de" or "en" as chosen in FreeX Web. */
    function use(l) {
        lang = l && (TABLES[l] || l === "en") ? l : deviceLanguage();
        document.documentElement.lang = lang;
    }

    function t(key) {
        const table = TABLES[lang];
        let s = (table && table[key]) || key;
        for (let i = 1; i < arguments.length; i++) s = s.split("{" + (i - 1) + "}").join(String(arguments[i]));
        return s;
    }

    window.FreeXI18n = {t, use, lang: () => lang};
})();
