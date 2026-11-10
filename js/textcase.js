// Plainpen case tools, pure string functions. Brain-aware: names, places, brands and
// acronyms keep their correct casing when you convert to Sentence or Title case.
// `keep` is an optional Map(lowercase -> exact form).

const WORD = /\p{L}+(?:['’]\p{L}+)*/gu;
const SMALL = new Set('a an and as at but by for from if in nor of on or per so the to up via vs yet with into onto over'.split(' '));
const isAcronym = (w) => w.length >= 2 && w.length <= 6 && w === w.toUpperCase() && /^\p{Lu}+$/u.test(w);
const hasInnerCaps = (w) => /\p{Ll}\p{Lu}/u.test(w);             // iPhone, eBay, McDonald
const cap1 = (w) => w.charAt(0).toUpperCase() + w.slice(1);

function restore(orig, low, keep) {
  if (isAcronym(orig) && (orig.length <= 4 || !/[AEIOUY]/.test(orig) || (keep && keep.has(low)))) return orig;
  if (hasInnerCaps(orig)) return orig;
  if (keep && keep.has(low)) return keep.get(low);
  if (low === 'i' || /^i['’](m|ve|ll|d)$/.test(low)) return 'I' + low.slice(1);
  return null;
}

export const upper = (t) => t.toUpperCase();
export const lower = (t) => t.toLowerCase();

export function sentence(t, keep) {
  let s = t.replace(WORD, (w) => restore(w, w.toLowerCase().replace(/’/g, "'"), keep) ?? w.toLowerCase());
  s = s.replace(/(^|[.!?…]["'”’)\]]*\s+|\n[ \t]*)(\p{Ll})/gu, (m, pre, ch, off) => {
    const before = s.slice(Math.max(0, off - 8), off + pre.length);
    if (/(?:\b\p{L}|\b(?:mr|mrs|ms|dr|prof|vs|etc|inc|ltd|st)|e\.g|i\.e)\.\s*$/iu.test(before) && !/\n/.test(pre)) return m;
    return pre + ch.toUpperCase();
  });
  return s;
}

export function title(t, keep) {
  return t.split('\n').map((line) => {
    const words = [...line.matchAll(WORD)];
    const last = words.length - 1;
    let idx = -1, afterColon = false, prevEnd = 0;
    return line.replace(WORD, (w, off) => {
      idx++;
      const gap = line.slice(prevEnd, off);
      prevEnd = off + w.length;
      afterColon = /[:\u2014\u2013]\s*$/.test(gap);
      const low = w.toLowerCase().replace(/’/g, "'");
      const kept = restore(w, low, keep);
      if (kept) return kept;
      if (idx !== 0 && idx !== last && !afterColon && SMALL.has(low)) return low;
      return cap1(low);
    });
  }).join('\n');
}

export function capitalizeWords(t, keep) {
  return t.replace(WORD, (w) => restore(w, w.toLowerCase(), keep) ?? cap1(w.toLowerCase()));
}

export const toggle = (t) => [...t].map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join('');

export function alternating(t) {
  let n = 0;
  return [...t].map((c) => (/\p{L}/u.test(c) ? (n++ % 2 ? c.toUpperCase() : c.toLowerCase()) : c)).join('');
}

const SC = { a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ', j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ', s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ' };
export const smallCaps = (t) => [...t.toLowerCase()].map((c) => SC[c] || c).join('');

// developer styles
const parts = (t) => t.replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2').split(/[^\p{L}\p{N}]+/u).filter(Boolean).map((p) => p.toLowerCase());
export const camel = (t) => parts(t).map((p, i) => (i ? cap1(p) : p)).join('');
export const pascal = (t) => parts(t).map(cap1).join('');
export const snake = (t) => parts(t).join('_');
export const kebab = (t) => parts(t).join('-');
export const constant = (t) => parts(t).join('_').toUpperCase();

/** Whitespace hygiene: trims line ends, collapses runs of spaces and 3+ blank lines. */
export function tidy(t) {
  return t.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').replace(/(\S)[ \t]{2,}(?=\S)/g, '$1 ').replace(/\n{3,}/g, '\n\n').trim();
}

export const CASE_TOOLS = [
  { id: 'upper', label: 'UPPERCASE', fn: upper },
  { id: 'lower', label: 'lowercase', fn: lower },
  { id: 'sentence', label: 'Sentence case', fn: sentence, brain: true },
  { id: 'title', label: 'Title Case', fn: title, brain: true },
  { id: 'words', label: 'Capitalize Each Word', fn: capitalizeWords, brain: true },
  { id: 'toggle', label: 'tOGGLE cASE', fn: toggle },
  { id: 'alt', label: 'aLtErNaTiNg', fn: alternating },
  { id: 'smallcaps', label: 'ꜱᴍᴀʟʟ ᴄᴀᴘꜱ', fn: smallCaps },
  { id: 'camel', label: 'camelCase', fn: camel, group: 'dev' },
  { id: 'pascal', label: 'PascalCase', fn: pascal, group: 'dev' },
  { id: 'snake', label: 'snake_case', fn: snake, group: 'dev' },
  { id: 'kebab', label: 'kebab-case', fn: kebab, group: 'dev' },
  { id: 'constant', label: 'CONSTANT_CASE', fn: constant, group: 'dev' },
  { id: 'tidy', label: 'Tidy whitespace', fn: tidy, group: 'clean' },
];
