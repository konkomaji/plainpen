// Penlight benchmark. Run: node tests/bench.mjs
// 1. Spelling: Skeleton-Rank vs naive edit-distance baseline (top-1/3/5 hit rate)
// 2. Grammar: precision / recall / F0.5 on gold sentences + clean-text false positives
// 3. Speed: cold and incremental check of a 100k-word document
import { readFileSync } from 'node:fs';
import { createEngine } from '../js/engine.js';

const words = readFileSync(new URL('../data/words.txt', import.meta.url), 'utf8').split('\n').filter(Boolean);
let t0 = performance.now();
const eng = createEngine(words);
console.log(`dictionary: ${eng.size} words, indexed in ${(performance.now() - t0).toFixed(0)} ms\n`);

/* ---------------------------------------------------------------- spelling */
const SPELL = `recieve receive|definately definitely|seperate separate|occured occurred|accomodate accommodate|untill until|wich which|teh the|adress address|becuase because|beleive believe|freind friend|goverment government|enviroment environment|necesary necessary|tommorow tomorrow|wierd weird|acheive achieve|grammer grammar|calender calendar|existance existence|fourty forty|gaurd guard|happend happened|independant independent|knowlege knowledge|libary library|mispell misspell|noticable noticeable|ocasion occasion|peice piece|posible possible|pronounciation pronunciation|refering referring|relevent relevant|sucessful successful|tounge tongue|truely truly|wether whether|writting writing|thier their|recomend recommend|embarass embarrass|concious conscious|diffrent different|intresting interesting|probly probably|beutiful beautiful|bussiness business|comming coming|desparate desperate|excersise exercise|foriegn foreign|harrass harass|immediatly immediately|jewelery jewellery|lenght length|medecine medicine|neccessary necessary|oppurtunity opportunity|persistant persistent|quiet quite|rythm rhythm|speach speech|tomorow tomorrow|vaccum vacuum|wellcome welcome|yeild yield|aquire acquire|buisness business|catagory category|dissapear disappear|equiptment equipment|fasinate fascinate|guidence guidance|humerous humorous|inteligence intelligence|knowlegde knowledge|lisence license|maintainance maintenance|nieghbor neighbor|occassion occasion|priviledge privilege|reccomend recommend|sieze seize|thoroughly thoroughly`.split('|').map((p) => p.split(' ')).filter(([a, b]) => a !== b);

function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
// Baseline: unweighted Levenshtein over same-length-ish words, ties by dictionary order.
function baseline(w) {
  const out = [];
  for (const c of words) {
    if (Math.abs(c.length - w.length) > 2) continue;
    const d = lev(w, c);
    if (d <= 2) out.push([d, c]);
  }
  return out.sort((x, y) => x[0] - y[0]).slice(0, 5).map((x) => x[1]);
}

const hits = { pl: [0, 0, 0], base: [0, 0, 0] };
const misses = [];
let tPl = 0;
for (const [bad, good] of SPELL) {
  t0 = performance.now();
  const pl = eng.suggest(bad).map((x) => x.w);
  tPl += performance.now() - t0;
  const bs = baseline(bad);
  [1, 3, 5].forEach((k, i) => {
    if (pl.slice(0, k).includes(good)) hits.pl[i]++;
    if (bs.slice(0, k).includes(good)) hits.base[i]++;
  });
  if (!pl.slice(0, 1).includes(good)) misses.push(`${bad} -> want ${good}, got ${pl.slice(0, 3).join('/') || '-'}`);
}
const pct = (n) => ((100 * n) / SPELL.length).toFixed(1).padStart(5) + '%';
console.log(`SPELLING  (${SPELL.length} gold misspellings)`);
console.log('                 top-1   top-3   top-5');
console.log(`  baseline Lev  ${hits.base.map(pct).join('  ')}`);
console.log(`  Skeleton-Rank ${hits.pl.map(pct).join('  ')}   avg ${(tPl / SPELL.length).toFixed(1)} ms/word`);
if (misses.length) console.log('  top-1 misses:\n    ' + misses.slice(0, 12).join('\n    '));

/* ----------------------------------------------------------------- grammar */
const POS = [
  ['He dont like it.', 'CONTRACTION'], ['I could of gone.', 'MODAL_OF'], ['Their is a problem.', 'THEIR_IS'],
  ['It is better then nothing.', 'THAN_THEN'], ['She have two cats.', 'SVA_3SG_HAVE'], ['He don\'t know.', 'SVA_3SG_DONT'],
  ['I is happy.', 'SVA_I'], ['They was late.', 'SVA_PL'], ['These is good.', 'SVA_THESE'], ['This is an university.', 'A_AN'],
  ['She bought a apple.', 'A_AN'], ['We went to the the park.', 'REPEAT'], ['i like tea.', 'PRONOUN_I'],
  ['It was good. the end came.', 'CAPITAL'], ['I don\'t have no money.', 'DOUBLE_NEG'], ['Its a nice day.', 'ITS_ITS'],
  ['That is to much.', 'TOO_ADJ'], ['Don\'t loose the key, you will loose it.', 'LOSE_LOOSE'], ['Hello ,world.', 'SPACE_BEFORE_PUNCT'],
  ['Hello,world.', 'SPACE_AFTER_COMMA'], ['Too  many spaces.', 'DOUBLE_SPACE'], ['Wow!!', 'REPEAT_PUNCT'],
  ['I have alot of work.', 'ALOT'], ['Your welcome.', 'YOUR_WELCOME'], ['It happened in order to win.', 'WORDY'],
  ['He go to the store yesterday.', null], // known gap: tense — recall target for roadmap
];
const NEG = [
  'The quick brown fox jumps over the lazy dog.', 'I had had enough of that.', 'She said that that was fine.',
  'Dr. Smith arrived at 5 p.m. and left at 6.', 'We met e.g. in London, i.e. the capital.', 'An hour later, an honest man left.',
  'A university student found a unique, useful item.', 'It is 3.14 and 1,000 items, version 2.0.', 'Visit https://example.com/a,b now.',
  'Email me at test@example.com, please.', "They're going to their house over there.", 'The cat sat on the mat. It was happy.',
  "She doesn't know what he's doing, but it's fine.", "Its tone is bright; the dog wagged its tail.", 'John and Priya visited Mumbai in March.',
  'He said, "Run!" and then ran.', 'Wait... what happened?', 'The results were better than expected.',
  'This is the end. Thank you for reading it all.', 'You are right, and we are ready.',
];
const analyse = (s) => eng.check(s, { style: true }).issues;
let tp = 0, fp = 0, fn = 0;
const fpList = [], fnList = [];
for (const [s, rule] of POS) {
  const got = analyse(s).map((i) => i.rule);
  if (rule === null) { continue; }
  if (got.includes(rule)) tp++; else { fn++; fnList.push(`${rule}: "${s}" got [${got}]`); }
  for (const g of got) if (g !== rule && !['WEAK_WORD', 'PASSIVE', 'SPELLING', 'EXCLAIM', 'INFORMAL', 'BUZZ', 'WORDY', 'LONG_SENT', 'CONDESCEND'].includes(g) && !(rule === 'REPEAT' && g === 'REPEAT')) { fp++; fpList.push(`${g} in "${s}"`); }
}
let cleanFP = 0;
for (const s of NEG) for (const i of analyse(s)) if (i.type !== 'style') { cleanFP++; fpList.push(`${i.rule} "${i.text}" in clean "${s}"`); }
fp += cleanFP;
const P = tp / (tp + fp || 1), R = tp / (tp + fn || 1), F05 = (1.25 * P * R) / (0.25 * P + R || 1);
console.log(`\nGRAMMAR   (${POS.length - 1} positive, ${NEG.length} clean sentences)`);
console.log(`  precision ${(P * 100).toFixed(1)}%   recall ${(R * 100).toFixed(1)}%   F0.5 ${(F05 * 100).toFixed(1)}%   clean-text false positives: ${cleanFP}`);
if (fnList.length) console.log('  missed:\n    ' + fnList.join('\n    '));
if (fpList.length) console.log('  false positives:\n    ' + fpList.join('\n    '));

/* ------------------------------------------------------------------- speed */
const para = 'The committee have reviewed the proposal and it was decided that the budget, which is limited, should be spent wisely. Teh team dont agree on a alot of points, but their is hope. ';
const doc = Array.from({ length: 1000 }, (_, i) => `Item ${i}. ` + para.repeat(5)).join('\n');
const wc = doc.split(/\s+/).length;
t0 = performance.now();
const r1 = eng.check(doc);
const cold = performance.now() - t0;
const edited = doc.replace('proposal', 'proposals');
t0 = performance.now();
eng.check(edited);
const inc = performance.now() - t0;
t0 = performance.now();
eng.check(edited);
const warm = performance.now() - t0;
console.log(`\nSPEED     ${wc.toLocaleString()} words, ${r1.issues.length.toLocaleString()} issues`);
console.log(`  cold ${cold.toFixed(0)} ms (${Math.round(wc / (cold / 1000)).toLocaleString()} words/s) | one-paragraph edit ${inc.toFixed(0)} ms | unchanged re-check ${warm.toFixed(0)} ms`);

const fail = [];
if (hits.pl[0] / SPELL.length < 0.7) fail.push('spelling top-1 < 70%');
if (hits.pl[2] / SPELL.length < 0.9) fail.push('spelling top-5 < 90%');
if (P < 0.9) fail.push('grammar precision < 90%');
if (cleanFP > 0) fail.push('false positives on clean text');
if (fail.length) { console.log('\nFAIL: ' + fail.join('; ')); process.exit(1); }
console.log('\nPASS');
