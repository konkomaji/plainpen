// Plainpen worker, owns the engine. Never touches the DOM or the network except for
// loading its own same-origin data files. Every message is validated; every failure is
// reported to the page as a typed message instead of killing the worker.
import { createEngine } from './engine.js';

const MAX_TEXT = 12e6;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = (m) => self.postMessage(m);
let eng = null, ready = null, latest = 0, brain = [];

async function fetchText(rel, required) {
  const url = new URL(rel, import.meta.url);
  let last;
  for (let i = 1; i <= (required ? 3 : 1); i++) {
    try {
      const r = await fetch(url, { cache: 'force-cache', credentials: 'omit' });
      if (!r.ok) throw new Error(`${rel}: HTTP ${r.status}`);
      return await r.text();
    } catch (e) { last = e; if (required) await sleep(400 * i); }
  }
  if (required) throw last;
  return null;
}

async function boot() {
  const main = await fetchText('../data/words.txt', true);
  const words = main.split('\n');
  if (words.length < 50000) throw new Error('Dictionary file looks truncated (' + words.length + ' words).');
  const extra = await fetchText('../data/extra.txt', false);   // optional refresh layer
  if (extra) for (const w of extra.split('\n')) if (/^[a-z]+$/.test(w)) words.push(w);
  eng = createEngine(words);
  if (brain.length) eng.setBrain(brain);
  post({ type: 'ready', words: eng.size, regionPairs: eng.regionPairs });
  // lazy packs: never block startup, never fatal
  for (const [file, kind] of [['../data/packs/places.txt', 'place'], ['../data/packs/names.txt', 'name']]) {
    fetchText(file, false).then((t) => { if (t && eng) { eng.addPack(t.split('\n'), kind); post({ type: 'pack', file, brain: eng.brainSize() }); } }).catch(() => {});
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0));

async function handle(m) {
  if (!m || typeof m !== 'object') return;
  switch (m.type) {
    case 'init':
      ready = ready || boot();
      await ready;
      break;
    case 'brain':
      if (!Array.isArray(m.entries)) return;
      brain = m.entries.filter((e) => e && typeof e.word === 'string' && typeof e.kind === 'string').slice(0, 40000);
      if (eng) eng.setBrain(brain);
      post({ type: 'brain-ok', size: brain.length });
      break;
    case 'check': {
      if (typeof m.text !== 'string' || !Number.isInteger(m.id)) throw new Error('bad check request');
      if (m.text.length > MAX_TEXT) { post({ type: 'too-large', id: m.id, limit: MAX_TEXT }); return; }
      latest = m.id;
      await ready;
      const opts = { mode: m.opts && m.opts.mode, region: m.opts && m.opts.region, style: !(m.opts && m.opts.style === false) };
      for (const part of eng.iterate(m.text, opts)) {
        if (latest !== m.id) return;                       // superseded by a newer request
        if (!part.done) {
          post({ type: 'slice', id: m.id, issues: part.issues, pos: part.pos, len: part.len });
          await tick();                                    // lets a newer message cancel us
        } else {
          post({ type: 'slice', id: m.id, issues: part.issues, pos: part.len, len: part.len });
          post({ type: 'done', id: m.id, stats: part.stats, meta: part.meta });
        }
      }
      break;
    }
    case 'suggest':
      await ready;
      post({ type: 'suggestions', id: m.id, list: eng.suggest(String(m.word || '').toLowerCase()) });
      break;
    case 'clear':
      if (eng) eng.clearCache();
      break;
  }
}

self.onmessage = (e) => {
  handle(e.data).catch((err) => post({ type: 'error', id: e.data && e.data.id, fatal: !eng, message: String((err && err.message) || err) }));
};
self.onerror = (e) => { post({ type: 'error', fatal: false, message: String(e && e.message || 'worker error') }); };
self.onunhandledrejection = (e) => { post({ type: 'error', fatal: false, message: String(e && e.reason && e.reason.message || e.reason || 'unhandled') }); e.preventDefault && e.preventDefault(); };
