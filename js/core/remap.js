// Keep the reading position when a user edits their own text: find the words
// that were on screen in the new version, nearest to the old index.

export function remapIndex(oldWords, oldIdx, newWords) {
  if (!newWords.length || oldIdx <= 0 || !oldWords.length) return 0;
  const idx = Math.min(oldIdx, oldWords.length - 1);
  for (const k of [6, 4, 2, 1]) {
    const key = oldWords.slice(idx, idx + k);
    if (key.length < k && k > 1) continue;
    let best = -1;
    let bestDist = Infinity;
    outer: for (let j = 0; j + key.length <= newWords.length; j++) {
      for (let t = 0; t < key.length; t++) if (newWords[j + t] !== key[t]) continue outer;
      const d = Math.abs(j - idx);
      if (d < bestDist) { best = j; bestDist = d; }
    }
    // A single-word match far away is probably a different occurrence.
    if (best >= 0 && (k > 1 || bestDist < 50)) return best;
  }
  return Math.min(newWords.length - 1, Math.round((idx * newWords.length) / oldWords.length));
}
