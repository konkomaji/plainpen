// Plainpen UI. DOM APIs only (no innerHTML, no eval), so the page can enforce
// Trusted Types and a strict CSP. Your text only ever goes to the local worker.
import { emptyProfile, applyProfile, resolveOverlaps, learnAccept, learnIgnore, teach, forget, muteRule, unmuteRule, brainEntries, exportLexicon, importLexicon, trust, MODE_IDS } from './profile.js';
import * as store from './store.js';
import { CASE_TOOLS } from './textcase.js';
import { PROPER, properForm } from './lexicon.js';
import { GA_ID } from './config.js';

const $ = (s, r = document) => r.querySelector(s);
const NS = 'http://www.w3.org/2000/svg';
const MAX_CHARS = 12e6, MAX_FILE = 6e6;

/* ------------------------------------------------------------- DOM helper */
function h(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return e;
}
function svg(d, extra = {}) {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
  s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
  for (const [k, v] of Object.entries(extra)) s.setAttribute(k, v);
  const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); s.append(p);
  return s;
}
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const fmt = (n) => n.toLocaleString('en-US');

/* ----------------------------------------------------- trusted types policy */
const tt = window.trustedTypes
  ? trustedTypes.createPolicy('plainpen', { createScriptURL: (u) => { const x = new URL(u, location.href); if (x.origin !== location.origin) throw new TypeError('Blocked cross-origin script'); return x.href; } })
  : { createScriptURL: (u) => u };

/* -------------------------------------------------------------------- state */
const S = {
  text: '', raw: [], issues: [], filter: 'all', active: -1, profile: emptyProfile(), session: new Set(), reqId: 0, acc: [], worker: null,
  ready: false, restarts: 0, wd: 0, stats: null, shown: 120, checking: false, lastScore: 100, storeStatus: null, hover: -1,
};
const el = {
  editor: $('#editor'), mirror: $('#mirror'), notes: $('#notes'), tabs: $('#tabs'), modes: $('#modes'), region: $('#region'), style: $('#style-on'), chips: $('#chips'),
  engine: $('#st-engine'), progress: $('#progress'), bar: $('#progress-bar'), banner: $('#banner'), toasts: $('#toasts'), sheet: $('#sheet'), penny: $('#penny'),
};
const MODE_META = {
  professional: { label: 'Professional', icon: 'M4 8h16v11H4z M9 8V6h6v2 M4 13h16' },
  technical: { label: 'Technical', icon: 'M9 8l-5 4l5 4 M15 8l5 4l-5 4 M13 6l-2 12' },
  ste: { label: 'Simplified', icon: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z' },
  friendly: { label: 'Friendly', icon: 'M12 3a9 9 0 100 18a9 9 0 000-18z M8 14c1 1.6 2.300 2 4 2s3-.4 4-2 M9 10h.01 M15 10h.01' },
  casual: { label: 'Casual', icon: 'M4 5h16v11H9l-5 4z' },
};
const TYPES = [['all', 'All'], ['spelling', 'Spelling'], ['grammar', 'Grammar'], ['punct', 'Punctuation'], ['style', 'Style']];
const GLYPH = { spelling: 'sp', grammar: 'gr', punct: '¶', style: 'st' };
const SAMPLES = {
  professional: 'Hi team,\n\nI wanted to touch base regarding the proposal. Their is a few things we should of discussed, and the deadline is approaching fast!! Please let me know if you have any questions.',
  technical: 'To install the package, run `npm install plainpen`. The config file can be easily edited, and the server will be restarted by the script. Their are two options you should know about.',
  ste: 'The technician should remove the cover; the pump has been leaking and it could cause damage. After the cover is removed, check the valve and replace it.',
  friendly: 'hey! i dont think i can make it tonight, sorry. Could we meet tomorow instead? Its been a while and i really want to catch up',
  casual: 'omg that was sooo good lol, gonna watch it again tmrw. u coming? yaar mast hai, chalo chai peete hain',
};

/* ---------------------------------------------------------------- toasts */
function toast(msg, action) {
  const t = h('div', { class: 'toast' }, h('span', { text: msg }));
  if (action) t.append(h('button', { type: 'button', text: action.label, onclick: () => { action.run(); t.remove(); } }));
  el.toasts.append(t);
  setTimeout(() => t.remove(), action ? 8000 : 4000);
}
function banner(msg, info) { el.banner.textContent = msg; el.banner.className = 'banner' + (info ? ' info' : ''); el.banner.hidden = !msg; }

/* ---------------------------------------------------------------- worker */
function bootWorker() {
  try { S.worker = new Worker(tt.createScriptURL('js/worker.js'), { type: 'module' }); }
  catch (e) { setEngine('Your browser is too old for Plainpen (needs module web workers).', 'bad'); return; }
  S.ready = false;
  S.worker.onmessage = (e) => onWorker(e.data);
  S.worker.onerror = () => restartWorker('The checker hit an error and was restarted.');
  S.worker.postMessage({ type: 'init' });
  sendBrain();
}
function restartWorker(reason) {
  clearTimeout(S.wd);
  try { S.worker && S.worker.terminate(); } catch {}
  if (++S.restarts > 3) { setEngine('Checker unavailable. Your text is safe. Reload the page to retry.', 'bad'); banner('The checker stopped working. Your text is safe in the box. Reload the page to try again.'); return; }
  banner(reason, true);
  bootWorker();
  scheduleCheck(0);
}
const sendBrain = () => S.worker && S.worker.postMessage({ type: 'brain', entries: brainEntries(S.profile) });
function setEngine(msg, cls) { el.engine.textContent = msg; el.engine.className = 'engine ' + (cls || ''); }
function armWatchdog() { clearTimeout(S.wd); S.wd = setTimeout(() => restartWorker('The checker stopped responding and was restarted.'), 20000 + S.text.length / 100); }

function onWorker(m) {
  if (!m || typeof m !== 'object') return;
  switch (m.type) {
    case 'ready':
      S.ready = true; S.restarts = 0; setEngine(`Ready, ${fmt(m.words)} words`, 'ok'); scheduleCheck(0); break;
    case 'pack': setEngine(`Ready, ${fmt(m.brain)} names and places known`, 'ok'); S.packs = true; scheduleCheck(0); break;
    case 'slice':
      if (m.id !== S.reqId) return;
      for (const i of m.issues) S.acc.push(i);
      armWatchdog();
      el.progress.hidden = m.pos >= m.len; el.bar.style.width = (100 * m.pos / Math.max(1, m.len)) + '%';
      S.raw = S.acc.slice(); queueRefresh();
      break;
    case 'done':
      if (m.id !== S.reqId) return;
      clearTimeout(S.wd); S.checking = false; S.stats = m.stats; el.progress.hidden = true;
      if (m.meta && m.meta.truncated) banner('This text has a very large number of notes. Only the first ones are shown.', true);
      else if (m.meta && m.meta.errors) banner(`${m.meta.errors} paragraph(s) could not be checked.`, true);
      else banner('');
      refresh(); renderStats();
      break;
    case 'too-large': banner(`Plainpen checks up to ${fmt(m.limit)} characters at once. Please split the text.`); S.checking = false; refresh(); break;
    case 'error':
      if (m.fatal) { setEngine('Could not load the dictionary. ' + m.message, 'bad'); banner('The dictionary could not be loaded: ' + m.message + '. Check your connection and reload.'); }
      else banner('Checker note: ' + m.message, true);
      break;
  }
}

let checkTimer = 0;
function scheduleCheck(delay) {
  clearTimeout(checkTimer);
  checkTimer = setTimeout(sendCheck, delay ?? Math.min(1500, 250 + S.text.length / 2000));
}
function sendCheck() {
  if (!S.ready || !S.worker) return;
  const id = ++S.reqId;
  S.acc = []; S.checking = true;
  const p = S.profile.settings;
  S.worker.postMessage({ type: 'check', id, text: S.text, opts: { mode: p.mode, region: p.region, dialects: p.dialects, style: p.style } });
  armWatchdog(); renderPenny();
}

/* ---------------------------------------------------------------- refresh */
let rafPending = false;
function queueRefresh() { if (!rafPending) { rafPending = true; requestAnimationFrame(() => { rafPending = false; refresh(); }); } }

function refresh() {
  const kept = applyProfile(S.raw, S.profile, S.session);
  S.issues = resolveOverlaps(kept);
  S.active = Math.min(S.active, S.issues.length - 1);
  renderMirror(); renderTabs(); renderNotes(); renderScore();
}

function renderMirror() {
  const text = S.text, iss = S.issues, frag = document.createDocumentFragment();
  let lo = 0, hi = iss.length;
  if (iss.length > 3000) {                                  // large document: only mark the neighbourhood of the caret
    const c = el.editor.selectionStart || 0;
    let a = 0, b = iss.length;
    while (a < b) { const mid = (a + b) >> 1; if (iss[mid].end < c) a = mid + 1; else b = mid; }
    lo = Math.max(0, a - 1500); hi = Math.min(iss.length, a + 1500);
  }
  let pos = lo < iss.length && lo > 0 ? iss[lo].start : 0;
  if (lo > 0) frag.append(text.slice(0, pos));
  for (let i = lo; i < hi; i++) {
    const it = iss[i];
    if (it.start < pos) continue;
    if (it.start > pos) frag.append(text.slice(pos, it.start));
    const m = document.createElement('mark');
    m.className = 't-' + it.type + (i === S.active ? ' active' : '');
    m.dataset.i = String(i); m.textContent = text.slice(it.start, it.end);
    frag.append(m); pos = it.end;
  }
  frag.append(text.slice(pos), '​');
  el.mirror.replaceChildren(frag);
  el.mirror.scrollTop = el.editor.scrollTop;
  queueChips();
}

/* ---- teacher's pen: handwritten corrections above each mark, clickable ---- */
let chipsQueued = false;
function queueChips() { if (!chipsQueued) { chipsQueued = true; requestAnimationFrame(() => { chipsQueued = false; renderChips(); }); } }
function renderChips() {
  const box = el.chips.getBoundingClientRect(), frag = document.createDocumentFragment();
  const cands = [];
  for (const m of el.mirror.querySelectorAll('mark')) {
    const r = m.getClientRects()[0]; if (!r) continue;
    const top = r.top - box.top - 24, left = r.left - box.left;
    if (top < -20 || top > box.height || left > box.width) continue;
    const i = Number(m.dataset.i), it = S.issues[i]; if (!it) continue;
    const fix = it.fixes[0];
    if (it.type === 'style' && i !== S.active) continue;               // style hints stay a quiet highlight
    const label = fix === undefined ? GLYPH[it.type] : fix === '' ? 'delete' : fix.length > 22 ? fix.slice(0, 21) + '\u2026' : fix;
    cands.push({ i, it, fix, label, top, left, w: label.length * 8 + 14 });
  }
  cands.sort((x, y) => (y.i === S.active) - (x.i === S.active) || x.top - y.top || x.left - y.left);
  const placed = [];
  for (const c of cands) {
    if (placed.length >= 90) break;
    const hit = placed.some((p) => Math.abs(p.top - c.top) < 22 && c.left < p.left + p.w + 4 && p.left < c.left + c.w + 4);
    if (hit && c.i !== S.active) continue;                              // adapt: skip a correction that would collide
    placed.push(c);
    const chip = h('button', { type: 'button', class: 'chip' + (c.fix === undefined ? ' hint' : ''), 'aria-label': c.it.message, title: c.it.message, onclick: () => { if (c.fix !== undefined) actOn(c.i, 'fix', 0); else { el.editor.focus({ preventScroll: true }); el.editor.setSelectionRange(c.it.start, c.it.end); setActive(c.i, true); } } }, c.label);
    chip.style.left = Math.max(0, Math.min(c.left, box.width - c.w)) + 'px'; chip.style.top = Math.max(0, c.top) + 'px';
    frag.append(chip);
  }
  el.chips.replaceChildren(frag);
}
function tickAt(i) {
  const m = el.mirror.querySelector('mark[data-i="' + i + '"]'); if (!m) return;
  const r = m.getClientRects()[0], box = el.chips.getBoundingClientRect(); if (!r) return;
  const t = svg('M4 13l5 5L20 6', { 'stroke-width': '3.5' }); t.setAttribute('class', 'tick'); t.setAttribute('aria-hidden', 'true');
  t.style.left = (r.left - box.left + r.width / 2 - 15) + 'px'; t.style.top = (r.top - box.top - 26) + 'px';
  el.chips.parentElement.append(t); setTimeout(() => t.remove(), 1200);
}

function renderTabs() {
  const mb = $('#mb-count'); mb.hidden = !S.issues.length; mb.textContent = S.issues.length > 99 ? '99+' : String(S.issues.length);
  const counts = { all: S.issues.length, spelling: 0, grammar: 0, punct: 0, style: 0 };
  for (const i of S.issues) counts[i.type]++;
  el.tabs.replaceChildren(...TYPES.map(([id, label]) => h('button', { type: 'button', role: 'tab', 'aria-selected': S.filter === id ? 'true' : 'false', onclick: () => { S.filter = id; S.shown = 120; renderTabs(); renderNotes(); } }, label, ' ', h('b', { text: counts[id] }))));
}

function emptyState() {
  const hasText = S.text.trim().length > 0;
  const art = svg('M12 3l1.8 4.6L18.5 9l-4.700 1.400L12 15l-1.800-4.600L5.500 9l4.700-1.400z M19 15l.8 2.200L22 18l-2.200.8L19 21l-.8-2.200L16 18l2.200-.8z', { 'stroke-width': '1.6' });
  const box = h('div', { class: 'empty' }, art, h('div', { text: hasText ? (S.checking ? 'Reading your text' : 'All clear. Nothing to fix in this view.') : 'Your notes appear here as you write.' }));
  if (!hasText) box.append(h('button', { type: 'button', class: 'ghost', text: 'Try an example', onclick: () => { setText(SAMPLES[S.profile.settings.mode] || SAMPLES.professional); } }));
  return box;
}

function renderNotes() {
  const list = S.issues.map((it, i) => [it, i]).filter(([it]) => S.filter === 'all' || it.type === S.filter);
  if (!list.length) { el.notes.replaceChildren(emptyState()); return; }
  const nodes = list.slice(0, S.shown).map(([it, i]) => card(it, i));
  if (list.length > S.shown) nodes.push(h('button', { type: 'button', class: 'ghost more', text: `Show ${Math.min(120, list.length - S.shown)} more (${fmt(list.length - S.shown)} left)`, onclick: () => { S.shown += 120; renderNotes(); } }));
  el.notes.replaceChildren(...nodes);
}

function card(it, i) {
  const c = h('div', { class: 'note' + (i === S.active ? ' active' : ''), 'data-i': i, role: 'group', 'aria-label': it.message });
  c.append(h('div', { class: 'note-head' }, h('span', { class: 'glyph g-' + it.type, text: GLYPH[it.type] }), h('span', { text: it.type === 'punct' ? 'Punctuation' : it.type[0].toUpperCase() + it.type.slice(1) }), h('span', { class: 'note-text', text: it.text.length > 40 ? it.text.slice(0, 40) + '…' : it.text })));
  c.append(h('div', { class: 'note-msg', text: it.message }));
  if (it.fixes.length) {
    c.append(h('div', { class: 'fixes' }, it.fixes.slice(0, 4).map((f, k) => h('button', { type: 'button', class: 'fix' + (f === '' ? ' del' : ''), 'data-act': 'fix', 'data-k': k, text: f === '' ? 'Remove' : f === ' ' ? 'One space' : f }))));
  }
  const acts = h('div', { class: 'acts' }, h('button', { type: 'button', class: 'mini', 'data-act': 'ignore', text: 'Ignore' }));
  if (it.rule === 'SPELLING' || it.rule === 'TAUGHT_CAP') acts.append(h('button', { type: 'button', class: 'mini', 'data-act': 'teach', text: 'Teach…' }));
  if (it.rule !== 'SPELLING') acts.append(h('button', { type: 'button', class: 'mini', 'data-act': 'mute', text: 'Never flag this' }));
  acts.append(h('button', { type: 'button', class: 'mini', 'data-act': 'why', text: 'Why?' }));
  c.append(acts);
  if (it.type !== 'spelling' || it.rule !== 'SPELLING') c.append(h('div', { class: 'trust', title: 'How much Plainpen trusts this rule for you' }, h('i')));
  const bar = c.querySelector('.trust i'); if (bar) bar.style.width = Math.round(100 * (it.trust ?? 1)) + '%';
  return c;
}

/* -------------------------------------------------------- score + penny */
function renderScore() {
  const words = Math.max(S.stats ? S.stats.words : 0, 1);
  const W = { spelling: 1, grammar: 1, punct: .6, style: .25 };
  let pts = 0; for (const i of S.issues) pts += W[i.type] || 0;
  const hasText = S.text.trim().length > 0;
  const score = hasText ? Math.max(0, Math.round(100 - Math.min(100, (pts / Math.max(words, 20)) * 100 * 3.5))) : 100;
  const teacher = true;
  $('#score-num').textContent = !hasText ? '--' : teacher ? `${Math.round(score / 10)}/10` : String(score);
  $('#score-label').textContent = !hasText ? 'Ready' : score >= 90 ? 'Clear' : score >= 70 ? 'Good' : score >= 45 ? 'Needs work' : 'Rough';
  $('#score-sub').textContent = !hasText ? 'Paste or type to begin' : teacher ? (score >= 90 ? 'Excellent work!' : score >= 70 ? 'Good effort. Check my marks.' : score >= 45 ? 'Needs more care.' : 'See me after class.') : `${(pts / words * 100).toFixed(1)} issues per 100 words`;
  const fg = $('#dial-fg'); fg.style.transform = `scaleX(${hasText ? score / 100 : 0})`; fg.style.background = score >= 70 ? 'var(--good)' : score >= 45 ? 'var(--mark-punct)' : 'var(--bad)';
  if (hasText && score === 100 && S.lastScore < 100 && words > 20 && !S.checking) burst();
  S.lastScore = hasText ? score : 100; S.score = score; renderPenny();
}
function renderPenny() {
  const hasText = S.text.trim().length > 0;
  el.penny.dataset.mood = !hasText ? 'idle' : S.checking ? 'think' : S.score >= 90 ? 'happy' : S.score < 60 ? 'worry' : 'idle';
}
function burst() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = el.penny.getBoundingClientRect(), host = el.sheet.getBoundingClientRect();
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2, d = 40 + Math.random() * 40;
    const b = h('span', { class: 'burst' });
    b.style.left = (box.left - host.left + box.width / 2) + 'px'; b.style.top = (box.top - host.top + box.height / 2) + 'px';
    b.style.setProperty('--dx', Math.cos(a) * d + 'px'); b.style.setProperty('--dy', Math.sin(a) * d + 'px');
    el.sheet.append(b); setTimeout(() => b.remove(), 800);
  }
}

function renderStats() {
  const st = S.stats; if (!st) return;
  $('#st-words').textContent = `${fmt(st.words)} words`;
  $('#st-chars').textContent = `${fmt(S.text.length)} characters`;
  $('#st-read').textContent = `${st.minutes} min read`;
  const f = st.flesch;
  $('#st-flesch').textContent = st.words < 5 ? 'Readability n/a' : `Readability ${f} (${f >= 80 ? 'easy' : f >= 60 ? 'plain' : f >= 40 ? 'fairly hard' : 'hard'})`;
}

/* ---------------------------------------------------------- edit actions */
function replaceRange(s, e, r) {
  const ed = el.editor;
  ed.focus({ preventScroll: true });
  ed.setSelectionRange(s, e);
  let done = false;
  try { done = r === '' ? document.execCommand('delete') : document.execCommand('insertText', false, r); } catch {}
  if (!done) { ed.setRangeText(r, s, e, 'end'); ed.dispatchEvent(new Event('input', { bubbles: true })); }
}
const saveProfile = debounce(() => store.saveProfile(S.profile), 600);

function actOn(i, act, k) {
  const it = S.issues[i]; if (!it) return;
  if (act === 'fix') {
    const f = it.fixes[k]; if (f === undefined) return;
    learnAccept(S.profile, it, f); saveProfile();
    S.raw = S.raw.filter((r) => !(r.start === it.start && r.end === it.end && r.rule === it.rule));
    tickAt(i);
    replaceRange(it.start, it.end, f);
  } else if (act === 'ignore') {
    S.session.add(it.rule + '|' + it.text.toLowerCase());
    const learned = learnIgnore(S.profile, it);
    if (learned) { sendBrain(); toast(`Learned "${learned}" as a word.`, { label: 'Undo', run: () => { forget(S.profile, learned); sendBrain(); S.session.clear(); saveProfile(); refresh(); } }); }
    saveProfile(); refresh();
  } else if (act === 'teach') openBrain(it.text);
  else if (act === 'mute') {
    muteRule(S.profile, it.rule); saveProfile(); refresh();
    toast('Rule switched off. You can bring it back in the Brain.', { label: 'Undo', run: () => { unmuteRule(S.profile, it.rule); saveProfile(); refresh(); } });
  } else if (act === 'why') {
    const card = el.notes.querySelector(`.note[data-i="${i}"]`); if (!card) return;
    const old = card.querySelector('.why'); if (old) { old.remove(); return; }
    const st = S.profile.stats[`${S.profile.settings.mode}:${it.rule}`] || { a: 0, r: 0 };
    card.append(h('div', { class: 'why', text: `Rule ${it.rule}. Trust ${Math.round(100 * trust(S.profile, it.rule, it.p))}% in ${MODE_META[S.profile.settings.mode].label} mode (accepted ${st.a}, dismissed ${st.r}). Plainpen learns from what you do.` }));
  }
}

function setActive(i, scroll) {
  if (i === S.active) return;
  const prev = S.active; S.active = i;
  const m = (n) => el.mirror.querySelector(`mark[data-i="${n}"]`);
  if (m(prev)) m(prev).classList.remove('active');
  if (m(i)) m(i).classList.add('active');
  el.notes.querySelectorAll('.note.active').forEach((n) => n.classList.remove('active'));
  if (i >= S.shown && i >= 0) { S.shown = i + 20; renderNotes(); }
  const c = el.notes.querySelector(`.note[data-i="${i}"]`);
  if (c) { c.classList.add('active'); if (scroll) c.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
}
function issueAt(pos) {
  const iss = S.issues; let a = 0, b = iss.length;
  while (a < b) { const mid = (a + b) >> 1; if (iss[mid].end < pos) a = mid + 1; else b = mid; }
  return a < iss.length && iss[a].start <= pos ? a : -1;
}
function jump(dir) {
  if (!S.issues.length) return;
  const cur = S.active < 0 ? (dir > 0 ? -1 : S.issues.length) : S.active;
  const next = (cur + dir + S.issues.length) % S.issues.length;
  const it = S.issues[next];
  el.editor.focus({ preventScroll: true }); el.editor.setSelectionRange(it.start, it.end);
  const lineH = parseFloat(getComputedStyle(el.editor).lineHeight) || 30;
  const before = S.text.slice(0, it.start), approx = (before.match(/\n/g) || []).length + Math.floor((before.length % 80) / 80);
  el.editor.scrollTop = Math.max(0, approx * lineH - el.editor.clientHeight / 3);
  el.mirror.scrollTop = el.editor.scrollTop;
  setActive(next, true);
}

/* -------------------------------------------------------------- text I/O */
function setText(t) {
  if (t.length > MAX_CHARS) { banner(`That is more than ${fmt(MAX_CHARS)} characters. Please use a smaller file.`); return; }
  el.editor.focus({ preventScroll: true }); el.editor.select();
  let ok = false; try { ok = document.execCommand('insertText', false, t); } catch {}
  if (!ok) { el.editor.value = t; onInput(); }
}
const saveDraft = debounce(() => store.saveDraft(S.text).then((ok) => { if (!ok && S.text.length > 6e6) banner('Draft is too large to autosave in the browser. Download it to keep a copy.', true); }), 1500);

function shiftIssues(oldT, newT) {
  let p = 0; const max = Math.min(oldT.length, newT.length);
  while (p < max && oldT.charCodeAt(p) === newT.charCodeAt(p)) p++;
  let so = oldT.length, sn = newT.length;
  while (so > p && sn > p && oldT.charCodeAt(so - 1) === newT.charCodeAt(sn - 1)) { so--; sn--; }
  const delta = newT.length - oldT.length, next = [];
  for (const i of S.raw) { if (i.end <= p) next.push(i); else if (i.start >= so) next.push({ ...i, start: i.start + delta, end: i.end + delta }); }
  S.raw = next;
}
function onInput() {
  const t = el.editor.value;
  if (t.length > MAX_CHARS) { el.editor.value = S.text; banner(`Plainpen checks up to ${fmt(MAX_CHARS)} characters.`); return; }
  shiftIssues(S.text, t); S.text = t;
  $('#st-chars').textContent = `${fmt(t.length)} characters`;
  queueRefresh(); scheduleCheck(); saveDraft();
}

async function readFile(file) {
  if (!file) return;
  if (file.size > MAX_FILE) { banner(`That file is larger than ${fmt(MAX_FILE / 1e6)} MB.`); return; }
  const t = await file.text();
  if ((t.match(/\u0000/g) || []).length > t.length * 0.01) { banner('That does not look like a text file.'); return; }
  setText(t.replace(/\u0000/g, ''));
}

const downloadBlob = (name, text, type = 'text/plain;charset=utf-8') => {
  const a = h('a', { download: name, href: URL.createObjectURL(new Blob([text], { type })), rel: 'noopener' });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};

/* ------------------------------------------------------------ case menu */
function keepMap() {
  const m = new Map();
  for (const w of PROPER) m.set(w, properForm(w));
  for (const [k, e] of Object.entries(S.profile.taught)) if (['name', 'place', 'brand', 'acronym'].includes(e.kind)) m.set(k, e.form);
  return m;
}
function buildCaseMenu() {
  const menu = $('#case-menu'), btn = $('#btn-case');
  const group = (title, items) => [h('small', { text: title }), ...items.map((t) => h('button', { type: 'button', role: 'menuitem', onclick: () => { applyCase(t); close(); } }, h('span', { text: t.label })))];
  menu.replaceChildren(...group('Text', CASE_TOOLS.filter((t) => !t.group)), h('hr'), ...group('Developer', CASE_TOOLS.filter((t) => t.group === 'dev')), h('hr'), ...group('Clean up', CASE_TOOLS.filter((t) => t.group === 'clean')), h('small', { text: 'Applies to the selection, or to everything if nothing is selected. Names and acronyms you taught keep their casing.' }));
  const close = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  btn.addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; btn.setAttribute('aria-expanded', String(!menu.hidden)); });
  document.addEventListener('click', (e) => { if (!menu.contains(e.target)) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}
function applyCase(tool) {
  const ed = el.editor, a = ed.selectionStart, b = ed.selectionEnd, whole = a === b;
  const s = whole ? 0 : a, e = whole ? ed.value.length : b;
  const src = ed.value.slice(s, e);
  let out; try { out = tool.fn(src, keepMap()); } catch { toast('That change could not be applied.'); return; }
  if (out === src) { toast('Nothing to change.'); return; }
  replaceRange(s, e, out);
  toast(`${tool.label} applied to ${whole ? 'all text' : 'the selection'}.`, { label: 'Undo', run: () => { ed.focus(); document.execCommand('undo'); } });
}

/* --------------------------------------------------------------- dialogs */
function openBrain(word) {
  $('#t-word').value = word || ''; $('#t-form').value = word || ''; $('#t-note').value = ''; $('#t-msg').textContent = '';
  renderBrain(); $('#dlg-brain').showModal(); $('#t-word').focus();
}
function renderBrain() {
  const q = $('#t-search').value.trim().toLowerCase();
  const rows = Object.entries(S.profile.taught).filter(([k, e]) => !q || k.includes(q) || e.note.toLowerCase().includes(q)).sort((a, b) => b[1].t - a[1].t);
  $('#t-count').textContent = `(${Object.keys(S.profile.taught).length})`;
  $('#t-list').replaceChildren(...rows.slice(0, 200).map(([k, e]) => h('li', {}, h('span', {}, h('b', { text: e.form }), ' ', h('span', { class: 'k', text: e.kind }), e.note ? ' ' + e.note : ''), h('span', { class: 'row' }, h('button', { type: 'button', class: 'mini', text: 'Edit', onclick: () => { $('#t-word').value = k; $('#t-form').value = e.form; $('#t-kind').value = e.kind; $('#t-note').value = e.note; } }), h('button', { type: 'button', class: 'mini', text: 'Remove', onclick: () => { forget(S.profile, k); afterBrain(); renderBrain(); } })))));
  const items = [];
  for (const r of S.profile.muted) items.push(h('li', {}, h('span', {}, h('b', { text: r }), ' ', h('span', { class: 'k', text: 'switched off' })), h('button', { type: 'button', class: 'mini', text: 'Turn on', onclick: () => { unmuteRule(S.profile, r); afterBrain(); renderBrain(); } })));
  for (const [k, s] of Object.entries(S.profile.stats)) { const [mode, rule] = k.split(':'); items.push(h('li', {}, h('span', {}, h('b', { text: rule }), ' ', h('span', { class: 'k', text: mode }), ` accepted ${s.a}, dismissed ${s.r}`), h('span', { class: 'k', text: Math.round(100 * (s.a + 0.7 * 4) / (s.a + s.r + 4)) + '%' }))); }
  if (!items.length) items.push(h('li', { text: 'Nothing yet. Accept or dismiss suggestions and Plainpen will adapt.' }));
  $('#l-list').replaceChildren(...items.slice(0, 80));
}
function afterBrain() { sendBrain(); S.session.clear(); saveProfile(); refresh(); }

function wireDialogs() {
  $('#btn-brain').addEventListener('click', () => openBrain(''));
  $('#t-save').addEventListener('click', () => {
    const w = $('#t-word').value, ok = teach(S.profile, w, $('#t-kind').value, $('#t-note').value, $('#t-form').value.trim() || w);
    $('#t-msg').textContent = ok ? `Taught "${w.trim()}".` : 'Use letters only (up to 64 characters).';
    if (ok) { afterBrain(); renderBrain(); }
  });
  $('#t-search').addEventListener('input', renderBrain);
  $('#lex-export').addEventListener('click', () => downloadBlob('plainpen-lexicon.json', JSON.stringify(exportLexicon(S.profile), null, 2), 'application/json'));
  $('#lex-import').addEventListener('click', () => $('#lex-file').click());
  $('#lex-file').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try { if (f.size > 5e6) throw new Error('File too large.'); const n = importLexicon(S.profile, JSON.parse(await f.text())); afterBrain(); renderBrain(); $('#t-msg').textContent = `Imported ${n} entries.`; }
    catch (err) { $('#t-msg').textContent = err.message || 'Could not import that file.'; }
  });

  $('#btn-data').addEventListener('click', () => { const s = store.getStatus(); $('#store-status').textContent = s.persistent ? 'Saved in this browser, encrypted with AES-GCM 256.' : (s.reason || 'Not saved: working in memory only.'); $('#dlg-data').showModal(); });
  $('#bk-export').addEventListener('click', async () => {
    try { downloadBlob('plainpen-backup.json', await store.exportBackup(S.profile, $('#bk-pass').value), 'application/json'); $('#bk-msg').textContent = 'Backup downloaded.'; }
    catch (e) { $('#bk-msg').textContent = e.message; }
  });
  $('#bk-import').addEventListener('click', () => $('#bk-file').click());
  $('#bk-file').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try { if (f.size > 40e6) throw new Error('File too large.'); S.profile = await store.importBackup(await f.text(), $('#bk-pass').value); applySettings(); afterBrain(); $('#bk-msg').textContent = 'Backup restored.'; }
    catch (err) { $('#bk-msg').textContent = err.message; }
  });
  $('#wipe').addEventListener('click', async () => {
    if ($('#wipe-confirm').value !== 'ERASE') { $('#wipe-confirm').focus(); return; }
    await store.wipeAll(); S.profile = emptyProfile(); el.editor.value = ''; S.text = ''; S.raw = []; S.session.clear();
    applySettings(); sendBrain(); refresh(); $('#wipe-confirm').value = ''; $('#dlg-data').close(); toast('Everything was erased from this browser.');
  });
  for (const d of document.querySelectorAll('dialog')) d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
}

/* -------------------------------------------------------------- settings */
function applySettings() {
  const p = S.profile.settings;
  document.documentElement.dataset.mode = p.mode;
  document.documentElement.dataset.theme = p.theme === 'dark' ? 'dark' : 'light';
  $('#btn-theme').setAttribute('aria-label', p.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  el.region.value = p.region === 'en-IN' && (p.dialects || []).includes('bn') ? 'en-IN+bn' : p.region; el.style.checked = p.style;

  for (const b of el.modes.children) b.setAttribute('aria-checked', String(b.dataset.mode === p.mode));
}
function change(fn) { fn(S.profile.settings); applySettings(); saveProfile(); S.session.clear(); S.raw = []; scheduleCheck(0); refresh(); }

function buildModes() {
  el.modes.replaceChildren(...MODE_IDS.map((id) => h('button', { type: 'button', role: 'radio', 'data-mode': id, 'aria-checked': 'false', onclick: () => change((s) => { s.mode = id; }) }, svg(MODE_META[id].icon), MODE_META[id].label)));
  el.modes.addEventListener('keydown', (e) => {
    if (!['ArrowRight', 'ArrowLeft'].includes(e.key)) return;
    const i = MODE_IDS.indexOf(S.profile.settings.mode), n = (i + (e.key === 'ArrowRight' ? 1 : MODE_IDS.length - 1)) % MODE_IDS.length;
    change((s) => { s.mode = MODE_IDS[n]; }); el.modes.children[n].focus();
  });
}

/* ------------------------------------------------------------------ init */
async function init() {
  buildModes(); buildCaseMenu(); wireDialogs();
  // events
  el.editor.addEventListener('input', onInput);
  el.editor.addEventListener('scroll', () => { el.mirror.scrollTop = el.editor.scrollTop; queueChips(); });
  window.addEventListener('resize', queueChips);
  const onCaret = () => { const i = issueAt(el.editor.selectionStart); if (i !== S.active) setActive(i, true); };
  el.editor.addEventListener('click', onCaret); el.editor.addEventListener('keyup', (e) => { if (!e.altKey) onCaret(); });
  el.notes.addEventListener('click', (e) => {
    const card = e.target.closest('.note'); if (!card) return;
    const i = Number(card.dataset.i), btn = e.target.closest('[data-act]');
    if (btn) actOn(i, btn.dataset.act, Number(btn.dataset.k));
    else { const it = S.issues[i]; if (it) { el.editor.focus({ preventScroll: true }); el.editor.setSelectionRange(it.start, it.end); } setActive(i, false); }
  });
  document.addEventListener('keydown', (e) => {
    if (!e.altKey) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); jump(1); } else if (e.key === 'ArrowUp') { e.preventDefault(); jump(-1); }
    else if (e.key === 'Enter' && S.active >= 0) { e.preventDefault(); actOn(S.active, 'fix', 0); }
  });
  el.region.addEventListener('change', () => change((s) => { const v = el.region.value; if (v === 'en-IN+bn') { s.region = 'en-IN'; s.dialects = ['bn']; } else { s.region = v; s.dialects = []; } }));
  el.style.addEventListener('change', () => change((s) => { s.style = el.style.checked; }));
  $('#btn-theme').addEventListener('click', () => change((s) => { s.theme = s.theme === 'dark' ? 'light' : 'dark'; }));
  $('#btn-paste').addEventListener('click', async () => { try { const t = await navigator.clipboard.readText(); if (t) setText(t); } catch { toast('Your browser blocked clipboard access. Press Ctrl+V in the text box.'); } el.editor.focus(); });
  $('#btn-copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(el.editor.value); toast('Copied.'); } catch { el.editor.select(); toast('Press Ctrl+C to copy.'); } });
  $('#btn-save').addEventListener('click', () => downloadBlob('plainpen.txt', el.editor.value));
  $('#btn-open').addEventListener('click', () => $('#file').click());
  $('#file').addEventListener('change', (e) => { readFile(e.target.files[0]); e.target.value = ''; });
  $('#btn-clear').addEventListener('click', () => { const prev = el.editor.value; if (!prev) return; el.editor.focus(); el.editor.select(); document.execCommand('delete'); toast('Cleared.', { label: 'Undo', run: () => { el.editor.focus(); document.execCommand('undo'); } }); });
  // drag and drop
  const drop = $('#drop'); let depth = 0;
  el.sheet.addEventListener('dragenter', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { depth++; drop.hidden = false; } });
  el.sheet.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; drop.hidden = true; } });
  el.sheet.addEventListener('dragover', (e) => e.preventDefault());
  el.sheet.addEventListener('drop', (e) => { e.preventDefault(); depth = 0; drop.hidden = true; readFile(e.dataTransfer?.files?.[0]); });

  // storage + profile
  setEngine('Loading dictionary', 'busy');
  const st = await store.init(); S.storeStatus = st;
  S.profile = await store.loadProfile(); applySettings();
  if (!st.persistent && st.reason) banner(st.reason, true);
  const draft = await store.loadDraft();
  if (draft) { el.editor.value = draft; S.text = draft; }
  bootWorker(); refresh();
  renderStats();

  // optional analytics (off unless the site owner configured it AND the visitor agreed)
  if (GA_ID) {
    $('#analytics-h').hidden = false; $('#analytics-box').hidden = false;
    const cb = $('#analytics-consent'); let consent = false; try { consent = localStorage.getItem('plainpen-ga') === '1'; } catch {}
    cb.checked = consent; if (consent) loadAnalytics();
    cb.addEventListener('change', () => { try { localStorage.setItem('plainpen-ga', cb.checked ? '1' : '0'); } catch {} if (cb.checked) loadAnalytics(); else toast('Statistics turned off. Reload to stop all measurement.'); });
  }
  // phone app shell: bottom bar + sheets
  const setPanel = (name) => {
    if (name) document.body.dataset.panel = name; else delete document.body.dataset.panel;
    $('#scrim').hidden = !name; $('#mb-tools').setAttribute('aria-expanded', String(name === 'tools')); $('#mb-notes').setAttribute('aria-expanded', String(name === 'notes'));
  };
  const toggle = (name) => setPanel(document.body.dataset.panel === name ? '' : name);
  $('#mb-tools').addEventListener('click', () => toggle('tools'));
  $('#mb-notes').addEventListener('click', () => toggle('notes'));
  $('#mb-paste').addEventListener('click', () => $('#btn-paste').click());
  $('#scrim').addEventListener('click', () => setPanel(''));
  $('#sheet-close').addEventListener('click', () => setPanel(''));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setPanel(''); });
  matchMedia('(min-width: 721px)').addEventListener('change', (e) => { if (e.matches) setPanel(''); });
  window.__setPanel = setPanel;

  // install as an app (Chrome, Edge, Android) + a hint for iOS Safari
  let deferred = null; const installBtn = $('#btn-install');
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; installBtn.hidden = false; });
  installBtn.addEventListener('click', async () => { if (!deferred) return; deferred.prompt(); try { await deferred.userChoice; } catch {} deferred = null; installBtn.hidden = true; });
  window.addEventListener('appinstalled', () => { installBtn.hidden = true; toast('Plainpen is installed.'); });
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !matchMedia('(display-mode: standalone)').matches && !navigator.standalone;
  try { if (ios && !localStorage.getItem('plainpen-ios-hint')) { toast('To install: tap Share, then Add to Home Screen.', { label: 'Got it', run: () => { try { localStorage.setItem('plainpen-ios-hint', '1'); } catch {} } }); } } catch {}

  // text shared into the app from another app (handled inside the service worker, never sent to a server)
  const qs = new URLSearchParams(location.search);
  if (qs.get('shared') === '1' && 'caches' in window) {
    try { const c = await caches.open('plainpen-share'), r = await c.match('shared-text'); if (r) { const t = (await r.text()).slice(0, MAX_CHARS); await c.delete('shared-text'); if (t.trim()) { setText(t); toast('Text received from the share sheet.'); } } } catch {}
  }
  if (qs.has('shared') || qs.has('new') || qs.has('source')) { if (qs.get('new') === '1') { el.editor.value = ''; onInput(); el.editor.focus(); } history.replaceState(null, '', location.pathname); }

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register(tt.createScriptURL('sw.js')).catch(() => {});
  window.addEventListener('beforeunload', () => { store.saveDraft(S.text); store.saveProfile(S.profile); });
}
async function loadAnalytics() { try { (await import('./analytics.js')).start(GA_ID, tt); } catch {} }

init().catch((e) => { banner('Plainpen could not start: ' + (e && e.message || e)); });
