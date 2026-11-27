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
  for (const rel of [
    'src/lib/hindiAutocorrectData.ts',
    'src/lib/hindiAutocorrect.ts',
    'src/lib/suggestionStore.ts',
  ]) {
    const source = fs.readFileSync(path.join(root, rel), 'utf8');
    const js = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    fs.writeFileSync(path.join(dir, path.basename(rel).replace(/\.ts$/, '.js')), js);
  }
  const lib = require(path.join(dir, 'hindiAutocorrect.js'));
  const storeModule = require(path.join(dir, 'suggestionStore.js'));
  return { lib, store: storeModule.suggestionStore };
}

const { lib, store } = loadLib();
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

test('phase 2: promoted corrections act as personal silent entries', () => {
  const key = normalizeHindi('बताईये');
  store.recordHindiAccept(key, 'बताइए');
  // One accept is not enough - the suggestion still comes from the dictionary.
  assert.equal(lookupHindiCorrection('बताईये', store.getHindiCorrectionBias())?.level, 'suggested');
  store.recordHindiAccept(key, 'बताइए');
  const bias = store.getHindiCorrectionBias();
  assert.equal(bias.promoted[key], 'बताइए');
  // Now it resolves silently, and the officer's choice outranks the dictionary.
  const result = lookupHindiCorrection('बताईये', bias);
  assert.equal(result?.level, 'silent');
  assert.equal(result?.replacement, 'बताइए');
});

test('phase 2: suppressed corrections stop being offered', () => {
  const key = normalizeHindi('सोचिये');
  store.recordHindiReject(key);
  store.recordHindiReject(key);
  const bias = store.getHindiCorrectionBias();
  assert.equal(bias.suppressed[key], true);
  assert.equal(lookupHindiCorrection('सोचिये', bias), null);
});

test('phase 2: an accept clears the suppression again', () => {
  const key = normalizeHindi('देखिये');
  store.recordHindiReject(key);
  store.recordHindiReject(key);
  assert.equal(lookupHindiCorrection('देखिये', store.getHindiCorrectionBias()), null);
  store.recordHindiAccept(key, 'देखिए');
  store.recordHindiAccept(key, 'देखिए');
  const result = lookupHindiCorrection('देखिये', store.getHindiCorrectionBias());
  assert.equal(result?.replacement, 'देखिए');
});

test('phase 3: isOneEditAway covers insertion, deletion, substitution', () => {
  assert.equal(lib.isOneEditAway('नही', 'नहीं'), true);      // insertion
  assert.equal(lib.isOneEditAway('नहीं', 'नही'), true);      // deletion
  assert.equal(lib.isOneEditAway('विवेचणा', 'विवेचना'), true); // substitution
  assert.equal(lib.isOneEditAway('क्योकि', 'क्योंकि'), true);   // mid-word insertion
  assert.equal(lib.isOneEditAway('गाडि', 'गाडी'), true);
  assert.equal(lib.isOneEditAway('राम', 'श्याम'), false);    // two edits
  assert.equal(lib.isOneEditAway('सम', 'सम'), false);        // identical is not a correction
  assert.equal(lib.isOneEditAway('कर', 'कर्मचारी'), false);  // length gap > 1
});

test('phase 3: corpus suggests the more frequent near-match, never silently', () => {
  const corpus = [
    { word: 'विवेचना', count: 9 },
    { word: 'प्रार्थी', count: 4 },
  ];
  const result = lib.suggestHindiFromCorpus('विवेचणा', corpus);
  assert.ok(result, 'corpus suggestion should fire');
  assert.equal(result.level, 'suggested', 'fuzzy corrections are always confirmed, never silent');
  assert.equal(result.replacement, 'विवेचना');
  // No near match -> nothing.
  assert.equal(lib.suggestHindiFromCorpus('अज्ञातशब्द', corpus), null);
  // The typed word being MORE frequent than the candidate -> nothing.
  assert.equal(
    lib.suggestHindiFromCorpus('विवेचणा', [{ word: 'विवेचना', count: 9 }, { word: 'विवेचणा', count: 12 }]),
    null,
  );
});

test('phase 3: corpus guards block noise', () => {
  const corpus = [{ word: 'गवाही', count: 7 }];
  // Too short (below minLength 4).
  assert.equal(lib.suggestHindiFromCorpus('गवा', corpus), null);
  // Non-Devanagari.
  assert.equal(lib.suggestHindiFromCorpus('gawah', corpus), null);
  // Candidate below the minimum corpus count.
  assert.equal(lib.suggestHindiFromCorpus('गवाहि', [{ word: 'गवाही', count: 1 }]), null);
  // Same frequency as the typed word -> not a confident correction.
  assert.equal(
    lib.suggestHindiFromCorpus('गवाहि', [{ word: 'गवाही', count: 2 }, { word: 'गवाहि', count: 2 }]),
    null,
  );
  // Best (most frequent) candidate wins.
  const best = lib.suggestHindiFromCorpus('तलासि', [
    { word: 'तलाशि', count: 2 },
    { word: 'तलासी', count: 9 },
  ]);
  assert.equal(best?.replacement, 'तलासी');
});
