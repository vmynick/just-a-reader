# Just A Reader

Szavanként villantó gyorsolvasó telefonra. Beírt vagy bemásolt szöveget és e-könyvet mutat szóról szóra a képernyő közepén, fekvő (vagy álló) módban, teljes képernyőn.

**Megnyitás:** https://vmynick.github.io/just-a-reader/

**Telepítés (ajánlott):** a könyvtár tetején a *Telepítés* gomb (vagy Chrome ⋮ menü → *Alkalmazás telepítése*). Utána „Just A Reader” ikonról indul, teljes képernyőn, a böngésző címsora és a webcím nélkül, internet nélkül is. Böngészőből futtatva a teljes képernyőre váltáskor a Chrome biztonsági okból kiírja a webcímet; ezt csak a telepített alkalmazás kerüli el.

**TV-n olvasás:** az olvasó menüjében a *TV-re* gomb lépésenként leírja a képernyő-tükrözést (Android: *Képernyő átküldése* / *Smart View*, Chromecast, Google TV, okos-TV). A telefon marad a távirányító. A *TV-mód* nagyobb betűt és sarokinfót ad, hogy messziről is olvasható legyen.

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

## Könyvek és rövid szövegek

A katalógusban 48 közkincs könyv van: 27 magyar a [Magyar Elektronikus Könyvtárból](https://mek.oszk.hu), 21 angol a [Standard Ebooksból](https://standardebooks.org) és a [Project Gutenbergről](https://www.gutenberg.org).

Emellett 627 rövid szöveg (pár perc vagy pár másodperc alatt elolvasható), gyűjteményenként csoportosítva:

| | Magyar | English |
|---|---|---|
| **Mesék** (153) | Benedek Elek, Móra Ferenc: Csicseri történet, Mikszáth: Csodaszép mesék | Wilde: Children’s Stories, Kipling: Just So Stories |
| **Novellák** (111) | Mikszáth: A jó palócok, Karinthy: Tanár úr kérem, Gárdonyi: Az én falum | O. Henry, Poe, Saki, Csehov |
| **Versek** (208) | Petőfi, Arany, Ady, Vörösmarty, Kölcsey (Himnusz), Csokonai, Tóth Árpád, Juhász Gyula, Babits | Shakespeare szonettjei, Poe, Keats, Blake, Dickinson, Stevenson: A Child’s Garden of Verses |
| **Dalok** (155) | 120 magyar népdal (Endrődi Sándor és Erdélyi János gyűjtéséből) | Burns dalai (Auld Lang Syne…), 28 régi angol karácsonyi ének |

Mai, szerzői jog alatt álló dalszövegeket nem lehet nyilvános katalógusba tenni, de bármelyiket bemásolhatod az *Új szöveg* gombbal: az csak a te telefonodon marad.

Az első indításkor 6 könyv és 9 rövid szöveg magától letöltődik. A többit a *Böngészés* oldalon jelölheted ki (Rövid / Könyvek szűrő, azon belül Mesék / Novellák / Versek / Dalok; gyűjteményenként „Mindet kijelölöm”).

### Új könyv vagy gyűjtemény a katalógusba

1. GitHub → **Actions** → **Könyv hozzáadása** → **Run workflow**.
2. Bemásolod a linket, például `https://mek.oszk.hu/00600/00656/`, `https://standardebooks.org/ebooks/jane-austen/emma` vagy `https://www.gutenberg.org/ebooks/1342`.
3. Mese-, vers- vagy novellagyűjteménynél pipáld be a **Rövid szövegekre bontás** mezőt. Ha csak néhány darab kell belőle, a címüket `|` jellel elválasztva írd be (pl. `A walesi bárdok|Családi kör`).
4. Kb. két perc múlva megjelenik a *Böngészés* oldalon.

Gépen ugyanez: `node tools/add-book.mjs <link> [--split] [--genre mese|novella|vers|dal] [--only "^(cím1|cím2)"] [--dry]`. A `--dry` csak kilistázza a részeket; számozott daraboknál (népdalok, szonettek) `--by-number`, nagy gyűjteményből mintának `--sample 50`, MEK versesköteteknél `--format html`. Törlés a katalógusból: `--remove <azonosító>`. Több forrás egyszerre: `node tools/add-book.mjs --list tools/seed-books.txt` vagy `tools/seed-short.txt`.

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
