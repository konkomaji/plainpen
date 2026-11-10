// Plainpen profile, the "self-learning" half. Pure functions, no DOM, no network.
//
// Trust-Gate: every rule has a prior precision p0 (shipped with the rule). Each time you
// accept a fix (a) or dismiss it (r) the rule's trust, *per writing mode*, becomes
//     trust = (a + p0*K) / (a + r + K)          K = 4 pseudo-observations
// A rule below SHOW_BELOW stops interrupting you. No model, no server: counting.
//
// The Brain: words you teach (name / place / brand / acronym / term / slang / prefer)
// with an optional explanation. They are handed to the engine, which then accepts the
// word and enforces its exact casing.

export const K = 4;
export const SHOW_BELOW = 0.35;
export const AUTO_LEARN_WORD_AT = 2;
export const KINDS = ['name', 'place', 'brand', 'acronym', 'term', 'slang', 'prefer'];
export const MODE_IDS = ['professional', 'technical', 'ste', 'friendly', 'casual'];
export const DIALECT_IDS = ['bn'];
export const REGION_IDS = ['en-US', 'en-GB', 'en-IN'];

const LIM = { words: 20000, wordLen: 64, noteLen: 300, rules: 200, prefs: 5000 };
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const WORD_OK = /^[\p{L}][\p{L}\p{N}'’ .-]{0,63}$/u;

export const emptyProfile = () => ({
  v: 2,
  dict: [],
  taught: {},
  muted: [],
  stats: {},
  fixPrefs: {},
  ignored: {},
  settings: { style: true, theme: 'light', mode: 'professional', region: 'en-US', dialects: [] },
});

/* ---------------------------------------------------------------- sanitising */
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v) => (Number.isFinite(v) ? Math.max(0, Math.min(1e6, Math.floor(v))) : 0);

/** Accepts anything (parsed JSON from disk/import) and returns a safe, bounded profile. */
export function sanitizeProfile(raw) {
  const p = emptyProfile();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return p;
  if (Array.isArray(raw.dict)) {
    const seen = new Set();
    for (const w of raw.dict) {
      if (typeof w !== 'string') continue;
      const x = w.toLowerCase().slice(0, LIM.wordLen);
      if (WORD_OK.test(x) && !seen.has(x) && seen.size < LIM.words) { seen.add(x); p.dict.push(x); }
    }
  }
  if (raw.taught && typeof raw.taught === 'object') {
    let n = 0;
    for (const [k, e] of Object.entries(raw.taught)) {
      if (BAD_KEYS.has(k) || n >= LIM.words || !e || typeof e !== 'object') continue;
      const key = k.toLowerCase().slice(0, LIM.wordLen);
      if (!WORD_OK.test(key) || !KINDS.includes(e.kind)) continue;
      p.taught[key] = { kind: e.kind, form: str(e.form, LIM.wordLen) || k.slice(0, LIM.wordLen), note: str(e.note, LIM.noteLen), t: num(e.t) };
      n++;
    }
  }
  if (Array.isArray(raw.muted)) p.muted = raw.muted.filter((r) => typeof r === 'string' && /^[A-Z_]{2,40}$/.test(r)).slice(0, LIM.rules);
  if (raw.stats && typeof raw.stats === 'object') {
    for (const [k, s] of Object.entries(raw.stats).slice(0, LIM.rules * 4)) {
      if (BAD_KEYS.has(k) || !/^[a-z]+:[A-Z_]{2,40}$/.test(k) || !s || typeof s !== 'object') continue;
      p.stats[k] = { a: num(s.a), r: num(s.r) };
    }
  }
  if (raw.fixPrefs && typeof raw.fixPrefs === 'object') {
    for (const [k, m] of Object.entries(raw.fixPrefs).slice(0, LIM.prefs)) {
      if (BAD_KEYS.has(k) || !m || typeof m !== 'object' || k.length > LIM.wordLen) continue;
      const out = {};
      for (const [c, n] of Object.entries(m).slice(0, 10)) if (!BAD_KEYS.has(c) && c.length <= LIM.wordLen) out[c] = num(n);
      p.fixPrefs[k] = out;
    }
  }
  if (raw.ignored && typeof raw.ignored === 'object') {
    for (const [k, n] of Object.entries(raw.ignored).slice(0, LIM.prefs)) if (!BAD_KEYS.has(k) && k.length <= LIM.wordLen) p.ignored[k] = num(n);
  }
  const s = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
  p.settings.style = s.style !== false;
  p.settings.theme = ['light', 'dark'].includes(s.theme) ? s.theme : 'light';
  p.settings.dialects = Array.isArray(s.dialects) ? s.dialects.filter((d) => DIALECT_IDS.includes(d)) : [];
  p.settings.mode = MODE_IDS.includes(s.mode) ? s.mode : 'professional';
  p.settings.region = REGION_IDS.includes(s.region) ? s.region : 'en-US';
  return p;
}

/* -------------------------------------------------------------- Trust-Gate */
const statKey = (profile, rule) => `${profile.settings.mode}:${rule}`;

export function trust(profile, rule, p0) {
  const s = profile.stats[statKey(profile, rule)] || { a: 0, r: 0 };
  return (s.a + p0 * K) / (s.a + s.r + K);
}

const caseLike = (orig, r) => {
  if (!r) return r;
  if (orig.length > 1 && orig === orig.toUpperCase()) return r.toUpperCase();
  if (orig[0] !== orig[0].toLowerCase()) return r[0].toUpperCase() + r.slice(1);
  return r;
};

export function applyProfile(raw, profile, session = new Set()) {
  const dict = new Set(profile.dict);
  const muted = new Set(profile.muted);
  const out = [];
  for (const i of raw) {
    const low = i.text.toLowerCase();
    if (session.has(i.rule + '|' + low)) continue;
    if (muted.has(i.rule)) continue;
    if (i.rule === 'SPELLING') {
      if (dict.has(low) || Object.hasOwn(profile.taught, low)) continue;
      const prefs = Object.hasOwn(profile.fixPrefs, low) ? profile.fixPrefs[low] : {};
      const ranked = i.cands
        .map((c) => ({ w: c.w, s: c.score + (prefs[c.w] || 0) * 8 + (dict.has(c.w) ? 2 : 0) }))
        .sort((x, y) => y.s - x.s)
        .map((c) => caseLike(i.text, c.w));
      out.push({ ...i, fixes: ranked.slice(0, 5), trust: 1 });
      continue;
    }
    const t = trust(profile, i.rule, i.p);
    if (t < SHOW_BELOW) continue;
    out.push({ ...i, trust: t });
  }
  return out;
}

const PRI = { spelling: 0, grammar: 1, punct: 2, style: 3 };
/** Greedy non-overlapping selection; spelling > grammar > punct > style. */
export function resolveOverlaps(issues) {
  const sorted = [...issues].sort((a, b) => a.start - b.start || PRI[a.type] - PRI[b.type] || b.end - a.end);
  const out = [];
  let lastEnd = -1;
  for (const i of sorted) {
    if (i.start >= lastEnd) { out.push(i); lastEnd = i.end; }
    else {
      const prev = out[out.length - 1];
      if (PRI[i.type] < PRI[prev.type] && i.end <= prev.end) { out[out.length - 1] = i; lastEnd = i.end; }
    }
  }
  return out;
}

/* ----------------------------------------------------------------- learning */
const bump = (profile, rule, key) => {
  const k = statKey(profile, rule);
  const s = Object.hasOwn(profile.stats, k) ? profile.stats[k] : (profile.stats[k] = { a: 0, r: 0 });
  s[key]++;
};

export function learnAccept(profile, issue, chosen) {
  if (issue.rule !== 'SPELLING') return bump(profile, issue.rule, 'a');
  const w = issue.text.toLowerCase();
  if (BAD_KEYS.has(w)) return;
  const m = Object.hasOwn(profile.fixPrefs, w) ? profile.fixPrefs[w] : (profile.fixPrefs[w] = {});
  const c = chosen.toLowerCase();
  if (!BAD_KEYS.has(c)) m[c] = (m[c] || 0) + 1;
  const keys = Object.keys(profile.fixPrefs);
  if (keys.length > LIM.prefs) delete profile.fixPrefs[keys[0]];
}

/** returns the word auto-learned, if any */
export function learnIgnore(profile, issue) {
  if (issue.rule === 'SPELLING') {
    const w = issue.text.toLowerCase();
    if (BAD_KEYS.has(w)) return null;
    profile.ignored[w] = (profile.ignored[w] || 0) + 1;
    if (profile.ignored[w] >= AUTO_LEARN_WORD_AT) { teach(profile, issue.text, 'term', 'auto-learned (ignored twice)'); return w; }
    return null;
  }
  bump(profile, issue.rule, 'r');
  return null;
}

/** Teach the brain a word: kind + optional explanation + exact casing. Returns false if invalid. */
export function teach(profile, word, kind, note = '', form) {
  word = String(word || '').trim();
  const key = word.toLowerCase().slice(0, LIM.wordLen);
  if (!WORD_OK.test(key) || BAD_KEYS.has(key) || !KINDS.includes(kind)) return false;
  if (Object.keys(profile.taught).length >= LIM.words && !Object.hasOwn(profile.taught, key)) return false;
  profile.taught[key] = { kind, form: str(form, LIM.wordLen) || word.slice(0, LIM.wordLen), note: str(note, LIM.noteLen), t: Date.now() };
  delete profile.ignored[key];
  return true;
}
export const forget = (profile, word) => { delete profile.taught[word.toLowerCase()]; profile.dict = profile.dict.filter((x) => x !== word.toLowerCase()); };
export const addWord = (profile, w) => teach(profile, w, 'term', '');
export const muteRule = (profile, r) => { if (!profile.muted.includes(r)) profile.muted.push(r); };
export const unmuteRule = (profile, r) => {
  profile.muted = profile.muted.filter((x) => x !== r);
  for (const k of Object.keys(profile.stats)) if (k.endsWith(':' + r)) delete profile.stats[k];
};

/** Everything the engine's brain should know. */
export function brainEntries(profile) {
  const out = profile.dict.map((w) => ({ word: w, kind: 'term', form: w, note: '' }));
  for (const [k, e] of Object.entries(profile.taught)) out.push({ word: k, kind: e.kind, form: e.form, note: e.note });
  return out;
}

/* ---------------------------------------------------- shareable lexicon packs */
export function exportLexicon(profile) {
  return { format: 'plainpen-lexicon', v: 1, entries: Object.entries(profile.taught).map(([w, e]) => ({ word: w, kind: e.kind, form: e.form, note: e.note })) };
}
export function importLexicon(profile, raw) {
  if (!raw || raw.format !== 'plainpen-lexicon' || !Array.isArray(raw.entries)) throw new Error('Not a Plainpen lexicon file.');
  let n = 0;
  for (const e of raw.entries.slice(0, LIM.words)) if (e && teach(profile, e.word, e.kind, e.note, e.form)) n++;
  return n;
}
