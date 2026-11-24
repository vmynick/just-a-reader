// Heuristic chapter-heading detection for sources without <h1>…<h6>
// (old MEK HTML, plain text, PDF): "I.", "12.", "ELSŐ FEJEZET", "Chapter IV".

const HU_ORD = '(első|második|harmadik|negyedik|ötödik|hatodik|hetedik|nyolcadik|kilencedik|tizedik|tizen\\S*|huszadik|huszon\\S*|harmincadik|harminc\\S*|negyvenedik|negyven\\S*|ötvenedik|ötven\\S*|utolsó)';
const EN_NUM = '(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty\\S*|thirty\\S*|forty\\S*|fifty\\S*|the\\s+\\w+)';
const ROMAN = '[IVXLCDM]{1,7}';

const PATTERNS = [
  new RegExp(`^(${ROMAN}|\\d{1,3})\\.?$`),
  new RegExp(`^(${ROMAN}|\\d{1,3})\\.?\\s*(fejezet|rész|könyv|ének)\\b`, 'i'),
  new RegExp(`^${HU_ORD}\\s+(fejezet|rész|könyv|ének)\\b`, 'i'),
  new RegExp(`^(chapter|part|book|canto|letter|stave)\\s+(${ROMAN}|\\d{1,3}|${EN_NUM})\\b`, 'i'),
  /^(előszó|bevezetés|utószó|epilógus|prológus|prologue|epilogue|preface|introduction)$/i,
];

export function isHeadingText(text) {
  const t = text.trim();
  if (!t || t.length > 70) return false;
  return PATTERNS.some((re) => re.test(t));
}

/** Promote heading-like paragraphs to level-2 headings (keeps real headings). */
export function markHeadings(blocks) {
  return blocks.map((b) => (b.h || !isHeadingText(b.text) ? b : { text: b.text, h: 2 }));
}
