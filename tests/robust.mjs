// Robustness + safety suite. Run: node tests/robust.mjs
// Invariants: the engine never throws, every issue points at real text, results are
// deterministic, huge/pathological inputs finish quickly, imports cannot pollute.
import { readFileSync } from 'node:fs';
import { createEngine } from '../js/engine.js';
import { sanitizeProfile, teach, brainEntries, importLexicon } from '../js/profile.js';
import * as TC from '../js/textcase.js';

const words = readFileSync(new URL('../data/words.txt', import.meta.url), 'utf8').split('\n').filter(Boolean);
const eng = createEngine(words);
let fails = 0, checks = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log('  FAIL: ' + msg); } };
const time = (f) => { const t = performance.now(); const r = f(); return [r, performance.now() - t]; };

function invariants(text, res, label) {
  for (const i of res.issues) {
    const good = Number.isInteger(i.start) && Number.isInteger(i.end) && i.start >= 0 && i.end > i.start && i.end <= text.length && text.slice(i.start, i.end) === i.text && Array.isArray(i.fixes) && i.fixes.every((f) => typeof f === 'string');
    if (!good) { ok(false, `${label}: bad issue ${JSON.stringify(i).slice(0, 120)}`); return; }
  }
  ok(true, label);
}

/* 1. fuzz */
console.log('fuzz');
const ALPHA = ['a', 'b', 'The', ' ', ' ', '  ', '\n', '\r\n', '.', ',', '!', '?', '...', '"', "'", '’', '(', ')', '`', 'http://x.y/z', '@u', '#t', '😂', '👩‍💻', 'שלום', 'مرحبا', 'é', 'é', '\u0000', '​', 'I', 'i', 'teh', 'dont', 'a apple', 'colour', 'London', 'london', '1,000.5', '--flag', 'snake_case', 'file.js', '```', 'x'.repeat(50), '.'.repeat(5)];
let seed = 12345;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
for (let n = 0; n < 400; n++) {
  let t = '';
  const len = 1 + Math.floor(rnd() * 60);
  for (let i = 0; i < len; i++) t += ALPHA[Math.floor(rnd() * ALPHA.length)];
  for (const mode of ['professional', 'technical', 'friendly', 'casual']) {
    for (const region of ['en-US', 'en-GB', 'en-IN']) {
      try { invariants(t, eng.check(t, { mode, region }), 'fuzz'); }
      catch (e) { ok(false, `fuzz threw: ${e.message} on ${JSON.stringify(t).slice(0, 80)}`); }
    }
  }
}

/* 2. hostile inputs */
console.log('hostile / huge inputs');
const cases = {
  'empty': '', 'only whitespace': ' \n\t \n', 'null chars': '\0'.repeat(10000), 'non-string number': 12345, 'undefined': undefined,
  '3 MB, no spaces': 'a'.repeat(3e6), '2 MB of dots': '.'.repeat(2e6), '1 MB of "a. "': 'a. '.repeat(333333),
  '200k newlines': '\n'.repeat(2e5), 'quote storm': '"\'’‘“”'.repeat(100000), 'email-like backtracking': 'a'.repeat(3900) + '@' + 'b'.repeat(3000),
  'emoji wall': '😂'.repeat(200000), 'long word + typos': 'teh '.repeat(100000), 'markdown fences': '```\nteh dont\n```\n' + 'teh\n'.repeat(1000),
};
for (const [name, v] of Object.entries(cases)) {
  try {
    const [res, ms] = time(() => eng.check(v));
    const t = typeof v === 'string' ? v : String(v ?? '');
    invariants(t, res, name);
    ok(ms < 20000, `${name} took ${ms.toFixed(0)} ms`);
    console.log(`  ${name.padEnd(28)} ${ms.toFixed(0).padStart(6)} ms  ${res.issues.length} issues${res.meta && res.meta.truncated ? ' (truncated)' : ''}`);
  } catch (e) { ok(false, `${name} threw ${e.message}`); }
}

/* 3. determinism + cache transparency */
console.log('determinism');
const sample = 'He dont like it. I could of gone to london, but teh train was late!!  Colour is nice.\nSecond line with a apple.';
const a = JSON.stringify(eng.check(sample).issues);
eng.clearCache();
const b = JSON.stringify(eng.check(sample).issues);
ok(a === b, 'cold == warm results');

/* 4. cancellation / slicing */
console.log('slicing');
const big = ('This is a sentence with teh typo. ').repeat(20000);
let slices = 0, total = 0;
for (const part of eng.iterate(big, {}, 50000)) { slices++; total += part.issues.length; if (part.done) ok(typeof part.stats.words === 'number', 'final slice has stats'); }
ok(slices > 5, `large text arrives in ${slices} slices`);
ok(total === eng.check(big).issues.length, 'sliced == unsliced issue count');

/* 5. fixes are safe to apply */
console.log('fix application');
const fixable = 'He dont know. They was late. I could of went. Its a nice day, teh end. We went to the the park.';
const r = eng.check(fixable);
let out = fixable;
for (const i of [...r.issues].sort((x, y) => y.start - x.start)) if (i.fixes[0] !== undefined && i.type !== 'style') out = out.slice(0, i.start) + i.fixes[0] + out.slice(i.end);
const after = eng.check(out).issues.filter((i) => i.type !== 'style');
ok(after.length <= r.issues.filter((i) => i.type !== 'style').length, 'applying fixes does not add problems');
console.log('  before:', fixable, '\n  after: ', out);

/* 6. profile import cannot pollute prototypes */
console.log('import safety');
const evil = JSON.parse('{"dict":["__proto__","ok"],"taught":{"__proto__":{"kind":"name","form":"x"},"constructor":{"kind":"name"},"priya":{"kind":"name","form":"Priya","note":"colleague"}},"fixPrefs":{"__proto__":{"polluted":9}},"stats":{"__proto__":{"a":1},"professional:SPELLING":{"a":"x","r":-5}},"settings":{"mode":"hax","region":"zz"}}');
const p = sanitizeProfile(evil);
ok(({}).polluted === undefined && ({}).a === undefined, 'Object.prototype untouched');
ok(!p.dict.includes('__proto__') && p.dict.includes('ok'), 'bad dict word dropped');
ok(p.taught.priya && p.taught.priya.form === 'Priya' && !Object.hasOwn(p.taught, 'constructor'), 'only valid taught entries kept');
ok(p.settings.mode === 'professional' && p.settings.region === 'en-US', 'bad settings fall back');
try { importLexicon(p, { format: 'nope' }); ok(false, 'bad lexicon accepted'); } catch { ok(true, 'bad lexicon rejected'); }
ok(sanitizeProfile('garbage').v === 2 && sanitizeProfile(null).dict.length === 0, 'garbage becomes empty profile');
const huge = { dict: Array.from({ length: 50000 }, (_, i) => 'w' + 'a'.repeat(i % 10) + String.fromCharCode(97 + (i % 26)) + 'x'.repeat(i % 7)) };
ok(sanitizeProfile(huge).dict.length <= 20000, 'dictionary size capped');

/* 7. the taught brain */
console.log('brain');
const prof = sanitizeProfile({});
teach(prof, 'Priya', 'name', 'my colleague'); teach(prof, 'Zoho', 'brand', 'CRM vendor'); teach(prof, 'emailing', 'prefer', 'house style', 'e-mailing');
eng.setBrain(brainEntries(prof));
const t1 = eng.check('I met priya at zoho today. Zoho is great.').issues.map((i) => `${i.rule}:${i.text}->${i.fixes[0]}`);
ok(t1.includes('TAUGHT_CAP:priya->Priya') && t1.includes('TAUGHT_CAP:zoho->Zoho'), 'taught names enforce casing: ' + t1.join(' '));
ok(!eng.check('Priya joined Zoho.').issues.some((i) => i.rule === 'SPELLING'), 'taught words never flagged as typos');
ok(eng.check('We are emailing you.').issues.some((i) => i.rule === 'TAUGHT_PREFER'), 'prefer rule fires');
eng.setBrain([]);
ok(eng.check('I met priya').issues.some((i) => i.rule === 'SPELLING' || i.rule === 'TAUGHT_CAP'), 'forgetting works');
ok(eng.check('I visited london and delhi in april.').issues.filter((i) => i.rule === 'TAUGHT_CAP').length === 3, 'built-in encyclopedia: places and months');

/* 8. case tools */
console.log('case tools');
const keep = new Map([['priya', 'Priya'], ['nasa', 'NASA']]);
ok(TC.sentence('HELLO there. i met priya at NASA! it was fun. dr. smith left', keep) === 'Hello there. I met Priya at NASA! It was fun. Dr. smith left', 'sentence: ' + TC.sentence('HELLO there. i met priya at NASA! it was fun. dr. smith left', keep));
ok(TC.title('the quick brown fox jumps over the lazy dog', keep) === 'The Quick Brown Fox Jumps over the Lazy Dog', 'title: ' + TC.title('the quick brown fox jumps over the lazy dog'));
ok(TC.upper('abc') === 'ABC' && TC.lower('ABC') === 'abc' && TC.toggle('aBc') === 'AbC', 'upper/lower/toggle');
ok(TC.snake('helloWorld Foo-bar') === 'hello_world_foo_bar' && TC.camel('hello world') === 'helloWorld', 'dev cases');
ok(TC.smallCaps('hello') === 'ʜᴇʟʟᴏ', 'small caps');
ok(TC.tidy('a   b  \n\n\n\nc') === 'a b\n\nc', 'tidy');
for (const t of CASE_SAMPLES()) for (const tool of TC.CASE_TOOLS) { try { tool.fn(t, keep); } catch (e) { ok(false, `${tool.id} threw on ${JSON.stringify(t).slice(0, 30)}`); } }
function CASE_SAMPLES() { return ['', ' ', '😂', 'a', '\0\0', 'x'.repeat(100000), 'éñ', 'שלום עולם', '...', "i'm"]; }

console.log(`\n${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
