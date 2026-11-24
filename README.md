# Just A Reader

Szavanként villantó gyorsolvasó telefonra. Beírt vagy bemásolt szöveget és e-könyvet mutat szóról szóra a képernyő közepén, fekvő (vagy álló) módban, teljes képernyőn.

**Megnyitás:** https://vmynick.github.io/just-a-reader/

Chrome-ban a menü → *Hozzáadás a kezdőképernyőhöz* (vagy *Alkalmazás telepítése*) után saját ikonról indul, teljes képernyőn, internet nélkül is.

## Vezérlés

| Olvasás közben | |
|---|---|
| Nyomva tartás | megáll, amíg nyomod; elengedve folytatja |
| Koppintás | megállítja |
| Húzás fel / le | gyorsabb / lassabb (10 szó/perc lépésekben) |
| Legyintés balra | vissza az előző mondat elejére (többször is lehet) |
| Legyintés jobbra | egy mondattal előre |

| Megállítva | |
|---|---|
| Koppintás jobb oldalt / bal oldalt | egy szóval előre / vissza |
| Koppintás középen | folytatja |
| ☰ fent középen | menü: elölről, ismétlés, bekezdés, fejezetek, gyors beállítások |

A legyintés iránya a beállításokban megfordítható.

## Mit tud még

- Fókuszbetű: a szó egy betűje színes, és mindig ugyanott áll.
- Okos szünetek mondat végén, vesszőnél és hosszú szónál, lassú indulás, fokozatos gyorsítás.
- 1–3 szó villanásonként, témák, betűtípus, betűméret és színek állíthatók.
- Minden szövegnél megjegyzi, hol tartasz. Bármikor kezdheted elölről, a rövid szöveget ismételtetheted.
- Saját szövegek írása, szerkesztése, törlése (szerkesztés után is a helyén marad az olvasási pozíció).
- Fájl megnyitása: EPUB, TXT, HTML, FB2, MEK-féle HTML ZIP, PDF. Androidon a *Megosztás → Just A Reader* is működik, ha az app telepítve van.
- Statisztika, mentés fájlba és visszatöltés (minden adat csak a telefonon tárolódik).

## Könyvek

A katalógusban 47 közkincs könyv van: 27 magyar a [Magyar Elektronikus Könyvtárból](https://mek.oszk.hu), 20 angol a [Standard Ebooksból](https://standardebooks.org). Közülük 6 az első indításkor magától letöltődik, a többit a *Könyvek böngészése* oldalon jelölheted ki.

### Új könyv a katalógusba

1. GitHub → **Actions** → **Könyv hozzáadása** → **Run workflow**.
2. Bemásolod a linket, például `https://mek.oszk.hu/00600/00656/`, `https://standardebooks.org/ebooks/jane-austen/emma` vagy `https://www.gutenberg.org/ebooks/1342`.
3. Kb. két perc múlva megjelenik a *Könyvek böngészése* oldalon.

Gépen ugyanez: `node tools/add-book.mjs <link>`. Több könyv egyszerre: `node tools/add-book.mjs --list tools/seed-books.txt`.

## Fejlesztés

Nincs build lépés, sima HTML + JavaScript modulok.

```sh
npm test          # egységtesztek (Node 20+)
npm run serve     # http://localhost:8080
```

Androidos emulátoron: `adb reverse tcp:8080 tcp:8080`, majd Chrome-ban `http://localhost:8080`.

A `main` ágra küldött változást a *Közzététel* workflow teszteli és kiteszi a GitHub Pagesre.

## Licencek

- A beépített könyvek közkincsek (a szerzők több mint 70 éve haltak meg, a művek 1931 előtt jelentek meg).
- Betűtípusok: Literata, Atkinson Hyperlegible – SIL Open Font License 1.1 (`fonts/`).
- PDF-olvasás: [pdf.js](https://mozilla.github.io/pdf.js/) – Apache 2.0 (`vendor/pdfjs/`).
