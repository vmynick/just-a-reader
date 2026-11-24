import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeZip } from './helpers/zipwriter.mjs';
import { readZip, decodeText } from '../js/core/zip.js';
import { fileToBook, countWords } from '../js/core/convert.js';

const xhtml = (body, title = '') => `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>${title}</title></head>${body}</html>`;

function epub2() {
  return makeZip({
    mimetype: 'application/epub+zip',
    'META-INF/container.xml': '<?xml version="1.0"?><container><rootfiles><rootfile full-path="Ops/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    'Ops/content.opf': `<?xml version="1.0" encoding="UTF-8"?><package version="2.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
      <dc:title>Egri csillagok</dc:title><dc:creator opf:role="aut">Gárdonyi Géza</dc:creator><dc:language>hu</dc:language></metadata>
      <manifest><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
      <item id="c0" href="001.html" media-type="application/xhtml+xml"/><item id="c1" href="002.html" media-type="application/xhtml+xml"/>
      <item id="c2" href="003.html" media-type="application/xhtml+xml"/><item id="c3" href="003b.html" media-type="application/xhtml+xml"/>
      <item id="n" href="notes.html" media-type="application/xhtml+xml"/></manifest>
      <spine toc="ncx"><itemref idref="c0"/><itemref idref="c1"/><itemref idref="c2"/><itemref idref="c3"/><itemref idref="n"/></spine></package>`,
    'Ops/toc.ncx': `<ncx><navMap><navPoint><navLabel><text>Címlap</text></navLabel><content src="001.html"/></navPoint>
      <navPoint><navLabel><text>Első rész - Hol terem a magyar vitéz?</text></navLabel><content src="002.html"/>
        <navPoint><navLabel><text>1</text></navLabel><content src="003.html"/></navPoint></navPoint>
      <navPoint><navLabel><text>Jegyzetek</text></navLabel><content src="notes.html"/></navPoint></navMap></ncx>`,
    'Ops/001.html': xhtml('<body><p>GÁRDONYI GÉZA</p><p>Bankszámlaszáma: 123</p></body>'),
    'Ops/002.html': xhtml('<body><p>Első rész</p><p>Hol terem a magyar vitéz?</p></body>'),
    'Ops/003.html': xhtml('<body><p class="p2"><b>1</b></p><p>A patakban két gyermek fürdik<a href="notes.html#a1"><span>1</span></a>.</p></body>'),
    'Ops/003b.html': xhtml('<body><p>Folytatás ugyanabban a fejezetben.</p></body>'),
    'Ops/notes.html': xhtml('<body><p>Jegyzetek</p><p>1 Valami magyarázat.</p></body>'),
  });
}

test('readZip lists and inflates entries', async () => {
  const z = await readZip(makeZip({ mimetype: 'x', 'a/b.txt': 'árvíztűrő'.repeat(50) }));
  assert.deepEqual(z.names, ['mimetype', 'a/b.txt']);
  assert.equal(await z.text('a/b.txt'), 'árvíztűrő'.repeat(50));
  assert.equal(await z.text('A/B.TXT'), 'árvíztűrő'.repeat(50), 'case-insensitive lookup');
  assert.equal(await z.bytes('missing'), null);
});

test('decodeText honours declared charset and falls back to windows-1250', () => {
  const latin2 = new Uint8Array([0x3c, 0x6d, 0x65, 0x74, 0x61, 0x20, 0x63, 0x68, 0x61, 0x72, 0x73, 0x65, 0x74, 0x3d, 0x69, 0x73, 0x6f, 0x2d, 0x38, 0x38, 0x35, 0x39, 0x2d, 0x32, 0x3e, 0xf5, 0xfb]);
  assert.ok(decodeText(latin2).endsWith('őű'));
  assert.equal(decodeText(new Uint8Array([0xe1, 0xf5])), 'áő', 'invalid UTF-8 → windows-1250');
  assert.equal(decodeText(new TextEncoder().encode('ő')), 'ő');
});

test('EPUB 2 (MEK style): skips cover and notes, nests part titles, merges continuation files', async () => {
  const book = await fileToBook('egri.epub', epub2());
  assert.equal(book.title, 'Egri csillagok');
  assert.equal(book.author, 'Gárdonyi Géza');
  assert.equal(book.lang, 'hu');
  assert.deepEqual(book.chapters.map((c) => c.title), ['Első rész - Hol terem a magyar vitéz?', 'Első rész – 1.']);
  assert.equal(book.chapters[1].text, '1\nA patakban két gyermek fürdik.\nFolytatás ugyanabban a fejezetben.');
  assert.ok(countWords(book.chapters) > 10);
});

test('EPUB 3 (Standard Ebooks style): nav TOC and epub:type skipping', async () => {
  const z = makeZip({
    mimetype: 'application/epub+zip',
    'META-INF/container.xml': '<container><rootfiles><rootfile full-path="epub/content.opf"/></rootfiles></container>',
    'epub/content.opf': `<package version="3.0"><metadata><dc:title id="t">Alice’s Adventures in Wonderland</dc:title><dc:creator id="a">Lewis Carroll</dc:creator><dc:language>en-GB</dc:language></metadata>
      <manifest><item id="toc" href="toc.xhtml" media-type="application/xhtml+xml" properties="nav"/>
      <item id="tp" href="text/titlepage.xhtml" media-type="application/xhtml+xml"/>
      <item id="c1" href="text/chapter-1.xhtml" media-type="application/xhtml+xml"/>
      <item id="im" href="text/imprint.xhtml" media-type="application/xhtml+xml"/></manifest>
      <spine><itemref idref="tp"/><itemref idref="im"/><itemref idref="c1"/></spine></package>`,
    'epub/toc.xhtml': xhtml('<body><nav epub:type="toc"><ol><li><a href="text/titlepage.xhtml">Titlepage</a></li><li><a href="text/chapter-1.xhtml">I: Down the Rabbit-Hole</a></li></ol></nav></body>'),
    'epub/text/titlepage.xhtml': xhtml('<body epub:type="frontmatter"><section epub:type="titlepage"><h1>Alice</h1></section></body>'),
    'epub/text/imprint.xhtml': xhtml('<body epub:type="frontmatter"><section epub:type="imprint"><p>This ebook is the product of many hours.</p></section></body>'),
    'epub/text/chapter-1.xhtml': xhtml('<body epub:type="bodymatter z3998:fiction"><section epub:type="chapter"><h2>I</h2><p>Alice was beginning to get very tired<a href="endnotes.xhtml#note-1" epub:type="noteref">1</a>.</p></section></body>'),
  });
  const book = await fileToBook('alice.epub', z);
  assert.equal(book.lang, 'en');
  assert.deepEqual(book.chapters.map((c) => c.title), ['I: Down the Rabbit-Hole']);
  assert.equal(book.chapters[0].text, 'I\nAlice was beginning to get very tired.');
});

test('MEK HTML zip: index order, ISO-8859-2, heuristic chapter headings', async () => {
  const latin2 = (s) => Uint8Array.from([...s].map((ch) => ({ ő: 0xf5, ű: 0xfb, á: 0xe1, é: 0xe9, Ő: 0xd5 }[ch] ?? ch.charCodeAt(0))));
  const head = '<HTML><HEAD><META HTTP-EQUIV="Content-Type" CONTENT="text/html; CHARSET=iso-8859-2"><TITLE>Mikszáth Kálmán: A Noszty fiú esete</TITLE></HEAD><BODY>';
  const z = makeZip({
    'MEK.HTML': '<p>MEK info</p>',
    'index.htm': latin2(`${head}<P>TARTALOM</P><a href=02.htm#3>HARMADIK</a><a href=01.htm#1>ELSŐ FEJEZET</a></BODY></HTML>`),
    '01.htm': latin2(`${head}<a name=1></a><B><P ALIGN="CENTER">ELSŐ FEJEZET</P></B><P>Abban az időben nyalka huszárezred feküdt.</P></BODY></HTML>`),
    '02.htm': latin2(`${head}<P ALIGN="CENTER">HARMADIK FEJEZET</P><P>Valahogy mindég rendbe jönnek.</P></BODY></HTML>`),
  });
  const book = await fileToBook('00948html.zip', z);
  assert.equal(book.title, 'A Noszty fiú esete');
  assert.equal(book.author, 'Mikszáth Kálmán');
  assert.deepEqual(book.chapters.map((c) => c.title), ['HARMADIK FEJEZET', 'ELSŐ FEJEZET'], 'order follows index.htm');
});

test('MEK single-file HTML: chapters from its internal table of contents', async () => {
  const html = `<HTML><HEAD><TITLE>KARINTHY FRIGYES: TANÁR ÚR KÉREM</TITLE><meta name="dc.title" content="Tanár úr kérem"><meta name="dc.creator" content="Karinthy Frigyes"></HEAD><BODY>
    <P ALIGN="CENTER">TANÁR ÚR KÉREM</P><P ALIGN="CENTER">TARTALOM</P>
    <a href=#1>BEVEZETÉS</a><br><a href=#2>REGGEL HÉTKOR</a><br><a href=#3>ELKÉSTEM</a><br>
    <a name=1></a><P ALIGN="CENTER">BEVEZETÉS</P><P>${'Ez a bevezetés szövege. '.repeat(5)}</P>
    <a name=2></a><P ALIGN="CENTER">REGGEL HÉTKOR</P><P>${'Reggel hétkor csörög az óra. '.repeat(5)}</P>
    <a name=3></a><P ALIGN="CENTER">ELKÉSTEM</P><P>${'Elkéstem az iskolából ma is. '.repeat(5)}</P></BODY></HTML>`;
  const book = await fileToBook('00719.htm', new TextEncoder().encode(html));
  assert.equal(book.title, 'Tanár úr kérem');
  assert.deepEqual(book.chapters.map((c) => c.title), ['BEVEZETÉS', 'REGGEL HÉTKOR', 'ELKÉSTEM']);
  assert.ok(book.chapters[1].text.startsWith('REGGEL HÉTKOR\nReggel hétkor'));
  assert.ok(!book.chapters[0].text.includes('TARTALOM'), 'title page + TOC are dropped');
});

test('MEK framed HTML zip: follows frameset and TOC page, merges tiny part titles', async () => {
  const page = (t, body) => `<html><head><title>${t}</title></head><body>${body}</body></html>`;
  const long = (s) => `<p>${`${s} `.repeat(12)}</p>`;
  const z = makeZip({
    'index.htm': page('Madách Imre - Az ember tragédiája', '<a href="html/index1.htm"><img src="cim.gif"></a>'),
    'html/index1.htm': '<html><frameset><frame SRC="tartalom.htm"><frame SRC="shadow.htm"><frame SRC="embtr01.htm"></frameset></html>',
    'html/tartalom.htm': page('Tartalom', '<a href="embtr00.htm">ELSŐ RÉSZ</a><br><a href="embtr01.htm">ELSŐ SZÍN</a><br><a href="embtr02.htm">MÁSODIK SZÍN</a><br><a href="jegyzet.htm">Jegyzetek</a>'),
    'html/shadow.htm': page('', ''),
    'html/embtr00.htm': page('', '<p>ELSŐ RÉSZ</p>'),
    'html/embtr01.htm': page('', `<p>ELSŐ SZÍN</p>${long('Az Úr, angyalok seregétől körülvéve.')}`),
    'html/embtr02.htm': page('', `<p>MÁSODIK SZÍN</p>${long('Paradicsom. Ádám és Éva.')}`),
    'html/jegyzet.htm': page('', long('Jegyzet szövege.')),
  });
  const book = await fileToBook('00875html.zip', z);
  assert.equal(book.author, 'Madách Imre');
  assert.deepEqual(book.chapters.map((c) => c.title), ['ELSŐ RÉSZ – ELSŐ SZÍN', 'MÁSODIK SZÍN']);
});

test('Project Gutenberg licence header and footer are removed', async () => {
  const txt = ['Title: The Jungle Book', 'Author: Rudyard Kipling', '*** START OF THE PROJECT GUTENBERG EBOOK THE JUNGLE BOOK ***',
    'CHAPTER I', 'Mowgli’s Brothers.', 'CHAPTER II', 'Kaa’s Hunting.', '*** END OF THE PROJECT GUTENBERG EBOOK THE JUNGLE BOOK ***',
    'Updated editions will replace the previous one.'].join('\n\n');
  const b = await fileToBook('pg236.txt', new TextEncoder().encode(txt));
  assert.deepEqual(b.chapters.map((c) => c.title), ['CHAPTER I', 'CHAPTER II']);
  assert.ok(!b.chapters.some((c) => /Gutenberg|Updated editions|Author:/.test(c.text)));
});

test('plain text and FB2 files', async () => {
  const txt = await fileToBook('jegyzet.txt', new TextEncoder().encode('Első bekezdés.\n\nMásodik bekezdés.'));
  assert.equal(txt.title, 'jegyzet');
  assert.equal(txt.chapters[0].text, 'Első bekezdés.\nMásodik bekezdés.');
  const fb2 = `<?xml version="1.0" encoding="utf-8"?><FictionBook><description><title-info><author><first-name>Jókai</first-name><last-name>Mór</last-name></author><book-title>Az arany ember</book-title><lang>hu</lang></title-info></description>
    <body><section><title><p>Első rész</p></title><p>A Vaskapu.</p></section></body><body name="notes"><section><p>jegyzet</p></section></body><binary id="x">AAAA</binary></FictionBook>`;
  const b = await fileToBook('arany.fb2', new TextEncoder().encode(fb2));
  assert.equal(b.title, 'Az arany ember');
  assert.equal(b.lang, 'hu');
  assert.deepEqual(b.chapters.map((c) => c.title), ['Első rész']);
  assert.equal(b.chapters[0].text, 'Első rész\nA Vaskapu.');
});
