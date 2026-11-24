# Just A Reader – design (2026-11-24)

## Intent
A personal word-by-word (RSVP) reader for an Android phone, reached from GitHub Pages. Reads typed/pasted text and e-books; Hungarian classics and some English books are bundled. The user approved every feature suggested from competitor research and asked to start building.

## Goals
- One word (or 1–3) at a time in the screen centre, landscape by default, portrait possible; fullscreen while reading (no browser or system bars).
- Adjustable font, size, colours, background; ready-made themes.
- Speed control: vertical drag while reading, faint WPM and word count in the corners.
- Touch control: hold = pause while held; tap = pause; when paused, tap right/left = one word forward/back, centre = resume; horizontal swipe = back/forward one sentence.
- Remembers the position in every text; restart from the beginning; loop short texts.
- Own texts editable and deletable later; position survives edits.
- Browse a catalogue, tick books, download for offline reading; add new books to the catalogue later.

## Non-goals
- Sync between devices (all data lives in the phone's browser; backup/restore file instead).
- DRM'd e-books, cloud accounts, text-to-speech.

## Competitor-derived features (approved)
Focus letter (ORP) at a fixed anchor, smart pauses (sentence/clause/paragraph/long word/number), ramp-up after start, context sentence when paused, paragraph view with tap-to-jump, 1–3 word chunks, chapter list, remaining time, progress bar, statistics, gradual speed training.

## Constraints found during research
- MEK and Gutenberg do not send CORS headers → a browser on another origin cannot download from them. Books therefore live in this repo and are served by GitHub Pages (same origin).
- Fullscreen needs a user gesture; orientation lock only works in fullscreen / installed app (Android Chrome).
- Gutenberg's main site returned 503 to scripted downloads; English books come from Standard Ebooks, with Gutenberg (+ pglaf mirror) as fallback in the tool.

## Approaches considered
1. **Static vanilla JS (ES modules), no build** – chosen. GitHub Pages serves the repo directly, nothing to install, fast on a phone, easy to change.
2. Vite + framework with a CI build – more structure, but a toolchain to maintain for a single-user app.
3. Native/Capacitor app – not reachable from GitHub Pages; rejected.

## Design
- `js/core/*` – pure, DOM-free modules shared by browser and Node: ZIP reader (DecompressionStream), EPUB 2/3 parser (OPF, NCX/nav TOC, skips cover/notes/imprint), HTML→text, MEK HTML-zip converter (follows index/frames/TOC anchors), heading heuristics, tokenizer with sentence/clause/paragraph flags (Hungarian ordinals, abbreviations, dialogue dashes), timing (ORP, delays, chunking, ramp), position remap after edits.
- Storage: IndexedDB (`items`, `content`, `progress`, `stats`); settings in localStorage. Progress of catalogue books is kept when the book is removed, so a re-download resumes.
- Catalogue: `books/catalog.json` + `books/<lang>/<id>.json` (pre-converted chapters). `tools/add-book.mjs` downloads + converts; GitHub workflow "Könyv hozzáadása" runs it from a link and redeploys.
- PWA: manifest (fullscreen display, share target for files/text), service worker precaching the app shell; pdf.js is vendored and lazy-loaded.
- Visual direction: night-blue paper (#161a33), warm white type, amber focus letter; Literata for reading, Atkinson Hyperlegible for UI; six themes incl. AMOLED, paper, sepia, high contrast.

## Calls made by the builder (correctable)
- Default 300 wpm, focus anchor at 40 % of the width, swipe-left = back (switchable in settings).
- Swipe back goes to the current sentence start, or the previous sentence if fewer than 3 words into the current one.
- Six books preinstalled (3 HU, 3 EN); a short Hungarian welcome text explains the gestures.
- Only public-domain works (author dead 70+ years and published before 1931).
