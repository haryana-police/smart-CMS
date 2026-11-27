const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

/**
 * Loads the pure matcher (src/lib/hindiAutocorrect.ts) plus its data file by
 * transpiling both into a temp dir. The DOM plumbing in the hook stays
 * browser-only; everything decidable with strings is covered here.
 */
function loadLib() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hindi-ac-'));
  for (const rel of ['src/lib/hindiAutocorrectData.ts', 'src/lib/hindiAutocorrect.ts']) {
    const source = fs.readFileSync(path.join(root, rel), 'utf8');
    const js = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    fs.writeFileSync(path.join(dir, path.basename(rel).replace(/\.ts$/, '.js')), js);
  }
  return require(path.join(dir, 'hindiAutocorrect.js'));
}

const lib = loadLib();
const { lookupHindiCorrection, normalizeHindi } = lib;

test('legacy corrections keep working through the data file', () => {
  const silent = [
    ['कृप्या', 'कृपया'],
    ['क्योकि', 'क्योंकि'],
    ['क्योँकि', 'क्योंकि'],
    ['किजिए', 'कीजिए'],
    ['दिजिए', 'दीजिए'],
    ['लिजिए', 'लीजिए'],
  ];
  for (const [wrong, right] of silent) {
    const result = lookupHindiCorrection(wrong);
    assert.ok(result, `missing silent correction for ${wrong}`);
    assert.equal(result.level, 'silent');
    assert.equal(result.replacement, right);
  }
  for (const [wrong, right] of [['करिये', 'करिए'], ['जाइये', 'जाइए']]) {
    const result = lookupHindiCorrection(wrong);
    assert.ok(result, `missing suggestion for ${wrong}`);
    assert.equal(result.level, 'suggested');
    assert.equal(result.replacement, right);
  }
});

test('phase 1 seed entries resolve (police + common)', () => {
  const silent = [
    ['नही', 'नहीं'],
    ['विवेचणा', 'विवेचना'],
    ['तलासी', 'तलाशी'],
    ['आरोपि', 'आरोपी'],
    ['प्रार्थि', 'प्रार्थी'],
    ['प्रारुप', 'प्रारूप'],
    ['निरिक्षण', 'निरीक्षण'],
    ['रिपोर्त', 'रिपोर्ट'],
    ['जम्मानत', 'जमानत'],
    ['अधिकारि', 'अधिकारी'],
    ['कार्यवाहि', 'कार्यवाही'],
  ];
  for (const [wrong, right] of silent) {
    const result = lookupHindiCorrection(wrong);
    assert.ok(result, `missing correction for ${wrong}`);
    assert.equal(result.level, 'silent');
    assert.equal(result.replacement, right);
  }
});

test('typing the corrected form itself is always a no-op', () => {
  for (const correct of ['कृपया', 'नहीं', 'विवेचना', 'क्योंकि', 'करिए', 'कीजिए']) {
    assert.equal(lookupHindiCorrection(correct), null, `correct word must not be rewritten: ${correct}`);
  }
});

test('nukta and candrabindu variants collapse for matching only', () => {
  assert.equal(normalizeHindi('ज़रूरी'), normalizeHindi('जरूरी'));
  assert.equal(normalizeHindi('फ़ाइल'), normalizeHindi('फाइल'));
  assert.equal(normalizeHindi('डायरी'), normalizeHindi('डायरी'));
  assert.equal(normalizeHindi('क्योँकि'), normalizeHindi('क्योंकि'));
  // NFC/decomposed input still matches the composed dictionary key.
  const decomposed = 'कृप्या'.normalize('NFD');
  assert.equal(lookupHindiCorrection(decomposed)?.replacement, 'कृपया');
  // The nukta-less typing of an entry that carries a nukta still matches.
  assert.equal(lookupHindiCorrection('गाडि')?.replacement, 'गाड़ी');
});

test('character classes: word chars, boundaries, guards', () => {
  // Word characters.
  assert.ok(lib.HINDI_WORD_CHAR_RE.test('अक्षर'));
  assert.ok(lib.HINDI_WORD_CHAR_RE.test('\u0928\u0939\u0940\u0902'));
  assert.ok(!lib.HINDI_WORD_CHAR_RE.test(' '));
  assert.ok(!lib.HINDI_WORD_CHAR_RE.test('abc'));
  // Boundary characters (space, NBSP, dandas, punctuation, new separators).
  for (const ch of [' ', '\u00A0', '\u0964', '\u0965', ',', '.', '!', '?', ';', ':', '-', '/', ')']) {
    assert.ok(lib.HINDI_BOUNDARY_CHAR_RE.test(ch), `boundary must accept ${JSON.stringify(ch)}`);
  }
  assert.ok(!lib.HINDI_BOUNDARY_CHAR_RE.test('क'));
  // Guards.
  assert.equal(lib.isFollowedByWordChar(' और'), false);
  assert.equal(lib.isFollowedByWordChar('और'), true);
  assert.equal(lib.isPrecededByWordChar('('), false);
  assert.equal(lib.isPrecededByWordChar('विषय-'), false, 'hyphen is not a word character');
  assert.equal(lib.isPrecededByWordChar('अति'), true);
  assert.equal(lib.blockContainsQuote('बयान: "मैं गया"'), true);
  assert.equal(lib.blockContainsQuote('बयान किया गया'), false);
});

test('dictionary data is lint-clean', () => {
  const entries = lib.__hindiAutocorrectTesting.HINDI_CORRECTIONS;
  assert.ok(entries.length >= 60, 'seed list should stay substantial');
  for (const entry of entries) {
    assert.ok(entry.wrong && entry.right, 'entries must be non-empty');
    assert.notEqual(entry.wrong, entry.right);
    assert.ok(['silent', 'suggested', 'off'].includes(entry.level), 'valid level');
  }
  // Silent entries must never collide with a suggested one on the same
  // normalized key with a different replacement.
  const { silentMap, suggestedMap } = lib.__hindiAutocorrectTesting;
  for (const [key, right] of silentMap) {
    const suggested = suggestedMap.get(key);
    if (suggested) assert.equal(suggested, right, `conflicting levels for key ${key}`);
  }
});

test('the data file stays pure ASCII (tooling-safe \\uXXXX convention)', () => {
  const source = fs.readFileSync(path.join(root, 'src/lib/hindiAutocorrectData.ts'), 'utf8');
  const nonAscii = source.match(/[^\x00-\x7F]/g);
  assert.equal(nonAscii, null, 'data file must contain no raw Devanagari bytes');
});
