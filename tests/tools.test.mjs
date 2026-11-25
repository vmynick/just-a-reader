import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shortTextTitle, onlyNames, slugify } from '../tools/add-book.mjs';

test('short text titles: sentence case, proper nouns from the text, bare numerals', () => {
  assert.equal(shortTextTitle('REGGEL HÉTKOR', 'Tanár úr kérem'), 'Reggel hétkor');
  assert.equal(shortTextTitle('HAMMAS GYURKA', 'Mesék', [], 'Volt egyszer Gyurka. Gyurka elment. A hammas legény.'), 'Hammas Gyurka');
  assert.equal(shortTextTitle('A VAS EMBER', 'Mesék', [], 'Vas volt. A vas kemény.'), 'A vas ember', 'lowercase use in the text wins');
  assert.equal(shortTextTitle('IV.', 'János vitéz'), 'János vitéz – IV.');
  assert.equal(shortTextTitle('PATÓ PÁL ÚR', 'Versek', ['Pató Pál úr']), 'Pató Pál úr');
  assert.equal(shortTextTitle('„A tölgyek alatt”', 'Versek'), 'A tölgyek alatt');
  assert.equal(shortTextTitle('The Gift of the Magi', 'Short Fiction'), 'The Gift of the Magi');
});

test('onlyNames extracts plain alternatives from --only', () => {
  assert.deepEqual(onlyNames('^(A walesi bárdok|Családi kör)'), ['A walesi bárdok', 'Családi kör']);
  assert.deepEqual(onlyNames('Tell.Tale'), []);
  assert.equal(slugify('Gárdonyi Géza: Egri csillagok!'), 'gardonyi-geza-egri-csillagok');
});
