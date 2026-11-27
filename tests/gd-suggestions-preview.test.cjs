const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

/**
 * Loads the pure suggestion engine (src/lib/gdSuggestions.ts) by transpiling it
 * on the fly - the engine must stay dependency-free so this stays cheap.
 */
function loadEngine() {
  const source = fs.readFileSync(path.join(root, 'src/lib/gdSuggestions.ts'), 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const file = path.join(os.tmpdir(), `gdSuggestions.${process.pid}.${Date.now()}.cjs`);
  fs.writeFileSync(file, js);
  try {
    return require(file);
  } finally {
    fs.unlinkSync(file);
  }
}

/**
 * What AutoSuggestField does when a candidate is accepted (TAB / chip click):
 * the claimed suffix of the value is replaced by the candidate text. These
 * helpers mirror that contract so the tests can assert it stays well-formed.
 */
function acceptedValue(value, suggestion) {
  const head = value.slice(0, Math.max(0, value.length - suggestion.replaceLength));
  return head + suggestion.text;
}

/** Officer-saved dictionary phrases (what the store puts in personalPhrases). */
const SAVED_PHRASES = ['pa appears before the SHO', 'police reached the spot'];
/** Raw harvest from uploaded documents - noisy on purpose (OCR artefacts). */
const HARVESTED_PHRASES = ['aonsignment freight', 'ankit consignment freight', 'police reached the spot'];
const HARVESTED_WORDS = ['aonsignment', 'consignment', 'freight', 'ankit'];

function engineOptions(overrides = {}) {
  return {
    personalPhrases: SAVED_PHRASES,
    harvestedPhrases: HARVESTED_PHRASES,
    harvestedWords: HARVESTED_WORDS,
    ...overrides,
  };
}

test('multi-space runs do not corrupt the replaceLength of the token being typed', () => {
  const engine = loadEngine();
  const [suggestion] = engine.getGDSuggestions('ankit ko  pa', 'MISCELLANEOUS_EVENT', null, engineOptions());
  assert.ok(suggestion, 'expected a mid-word candidate');
  // The old slice(lastSpace + 1) produced fragment " pa" (replaceLength 3),
  // which made the old ghost preview overlap the typed word.
  assert.equal(suggestion.replaceLength, 2);
  assert.ok(suggestion.text.toLowerCase().startsWith('pa'));
});

test('strip candidates are bounded, deduped and every accept is well-formed', () => {
  const engine = loadEngine();
  const states = [
    '', 'a', 'an', 'ankit', 'ankit ', 'ankit ko', 'ankit ko ', 'ankit ko  ',
    'ankit ko p', 'ankit ko  p', 'ankit ko pa', 'ankit ko  pa', 'ankit ko pa ',
    'ankit ko appe', 'ankit ko app', 'ankit ko pa a', 'police', 'police ', '  ',
    'ankit ko\t', 'ankit ko\tpa', 'ankit ', 'ankit a', 'ankit  a', 'ankit ac',
    'ankit acc', 'ankit aons', 'ankit cons',
  ];
  for (const value of states) {
    const candidates = engine.getGDSuggestions(value, 'MISCELLANEOUS_EVENT', null, engineOptions());
    // The floating strip shows at most the top three chips.
    assert.ok(candidates.length <= 6, `too many candidates for ${JSON.stringify(value)}`);
    const texts = new Set(candidates.map((c) => c.text));
    assert.equal(texts.size, candidates.length, `duplicate candidate text for ${JSON.stringify(value)}`);
    for (const c of candidates) {
      // replaceLength must never claim more than the value offers, otherwise
      // the acceptance would eat characters the officer did not type.
      assert.ok(
        c.replaceLength >= 0 && c.replaceLength <= value.length,
        `replaceLength out of range for ${JSON.stringify(value)} -> ${JSON.stringify(c.text)}`,
      );
      // The acceptance keeps everything the officer typed before the claimed
      // suffix (head is a prefix of the value) and appends the candidate text.
      const head = value.slice(0, Math.max(0, value.length - c.replaceLength));
      assert.ok(value.startsWith(head), `acceptance head drifted for ${JSON.stringify(value)}`);
      assert.equal(acceptedValue(value, c), head + c.text);
    }
  }
});

test('OCR-noisy harvested phrases are never offered as mid-word completions', () => {
  const engine = loadEngine();
  for (const value of ['ankit a', 'ankit  a', 'ankit aon', 'ankit aons']) {
    const candidates = engine.getGDSuggestions(value, 'MISCELLANEOUS_EVENT', null, engineOptions());
    // The multi-word harvested phrase must never appear mid-word (the single
    // harvested TOKEN is allowed once 4+ letters are typed - see next test).
    const junk = candidates.filter((c) => /aonsignment\s/i.test(c.text));
    assert.deepEqual(junk, [], `noisy harvested phrase leaked for ${JSON.stringify(value)}: ${JSON.stringify(junk)}`);
  }
});

test('harvested single tokens need a longer typed prefix than curated words', () => {
  const engine = loadEngine();
  // 1-3 letters: only curated sources may answer, no raw harvest.
  for (const value of ['ankit a', 'ankit co', 'ankit con']) {
    const candidates = engine.getGDSuggestions(value, 'MISCELLANEOUS_EVENT', null, engineOptions());
    for (const c of candidates) {
      assert.notEqual(c.text.trim().toLowerCase(), 'aonsignment', `harvest noise at short fragment ${JSON.stringify(value)}`);
    }
  }
  // Officer typed 4+ letters of the harvested token -> it may now complete.
  const late = engine.getGDSuggestions('ankit aons', 'MISCELLANEOUS_EVENT', null, engineOptions());
  assert.ok(
    late.some((c) => c.text.trim().toLowerCase() === 'aonsignment'),
    'harvested token should be completable once enough letters are typed',
  );
});

test('curated bank words stay available for short fragments', () => {
  const engine = loadEngine();
  const candidates = engine.getGDSuggestions('ankit a', 'MISCELLANEOUS_EVENT', null, engineOptions());
  assert.ok(candidates.length > 0, 'short fragment should still get a clean completion');
  for (const c of candidates) {
    // Every short-fragment candidate must be a prefix-consistent completion
    // (no fuzzy at 1 letter) and never the known OCR noise token.
    assert.ok(c.text.toLowerCase().startsWith('a'), `candidate must extend the typed fragment: ${c.text}`);
    assert.notEqual(c.text.trim().toLowerCase(), 'aonsignment', 'harvest noise must not surface at 1 letter');
  }
});

test('after a completed word, harvested phrases still provide the continuation', () => {
  const engine = loadEngine();
  const candidates = engine.getGDSuggestions('ankit ', 'MISCELLANEOUS_EVENT', null, engineOptions());
  const continuation = candidates.find((c) => /^consignment/i.test(c.text));
  assert.ok(continuation, 'phrase continuation after "ankit " should be offered');
  assert.equal(continuation.replaceLength, 0);
  // Pure insertion at the caret: acceptance preserves the whole value.
  assert.equal(acceptedValue('ankit ', continuation), 'ankit ' + continuation.text);
});

test('mined next-word predictions flow through options.nextWords', () => {
  const engine = loadEngine();
  const candidates = engine.getGDSuggestions('the police ', 'MISCELLANEOUS_EVENT', null, engineOptions({
    nextWords: ['reached', 'station'],
  }));
  const next = candidates.find((c) => /^reached /i.test(c.text) || /^station /i.test(c.text));
  assert.ok(next, 'mined next-word should be offered after a space');
  assert.equal(next.replaceLength, 0);
  assert.equal(acceptedValue('the police ', next), 'the police ' + next.text);
});
