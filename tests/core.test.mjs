import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  tokenize, splitWords, F_SENT, F_CLAUSE, F_PARA, prevSentenceStart, nextSentenceStart,
  sentenceStart, paragraphRange, chapterAt,
} from '../js/core/tokenize.js';
import { orpIndex, chunkAt, delayFor, prevChunkStart, rampFactor, formatDuration, formatNumber } from '../js/core/timing.js';
import { remapIndex } from '../js/core/remap.js';
import { htmlToBlocks, blocksToChapters, decodeEntities } from '../js/core/html2text.js';
import { isHeadingText } from '../js/core/headings.js';
import { textToBook } from '../js/core/convert.js';

const tok = (text) => tokenize([{ title: '', text }]);

test('splitWords attaches dashes and punctuation to words', () => {
  assert.deepEqual(splitWords('– Ki az? – kérdezte.'), ['– Ki', 'az?', '– kérdezte.']);
  assert.deepEqual(splitWords('Nem tudom …'), ['Nem', 'tudom…']);
  assert.deepEqual(splitWords('Ez „idézet” itt'), ['Ez', '„idézet”', 'itt']);
  assert.deepEqual(splitWords('vége –'), ['vége –']);
  assert.deepEqual(splitWords('* * *'), ['* * *']);
});

test('sentence detection handles Hungarian ordinals, abbreviations and dialogue', () => {
  const t = tok('1848. március 15-én kezdődött. Mr. Smith jött, stb. ami jó. – Ki az? – kérdezte. Vége!');
  const at = (w) => t.flags[t.words.indexOf(w)];
  assert.equal(at('1848.') & F_SENT, 0);
  assert.ok(at('kezdődött.') & F_SENT);
  assert.equal(at('Mr.') & F_SENT, 0);
  assert.ok(at('jött,') & F_CLAUSE);
  assert.equal(at('stb.') & F_SENT, 0);
  assert.ok(at('az?') & F_CLAUSE, 'question followed by lowercase "kérdezte" is not a sentence end');
  assert.equal(at('az?') & F_SENT, 0);
  assert.ok(at('Vége!') & F_PARA);
});

test('paragraph and chapter bookkeeping', () => {
  const t = tokenize([
    { title: 'Egy', text: 'Első bekezdés itt.\nMásodik bekezdés.' },
    { title: '', text: '' },
    { title: 'Kettő', text: 'Harmadik.' },
  ]);
  assert.deepEqual(t.chapterStarts, [0, 5]);
  assert.deepEqual(t.chapterTitles, ['Egy', 'Kettő']);
  assert.ok(t.flags[2] & F_PARA);
  assert.deepEqual(paragraphRange(t.flags, 4), [3, 4]);
  assert.equal(chapterAt(t.chapterStarts, 4), 0);
  assert.equal(chapterAt(t.chapterStarts, 5), 1);
});

test('sentence navigation: back to sentence start, or previous sentence when just started', () => {
  const t = tok('Egy kettő három négy. Öt hat hét nyolc kilenc. Tíz.');
  // words: 0 Egy 1 kettő 2 három 3 négy. 4 Öt 5 hat 6 hét 7 nyolc 8 kilenc. 9 Tíz.
  assert.equal(sentenceStart(t.flags, 7), 4);
  assert.equal(prevSentenceStart(t.flags, 7), 4);
  assert.equal(prevSentenceStart(t.flags, 5), 0, 'one word into a sentence goes to the previous one');
  assert.equal(prevSentenceStart(t.flags, 0), 0);
  assert.equal(nextSentenceStart(t.flags, 5), 9);
  assert.equal(nextSentenceStart(t.flags, 9), 9);
});

test('orpIndex picks the focus letter and skips leading punctuation', () => {
  assert.equal(orpIndex('a'), 0);
  assert.equal(orpIndex('alma'), 1);
  assert.equal(orpIndex('Gárdonyi'), 2);
  assert.equal(orpIndex('„Hello'), 2);
  assert.equal(orpIndex('– Ki'), 3);
  assert.equal(orpIndex('elkelkáposztástalaníthatatlanságoskodásaitokért'), 4);
});

test('chunkAt groups words but never across pauses', () => {
  const t = tok('a b c d, e f g.');
  assert.equal(chunkAt(t.words, t.flags, 0, 3), 3);
  assert.equal(chunkAt(t.words, t.flags, 3, 3), 1, '"d," ends a clause');
  assert.equal(chunkAt(t.words, t.flags, 4, 2), 2);
  assert.equal(chunkAt(t.words, t.flags, 0, 1), 1);
  assert.equal(prevChunkStart(t.words, t.flags, 3, 3), 0);
  assert.equal(prevChunkStart(t.words, t.flags, 4, 1), 3);
});

test('delayFor adds pauses for punctuation and long words', () => {
  const t = tok('rövid, hosszúhosszúhosszúszó vége.');
  const s = { wpm: 600, smartPauses: true, pauseStrength: 1 };
  const base = 100;
  assert.equal(delayFor(t.words, t.flags, 0, 1, s), base * 1.5);
  assert.ok(delayFor(t.words, t.flags, 1, 1, s) > base * 1.5);
  assert.equal(delayFor(t.words, t.flags, 2, 1, s), base * 2.6, 'paragraph end');
  assert.equal(delayFor(t.words, t.flags, 2, 1, { ...s, smartPauses: false }), base);
  assert.ok(rampFactor(0) < rampFactor(3) && rampFactor(10) === 1);
});

test('formatting helpers', () => {
  assert.equal(formatNumber(86310), '86 310');
  assert.equal(formatDuration(135 * 60000), '2 ó 15 p');
  assert.equal(formatDuration(20000), '<1 p');
});

test('remapIndex keeps position after edits', () => {
  const a = tok('Egy kettő három négy öt hat hét nyolc kilenc tíz.').words;
  const b = tok('Új mondat az elején. Egy kettő három négy öt hat hét nyolc kilenc tíz.').words;
  assert.equal(remapIndex(a, 5, b), 9);
  assert.equal(remapIndex(a, 0, b), 0);
  const c = tok('Teljesen más szöveg lett belőle.').words;
  assert.ok(remapIndex(a, 9, c) <= c.length - 1);
});

test('htmlToBlocks strips tags, decodes entities, keeps headings', () => {
  const html = `<html><head><title>X</title><style>p{}</style></head><body>
    <h2 class="c">Első
      fejezet</h2><p>Árvíztűrő &ndash; t&uuml;k&ouml;rf&uacute;r&oacute;g&eacute;p&odblac;<a href="notes.html#n1"><span>12</span></a>.</p>
    <p>Második<br/>sor <sup>3</sup>vége &#8230;</p></body></html>`;
  const b = htmlToBlocks(html);
  assert.deepEqual(b, [
    { text: 'Első fejezet', h: 2 },
    { text: 'Árvíztűrő – tükörfúrógépő.' },
    { text: 'Második' },
    { text: 'sor vége …' },
  ]);
  assert.equal(decodeEntities('&Odblac;&#x171;&unknown;'), 'Őű&unknown;');
});

test('blocksToChapters splits at headings and drops a tiny title page', () => {
  const ch = blocksToChapters([
    { text: 'Molnár Ferenc' }, { text: 'A Pál utcai fiúk' },
    { text: 'I.', h: 2 }, { text: 'Háromnegyed egykor.' },
    { text: 'II.', h: 2 }, { text: 'Másnap.' },
  ], 'Könyv');
  assert.deepEqual(ch.map((c) => c.title), ['I.', 'II.']);
  assert.equal(ch[0].text, 'I.\nHáromnegyed egykor.');
});

test('heading heuristics', () => {
  for (const t of ['I.', 'XII', '3.', 'ELSŐ FEJEZET', 'Tizenegyedik fejezet', 'Chapter IV', 'CHAPTER ONE', 'Második rész']) assert.ok(isHeadingText(t), t);
  for (const t of ['Igen.', 'A fejezet végén', 'Chapter and verse were quoted at length by the vicar']) assert.ok(!isHeadingText(t), t);
});

test('textToBook: blank-line paragraphs and chapter headings', () => {
  const b = textToBook('CHAPTER I\n\nIt was a dark\nand stormy night.\n\nCHAPTER II\n\nMorning.', 'Story');
  assert.deepEqual(b.chapters.map((c) => c.title), ['CHAPTER I', 'CHAPTER II']);
  assert.equal(b.chapters[0].text, 'CHAPTER I\nIt was a dark and stormy night.');
  const plain = textToBook('Egy sor.\nMásik sor.', 'Jegyzet');
  assert.equal(plain.chapters.length, 1);
  assert.equal(plain.chapters[0].text, 'Egy sor.\nMásik sor.');
});
