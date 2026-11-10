// Penlight engine, pure JS, no DOM, no network, no ML.
// Runs inside a Web Worker (and in Node for tests).
//
// Three original pieces:
//  1. Skeleton-Rank   spelling: consonant-skeleton index + edit-1 retrieval,
//                     ranked by keyboard-aware weighted Damerau-Levenshtein.
//  2. Tag-Lattice     grammar: closed-class tags + suffix morphology let rules
//                     match patterns such as "#BE #VBN" instead of only literals.
//  3. Trust-Gate      lives in profile.js (per-rule learned precision).

import { buildRegionMaps, INDIAN_ACCEPT, IN_IDIOMS, PROPER, EXTRA_PATTERNS, MALAPROPS, DIALECTS, STE_WORDS } from './lexicon.js';

const WORD_RE =/\p{L}+(?:['’]\p{L}+)*|\p{N}+(?:[.,]\p{N}+)*|[^\s]/gu;
// Text the checker must never judge: URLs, emails, @mentions, #tags, inline code,
// file names, paths, CLI flags, snake_case / dotted identifiers, emoticons.
const MASK_RE = new RegExp([
  'https?:\\/\\/\\S+', 'www\\.\\S+', '[\\w.+-]+@[\\w-]+\\.[\\w.-]+', '(?<![\\w])[@#]\\w+',
  '`[^`\\n]+`',
  '\\b[\\w-]+\\.(?:js|jsx|ts|tsx|json|py|md|html|css|scss|txt|yml|yaml|java|go|rs|cpp|c|h|sh|toml|xml|csv|png|jpe?g|svg|pdf|docx?|xlsx?|env|lock|log)\\b',
  '(?<![\\w])(?:\\.{0,2}\\/|[A-Za-z]:\\\\)[\\w./\\\\-]+',
  '(?<![\\w-])--?[A-Za-z][\\w-]*',
  '\\b\\w+(?:_\\w+)+\\b', '\\b\\w+(?:\\.[a-z_]\\w+)+(?:\\(\\))?',
  '(?<!\\w)[:;=]-?[)(DPpOo\\/\\\\|](?!\\w)',
].join('|'), 'g');

/* ------------------------------------------------------------- voice modes */
// A mode is just a bundle of switches. Self-learning (profile.js) then adjusts
// trust per mode, so dismissing a rule in Casual never mutes it in Professional.
export const MODES = {
  professional: { label: 'Professional', style: 1, weak: 1, passive: 1, wordy: 1, buzz: 1, informal: 1, exclaim: 1, longSent: 35, slang: 0, tech: 0, capital: 1, capI: 1, repeatPunct: 1, emDash: 1 },
  technical:    { label: 'Technical',    style: 1, weak: 1, passive: 1, wordy: 1, buzz: 1, informal: 1, exclaim: 1, longSent: 30, slang: 0, tech: 1, condescend: 1, capital: 1, capI: 1, repeatPunct: 1, emDash: 1 },
  friendly:     { label: 'Friendly',     style: 1, weak: 0, passive: 0, wordy: 1, buzz: 0, informal: 0, exclaim: 0, longSent: 45, slang: 1, tech: 0, capital: 1, capI: 1, repeatPunct: 0, emDash: 1 },
  ste:          { label: 'Simplified (STE)', style: 1, weak: 1, passive: 1, wordy: 1, buzz: 1, informal: 1, exclaim: 1, longSent: 25, slang: 0, tech: 1, condescend: 1, capital: 1, capI: 1, repeatPunct: 1, ste: 1, emDash: 1 },
  casual:       { label: 'Casual',       style: 0, weak: 0, passive: 0, wordy: 0, buzz: 0, informal: 0, exclaim: 0, longSent: 0,  slang: 1, tech: 0, capital: 0, capI: 0, repeatPunct: 0 },
};
export const modeCfg = (opts = {}) => {
  const base = MODES[opts.mode] || MODES.professional;
  const cfg = { ...base, mode: MODES[opts.mode] ? opts.mode : 'professional', region: ['en-US', 'en-GB', 'en-IN'].includes(opts.region) ? opts.region : 'en-US', dialects: (Array.isArray(opts.dialects) ? opts.dialects : []).filter((d) => Object.hasOwn(DIALECTS, d)).sort() };
  if (opts.style === false) Object.assign(cfg, { style: 0, weak: 0, passive: 0, wordy: 0, buzz: 0, informal: 0, exclaim: 0, longSent: 0, condescend: 0 });
  return cfg;
};
const LS = (s) => new Set(s.split(' '));
// Modern lingo, three layers:
//  MODERN  neutral internet/AI-era vocabulary + brands, accepted in every mode
//  SLANG   chat / social-media / text-speak, accepted in Friendly + Casual only
//  HINGLISH romanised Hindi common in Indian-English chats, Friendly + Casual only
const MODERN = LS('email emails online offline website websites webpage smartphone smartphones wifi bluetooth hashtag hashtags podcast podcasts blog blogs blogger bloggers vlog vlogs vlogger influencer influencers unfollow unfollowed retweet retweeted tweet tweets startup startups crowdfunding livestream livestreams livestreamed streaming binge bingeing doomscrolling emoji emojis selfie selfies app apps chatbot chatbots deepfake deepfakes prompt prompts llm llms genai multimodal screenshot screenshots upvote downvote unsubscribe download downloads upload uploads inbox login logout signup cryptocurrency bitcoin ethereum nft nfts metaverse telehealth ecommerce fintech edtech proptech clickbait paywall subreddit memes meme gif gifs webinar webinars whatsapp instagram insta tiktok youtube snapchat telegram netflix spotify google chatgpt openai paytm gpay phonepe zomato swiggy uber ola linkedin facebook twitter reddit discord zoom skype');
const SLANG = LS('lol lmao lmfao rofl omg omfg btw imo imho tbh idk idc fyi brb ttyl omw nvm ikr thx ty tyvm np pls plz yeah yep yup nope nah ok okay hmm hm haha hahaha hehe lolz wow yay oops ugh meh gonna wanna gotta kinda sorta lemme dunno cuz cos bc tho thru bff bffs dm dms ftw irl smh fomo yolo wtf wth hey hiya heya heyy sup wyd hmu tmrw tmr ootd tmi tldr af rn ig jk ily hbd gm gn gg afk noob noobs bruh bro bros sis bestie besties bae vibe vibes vibing stan stans simp simps yeet yeeted flex flexing flexed drip clout cringe cringey slay slayed slaying lowkey highkey rizz sus fam goat ngl iykyk fr frfr ong istg ghosting ghosted ghost fyp boomer boomers zoomer zoomers glowup rant ranting trolling troll trolls lit goated bussin salty shook periodt sksksk oof yikes ew eww aww awww aaa tf damn dang kinda imma ima lemme gimme tryna finna ya yall y\'all nahh noooo soooo');
const HINGLISH = LS('yaar yar bhai bhaiya didi dada dost acha accha achha theek thik kya hai hain nahi nahin haan han arre arey are oye abhi bas chalo chal chai paneer dosa samosa biryani desi jugaad namaste ji sir madam lakh crore rupees diwali holi eid pooja puja mandir bhaiyya masala tadka dhaba chalega kaise kaisa kaisi kyun kyu bilkul zaroor mast jhakaas ekdum bindaas timepass paisa shaadi mehndi sangeet');
const TECH = LS('api apis json html css url urls http https cli sdk sdks regex async await localhost config configs repo repos github gitlab npm frontend backend devops kubernetes docker webhook webhooks middleware namespace namespaces boolean int str ui ux saas oauth sql nosql ssh ssl tls tcp udp dns cdn gpu cpu ram ide ides plugin plugins runtime runtimes codebase dataset datasets metadata param params stdout stderr stdin env linter linters refactor refactoring deploy deploys deployment redis mongodb postgres mysql sqlite aws gcp azure serverless microservice microservices autoscaling timestamp timestamps uuid uuids enum enums lookup lookups workflow workflows backend frontend dropdown checkbox login logout signup username usernames onboarding changelog readme todo todos wasm webassembly typescript javascript python rust golang nodejs unix linux macos ios android github');
const INFORMAL = { gonna: 'going to', wanna: 'want to', gotta: 'have to', kinda: 'kind of', sorta: 'sort of', lemme: 'let me', dunno: "don't know", cuz: 'because', "'cause": 'because', yeah: 'yes', nope: 'no', yep: 'yes', ok: 'OK', okay: 'OK', thx: 'thanks', pls: 'please', plz: 'please', btw: 'by the way', fyi: 'for your information' };
const BUZZ = [
  ['utilize', 'use'], ['utilise', 'use'], ['facilitate', 'help'], ['commence', 'start'], ['endeavor', 'try'], ['endeavour', 'try'],
  ['going forward', 'from now on'], ['reach out to', 'contact'], ['circle back', 'follow up'], ['touch base', 'check in'],
  ['low-hanging fruit', 'easy win'], ['at the end of the day', ''], ['think outside the box', ''], ['allows you to', 'lets you'],
  ['click on', 'click'], ['prior to', 'before'], ['subsequent to', 'after'], ['in conjunction with', 'with'],
];
const STE_MODALS = LS('should could would might may shall ought');
const CONDESCEND = LS('easy easily obviously clearly trivial trivially simply');
const MAXSEG = 4000;

/* ------------------------------------------------------------------ tokens */

export function tokenize(text) {
  const masked = [];
  for (const m of text.matchAll(MASK_RE)) masked.push([m.index, m.index + m[0].length]);
  const toks = [];
  let mi = 0;
  for (const m of text.matchAll(WORD_RE)) {
    const s = m.index, t = m[0];
    while (mi < masked.length && masked[mi][1] <= s) mi++;
    if (mi < masked.length && s >= masked[mi][0] && s < masked[mi][1]) continue;
    const kind = /^\p{L}/u.test(t) ? 'w' : /^\p{N}/u.test(t) ? 'n' : 'p';
    toks.push({ t, s, e: s + t.length, kind, low: t.toLowerCase().replace(/’/g, "'") });
  }
  return { toks, masked };
}

const ABBR = new Set(['mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'vs', 'etc', 'inc', 'ltd', 'co', 'fig', 'approx', 'dept', 'no']);

function markSentences(toks, continued) {
  let start = !continued;
  for (let i = 0; i < toks.length; i++) {
    const k = toks[i];
    if (k.kind === 'p' && /^[.!?…]$/.test(k.t)) {
      const prev = toks[i - 1];
      let end = true;
      if (k.t === '.' && prev && prev.e === k.s) {
        if (prev.kind === 'w' && (ABBR.has(prev.low) || prev.t.length === 1)) end = false;
        if (prev.kind === 'n' && prev.t.length <= 2) end = false;
      }
      // ellipsis / dialogue tag: `Wait... what`, `"Run!" and then`, lowercase continues the sentence
      const nxt = toks[i + 1];
      if (k.t === '.' && nxt && nxt.t === '.' && nxt.s === k.e) end = false;
      if (end) {
        let j = i + 1, quote = false;
        while (toks[j] && toks[j].kind === 'p' && /^["”’')\]]$/.test(toks[j].t) && toks[j].s === toks[j - 1].e) { quote = true; j++; }
        const ellipsis = (k.t === '.' && prev && prev.t === '.' && prev.e === k.s) || k.t === '…';
        if ((quote || ellipsis) && toks[j] && toks[j].kind === 'w' && /^\p{Ll}/u.test(toks[j].t)) end = false;
      }
      if (end) { start = true; k.endsSentence = true; }
      continue;
    }
    if (k.kind === 'p' && /^["'“”‘’(\[]$/.test(k.t)) continue;
    if (start) { k.sentStart = true; start = false; }
  }
}

/* -------------------------------------------------------------------- tags */
// Tag-Lattice: each token carries a set of lightweight tags.

const L = (s) => new Set(s.split(' '));
const CLOSED = {
  DET: L('a an the this that these those my your his her its our their some any each every no another'),
  BE: L("am is are was were be been being 'm 's 're"),
  HAVE: L('have has had having'),
  DO: L('do does did doing'),
  MODAL: L('can could will would shall should may might must'),
  PREP: L('in on at by for with about against between into through during before after above below from up down of off over under to'),
  CONJ: L('and or but nor so yet because although while if unless'),
  SUBJ: L('i you he she it we they'),
  SG3: L('he she it'),
  PLSUBJ: L('we they you'),
};
const IRREG_PP = L('done made given taken seen written known shown found built held kept sent told begun broken chosen driven eaten fallen forgotten gotten grown hidden spoken stolen thrown worn won lost paid sold bought brought caught taught thought understood');
const ADJ_ED = L('tired excited bored interested married scared worried surprised pleased concerned supposed used prepared qualified experienced advanced limited related united united determined');

export function tagsOf(low) {
  const tags = [];
  for (const k in CLOSED) if (CLOSED[k].has(low)) tags.push(k);
  if (IRREG_PP.has(low) || (/..ed$/.test(low) && !ADJ_ED.has(low))) tags.push('VBN');
  if (/..ing$/.test(low)) tags.push('VBG');
  if (/..ly$/.test(low)) tags.push('ADV');
  return tags;
}

/* ------------------------------------------------------------- rule tables */
// Pattern element: "a|b|c" literal alternatives, or "#TAG". `span` = token
// indices (within the match) to replace. `fix` = string or fn(matchedTokens).
// `p` = base precision (prior used by Trust-Gate).

const PATTERN_RULES = [
  { id: 'MODAL_OF', p: .96, type: 'grammar', m: ['could|should|would|must|might|may', 'of'], span: [1, 1], fix: 'have', msg: 'Use "have", not "of".' },
  { id: 'ALOT', p: .97, type: 'spelling', m: ['alot'], fix: 'a lot', msg: '"A lot" is two words.' },
  { id: 'THEIR_IS', p: .9, type: 'grammar', m: ['their', 'is|are|was|were|isn\'t|aren\'t'], span: [0, 0], fix: 'there', msg: 'Did you mean "there"?' },
  { id: 'YOUR_WELCOME', p: .85, type: 'grammar', m: ['your', 'welcome'], span: [0, 0], fix: "you're", msg: 'Did you mean "you\'re"?' },
  { id: 'ITS_ITS', p: .85, type: 'grammar', m: ['its', 'a|an|the|been|not|very|going|too|also|just|now|always|never|time|clear|important|possible'], span: [0, 0], fix: "it's", msg: 'Did you mean "it\'s" (it is)?' },
  { id: 'ITS_OWN', p: .95, type: 'grammar', m: ["it's", 'own'], span: [0, 0], fix: 'its', msg: 'Possessive "its" has no apostrophe.' },
  { id: 'THAN_THEN', p: .9, type: 'grammar', m: ['more|less|better|worse|bigger|smaller|greater|fewer|higher|lower|faster|slower|older|younger|larger|easier|harder|rather|other', 'then'], span: [1, 1], fix: 'than', msg: 'Comparison needs "than".' },
  { id: 'TOO_ADJ', p: .85, type: 'grammar', m: ['to', 'much|many|late|early|big|small|far|expensive|difficult'], span: [0, 0], fix: 'too', msg: 'Did you mean "too"?' },
  { id: 'LOSE_LOOSE', p: .9, type: 'grammar', m: ["to|will|would|can|could|might|not|don't|didn't|won't", 'loose'], span: [1, 1], fix: 'lose', msg: 'Verb form is "lose".' },
  { id: 'SVA_3SG_DONT', p: .95, type: 'grammar', m: ['he|she|it', "don't"], span: [1, 1], fix: "doesn't", msg: 'Use "doesn\'t" with he/she/it.' },
  { id: 'SVA_3SG_HAVE', p: .93, type: 'grammar', m: ['he|she|it', 'have'], span: [1, 1], fix: 'has', msg: 'Use "has" with he/she/it.' },
  { id: 'SVA_3SG_DO', p: .85, type: 'grammar', m: ['he|she|it', 'do'], span: [1, 1], fix: 'does', msg: 'Use "does" with he/she/it.' },
  { id: 'SVA_3SG_ARE', p: .93, type: 'grammar', m: ['he|she|it', 'are'], span: [1, 1], fix: 'is', msg: 'Use "is" with he/she/it.' },
  { id: 'SVA_I', p: .96, type: 'grammar', m: ['i', 'is|are|has|does'], span: [1, 1], fix: (m) => ({ is: 'am', are: 'am', has: 'have', does: 'do' })[m[1].low], msg: 'Wrong verb form after "I".' },
  { id: 'SVA_PL', p: .93, type: 'grammar', m: ['we|they|you', 'is|was|has|does'], span: [1, 1], fix: (m) => ({ is: 'are', was: 'were', has: 'have', does: 'do' })[m[1].low] && (m[0].low === 'you' && m[1].low === 'is' ? 'are' : ({ is: 'are', was: 'were', has: 'have', does: 'do' })[m[1].low]), msg: 'Verb does not agree with the subject.' },
  { id: 'SVA_THESE', p: .93, type: 'grammar', m: ['these|those', 'is|was'], span: [1, 1], fix: (m) => (m[1].low === 'is' ? 'are' : 'were'), msg: 'Plural subject needs a plural verb.' },
  { id: 'IRREGARDLESS', p: .9, type: 'grammar', m: ['irregardless'], fix: 'regardless', msg: '"Regardless" is the standard word.' },
];

const CONTRACTIONS = {
  dont: "don't", doesnt: "doesn't", didnt: "didn't", cant: "can't", wont: "won't", isnt: "isn't", arent: "aren't",
  wasnt: "wasn't", werent: "weren't", havent: "haven't", hasnt: "hasn't", hadnt: "hadn't", wouldnt: "wouldn't",
  couldnt: "couldn't", shouldnt: "shouldn't", im: "I'm", ive: "I've", youre: "you're", theyre: "they're",
  thats: "that's", whats: "what's", theres: "there's",
};
const KNOWN_CONTRACTIONS = L("can't won't shan't ain't y'all o'clock ma'am let's");

const WORDY = [
  ['in order to', 'to'], ['due to the fact that', 'because'], ['at this point in time', 'now'], ['at the present time', 'now'],
  ['in the event that', 'if'], ['for the purpose of', 'for'], ['with regard to', 'about'], ['has the ability to', 'can'],
  ['is able to', 'can'], ['in the near future', 'soon'], ['each and every', 'every'], ['first and foremost', 'first'],
  ['a large number of', 'many'], ['in spite of the fact that', 'although'], ['it goes without saying that', ''],
];
const WEAK = L('very really just quite basically literally actually simply totally extremely');
const CLICHE = []; // intentionally empty, add community rules via /rules in future

/* -------------------------------------------------------- spelling helpers */

const COMMON = L('the be to of and a in that have i it for not on with he as you do at this but his by from they we say her she or an will my one all would there their what so up out if about who get which go me when make can like time no just him know take people into year your good some could them see other than then now look only come its over think also back after use two how our work first well way even new want because any these give day most us is was are were been has had did said going made over such here thing many through where much before right too means old any same tell boy follow came want show also around form three small set put end why again turn here off went old number great men say');

const ALPHA = 'abcdefghijklmnopqrstuvwxyz';
const VOWELS = L('a e i o u');
const KB_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const KB = {};
KB_ROWS.forEach((row, r) => [...row].forEach((c, i) => (KB[c] = [r, i])));
const adjacent = (a, b) => {
  const x = KB[a], y = KB[b];
  return x && y && Math.abs(x[0] - y[0]) <= 1 && Math.abs(x[1] - y[1]) <= 1;
};
const subCost = (a, b) => (a === b ? 0 : adjacent(a, b) ? .5 : VOWELS.has(a) && VOWELS.has(b) ? .6 : 1);

// Weighted Damerau-Levenshtein (optimal string alignment).
// Cheap doubled-letter edits, cheap transposition, cheap keyboard-neighbour subs.
export function weightedDistance(a, b) {
  const n = a.length, m = b.length;
  const d = Array.from({ length: n + 1 }, () => new Float32Array(m + 1));
  const insDel = (s, i) => (i > 0 && s[i] === s[i - 1]) || (s[i + 1] !== undefined && s[i] === s[i + 1]) ? .4 : 1;
  for (let i = 1; i <= n; i++) d[i][0] = d[i - 1][0] + insDel(a, i - 1);
  for (let j = 1; j <= m; j++) d[0][j] = d[0][j - 1] + insDel(b, j - 1);
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      let v = Math.min(
        d[i - 1][j] + insDel(a, i - 1),
        d[i][j - 1] + insDel(b, j - 1),
        d[i - 1][j - 1] + subCost(a[i - 1], b[j - 1]),
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2][j - 2] + .6);
      d[i][j] = v;
    }
  }
  return d[n][m];
}

// Consonant skeleton with sound-alike folding: "fone"/"phone", "nollej"/"knowledge".
export function skeleton(w) {
  let s = w.toLowerCase()
    .replace(/^kn/, 'n').replace(/^wr/, 'r').replace(/^ps/, 's').replace(/^wh/, 'w')
    .replace(/ph/g, 'f').replace(/ck/g, 'k').replace(/gh/g, '').replace(/[cq]/g, 'k')
    .replace(/x/g, 'ks').replace(/z/g, 's').replace(/dg/g, 'j').replace(/[yw]/g, 'u');
  const first = s[0];
  let out = first;
  for (let i = 1; i < s.length; i++) {
    const c = s[i];
    if (VOWELS.has(c) || c === 'u' || c === 'h') continue;
    if (c !== out[out.length - 1]) out += c;
  }
  return out;
}

function edits1(w) {
  const out = new Set();
  for (let i = 0; i <= w.length; i++) {
    const a = w.slice(0, i), b = w.slice(i);
    if (b) out.add(a + b.slice(1));
    if (b.length > 1) out.add(a + b[1] + b[0] + b.slice(2));
    for (const c of ALPHA) {
      if (b) out.add(a + c + b.slice(1));
      out.add(a + c + b);
    }
  }
  out.delete(w);
  return out;
}

const caseLike = (orig, r) => {
  if (!r) return r;
  if (orig.length > 1 && orig === orig.toUpperCase()) return r.toUpperCase();
  if (orig[0] !== orig[0].toLowerCase()) return r[0].toUpperCase() + r.slice(1);
  return r;
};

/* ------------------------------------------------------------------ engine */

export function createEngine(words) {
  const dict = new Set(words);
  const skel = new Map();
  for (const w of dict) {
    if (w.length < 3) continue;
    const k = skeleton(w);
    const a = skel.get(k);
    if (a) a.push(w); else skel.set(k, [w]);
  }
  const sugCache = new Map();
  const segCache = new Map();
  const region = buildRegionMaps(dict);

  // The "brain": proper nouns + dialects + packs + everything the user taught.
  //   low -> {kind, form, note, caps, dialect?}   kind: name|place|brand|acronym|term|slang|prefer|proper
  // Priority (low -> high): built-in proper nouns < packs < dialects < user-taught.
  const base = new Map();
  for (const w of PROPER) if (w.length > 2 && !/^(tamilnadu|srilanka)$/.test(w)) base.set(w, { kind: 'proper', form: titleCase(w), caps: true, note: '' });
  const packs = new Map();
  let userEntries = [];
  const brains = new Map();
  let curBrain = base;
  const norm = (w) => w.toLowerCase().replace(/’/g, "'");
  const putWord = (m, key, e) => { const low = norm(key); if (/^[\p{L}'-]+$/u.test(low)) m.set(low, e); };
  function getBrain(dialects) {
    const key = dialects.join(',');
    let m = brains.get(key);
    if (m) return m;
    m = new Map(base);
    for (const [k, v] of packs) if (!m.has(k)) m.set(k, v);
    for (const id of dialects) {
      const d = DIALECTS[id];
      if (!d) continue;
      for (const w of d.accept) putWord(m, w, { kind: 'term', form: w, note: '', caps: false, dialect: id });
      for (const w of d.proper) for (const part of w.split('-')) putWord(m, part, { kind: 'proper', form: part, note: d.label, caps: true, dialect: id });
      for (const [from, to, note] of d.prefer) putWord(m, from, { kind: 'prefer', form: to, note, caps: false, dialect: id });
    }
    for (const e of userEntries) {
      const words = e.word.trim().split(/\s+/), forms = (e.form || e.word).trim().split(/\s+/);
      const keepCase = ['name', 'place', 'brand', 'acronym', 'proper'].includes(e.kind) || (e.kind !== 'prefer' && /\p{Lu}/u.test(e.form || ''));
      words.forEach((w, i) => putWord(m, w, { kind: e.kind, form: e.kind === 'prefer' ? (e.form || w) : (forms.length === words.length ? forms[i] : titleCase(w.toLowerCase())), note: e.note || '', caps: keepCase }));
    }
    brains.set(key, m);
    return m;
  }
  /** entries: [{word, kind, form?, note?}] user-taught, overrides everything. Clears caches. */
  function setBrain(entries) { userEntries = entries; brains.clear(); segCache.clear(); }
  /** Lazy packs (places, given names): cased lines. Caps enforced only for words that are not ordinary English. */
  function addPack(lines, kind = 'place') {
    for (const line of lines) {
      for (const w of line.trim().split(/\s+/)) {
        const low = w.toLowerCase();
        if (low.length < 2 || base.has(low) || packs.has(low) || !/^\p{Lu}/u.test(w)) continue;
        packs.set(low, { kind, form: w, note: '', caps: !dict.has(low) });
      }
    }
    brains.clear(); segCache.clear();
  }
  /** Optional approved-vocabulary list (for STE mode). */
  let approved = null;
  function setApproved(words) { approved = words && words.length ? new Set(words.map((w) => w.toLowerCase())) : null; segCache.clear(); }

  const isKnown = (low) => {
    if (dict.has(low)) return true;
    if (!low.includes("'")) return false;
    if (KNOWN_CONTRACTIONS.has(low)) return true;
    const i = low.lastIndexOf("'");
    const base = low.slice(0, i), suf = low.slice(i + 1);
    if (suf === 't') return base.endsWith('n') && dict.has(base.slice(0, -1));
    if (['s', 're', 've', 'll', 'd', 'm'].includes(suf)) return dict.has(base) || /^(i|he|she|it|we|they|you|that|who|what|there|here|where|let)$/.test(base);
    return false;
  };

  // Productivity: common words sprout many inflections that also exist in the
  // dictionary (happen -> happens/happened/happening); obscure words rarely do.
  // A frequency-free commonness signal derived from the dictionary itself.
  const SUFFIXES = ['s', 'es', 'ed', 'd', 'ing', 'er', 'ly', 'ness', 'ment', 'al'];
  function productivity(w) {
    let n = 0;
    for (const s of SUFFIXES) if (dict.has(w + s) || (w.endsWith('e') && s === 'ing' && dict.has(w.slice(0, -1) + 'ing'))) n++;
    return Math.min(n, 5);
  }

  // Skeleton-Rank suggestion pipeline. Returns [{w, score}] best first.
  function suggest(low) {
    if (low.length > 30 || low.length < 1) return [];
    if (sugCache.has(low)) return sugCache.get(low);
    const cands = new Map();
    const e1 = edits1(low);
    for (const c of e1) if (dict.has(c)) cands.set(c, true);
    const bucket = skel.get(skeleton(low));
    if (bucket && bucket.length < 400) {
      for (const c of bucket) if (Math.abs(c.length - low.length) <= 3) cands.set(c, true);
    }
    if (cands.size === 0 && low.length >= 4 && low.length <= 12) {
      for (const x of e1) for (const c of edits1(x)) if (dict.has(c)) cands.set(c, true);
    }
    for (let i = 1; i <= low.length - 2; i++) {
      const a = low.slice(0, i), b = low.slice(i);
      if ((a.length > 1 || a === 'a' || a === 'i') && dict.has(a) && dict.has(b) && (COMMON.has(a) || COMMON.has(b))) cands.set(a + ' ' + b, true);
    }
    const scored = [];
    for (const c of cands.keys()) {
      const joined = c.includes(' ');
      const dist = joined ? .8 + weightedDistance(c.replace(' ', ''), low) : weightedDistance(c, low);
      if (dist > 2.2) continue;
      let score = 10 - dist * 3.2;
      if (c[0] === low[0]) score += 1.5;
      if (COMMON.has(c)) score += 1.8;
      if (!joined && c.length === low.length && [...c].sort().join('') === [...low].sort().join('')) score += 1;
      if (!joined) score += productivity(c) * .55;
      score -= Math.abs(c.length - low.length) * .2;
      scored.push({ w: c, score: +score.toFixed(3) });
    }
    scored.sort((x, y) => y.score - x.score);
    const out = scored.slice(0, 6);
    if (sugCache.size > 20000) sugCache.clear();
    sugCache.set(low, out);
    return out;
  }

  /* --- per-segment analysis --- */
  function analyse(seg, cfg0) {
    const text = seg.text;
    const { toks, masked } = tokenize(text);
    // code-mix guard: a line mixing romanised Hindi with English is not full of typos
    const cfg = cfg0.slang ? { ...cfg0, codeMix: toks.reduce((n, t) => n + (t.kind === 'w' && (HINGLISH.has(t.low) || (curBrain.get(t.low) || {}).dialect) ? 1 : 0), 0) >= 2 } : cfg0;
    markSentences(toks, seg.cont);
    const issues = [];
    const inMask = (pos) => masked.some(([a, b]) => pos >= a && pos < b);
    const add = (s, e, rule, type, p, message, fixes, extra) => {
      if (rule === 'REPEAT_PUNCT' && !cfg.repeatPunct) return;
      issues.push({ start: s, end: e, rule, type, p, message, fixes: fixes || [], text: text.slice(s, e), ...extra });
    };

    const nW = toks.filter((t) => t.kind === 'w').length;
    let sentences = toks.filter((t) => t.endsSentence).length;
    if (toks.length && !toks[toks.length - 1].endsSentence) sentences++;
    let syll = 0;
    for (const t of toks) if (t.kind === 'w') syll += syllables(t.low);

    // Tag-Lattice: attach tags once.
    for (const t of toks) t.tags = t.kind === 'w' ? tagsOf(t.low) : [];

    // Pattern rules
    for (let i = 0; i < toks.length; i++) {
      for (const { r, els } of COMPILED) {
        if (i + els.length > toks.length) continue;
        let ok = true;
        for (let j = 0; j < els.length && ok; j++) ok = toks[i + j].kind === 'w' && els[j](toks[i + j]);
        if (!ok) continue;
        const m = toks.slice(i, i + els.length);
        const [a, b] = r.span || [0, els.length - 1];
        const s = m[a].s, e = m[b].e;
        const rep = typeof r.fix === 'function' ? r.fix(m) : r.fix;
        if (rep === undefined) continue;
        add(s, e, r.id, r.type, r.p, r.msg, [caseLike(text.slice(s, s + 1) + '', rep)]);
      }
    }

    for (let i = 0; i < toks.length; i++) {
      const k = toks[i], nx = toks[i + 1];
      if (k.kind !== 'w') continue;

      // missing-apostrophe contractions
      if (CONTRACTIONS[k.low]) {
        const c = CONTRACTIONS[k.low];
          add(k.s, k.e, 'CONTRACTION', 'spelling', .95, `Missing apostrophe: "${c}".`, [caseLike(k.t, c)]);
          k.flagged = true;
          continue;
      }

      // i.e. / e.g. / abbreviations are not words
      if (nx && nx.t === '.' && nx.s === k.e) {
        const n2 = toks[i + 2];
        if ((k.t.length === 1 && n2 && n2.t.length === 1 && n2.s === nx.e) || ABBR.has(k.low)) continue;
      }

      // the brain: user-taught words and proper nouns (taught entries override everything)
      const br = curBrain.get(k.low);
      if (br) {
        if (br.kind === 'prefer') {
          const same = k.low === br.form.toLowerCase();
          const fix = same ? br.form : caseLike(k.t, br.form);
          if (!same || (k.t !== br.form && !(k.sentStart && k.t === br.form[0].toUpperCase() + br.form.slice(1)))) add(k.s, k.e, 'TAUGHT_PREFER', 'grammar', .92, `Preferred spelling: "${fix}"${br.note ? ' (' + br.note + ')' : ''}.`, [fix]);
        } else if (br.caps && cfg.capital && k.t !== br.form && !(k.t.length > 1 && k.t === k.t.toUpperCase()) && !(k.sentStart && k.t === br.form[0].toUpperCase() + br.form.slice(1))) {
          add(k.s, k.e, 'TAUGHT_CAP', 'grammar', br.kind === 'proper' ? .9 : .95, `Write "${br.form}", ${br.kind === 'proper' ? 'proper noun' : br.kind}${br.note ? ': ' + br.note : ''}.`, [br.form]);
        }
        continue;
      }

      // regional spelling (en-US / en-GB / en-IN)
      if (!/^\p{Lu}/u.test(k.t) || k.sentStart) {
        const uk = region.us2uk.get(k.low), us = region.uk2us.get(k.low), nm = cfg.region === 'en-IN' ? 'Indian' : 'British';
        if (cfg.region === 'en-US' && us) add(k.s, k.e, 'REGION_SPELLING', 'spelling', .88, `British spelling, American English uses "${us}".`, [caseLike(k.t, us)]);
        else if (cfg.region !== 'en-US' && uk) {
          const ox = region.oxford.has(k.low);
          add(k.s, k.e, 'REGION_SPELLING', 'spelling', ox ? .4 : .88, ox ? `"-ize" is valid Oxford spelling; "${uk}" is more common in ${nm} English.` : `American spelling, ${nm} English uses "${uk}".`, [caseLike(k.t, uk)], ox ? { hint: true } : {});
        }
      }

      // informal contractions/slang: flagged as tone in formal modes, silently accepted otherwise
      if (INFORMAL[k.low] !== undefined) {
        if (cfg.informal) add(k.s, k.e, 'INFORMAL', 'style', .7, `Informal: "${k.t}", use "${INFORMAL[k.low]}" in ${cfg.mode} writing.`, [caseLike(k.t, INFORMAL[k.low])]);
        if (cfg.slang || cfg.informal) continue;
      }

      // lone "i"
      if (k.low === 'i' || /^i'(m|ve|ll|d)$/.test(k.low)) {
        if (cfg.capI && k.t[0] === 'i') add(k.s, k.e, 'PRONOUN_I', 'grammar', .99, 'Capitalise "I".', ['I' + k.t.slice(1)]);
        continue;
      }

      // sentence-initial capital
      if (cfg.capital && k.sentStart && /^\p{Ll}/u.test(k.t) && !/\p{Lu}/u.test(k.t.slice(1))) {
        add(k.s, k.s + 1, 'CAPITAL', 'grammar', .97, 'Start the sentence with a capital letter.', [k.t[0].toUpperCase()]);
      }

      // repeated word
      if (nx && nx.kind === 'w' && nx.low === k.low && !['had', 'that', 'is'].includes(k.low) && k.e < nx.s && /^\s+$/.test(text.slice(k.e, nx.s))) {
        add(k.e, nx.e, 'REPEAT', 'grammar', .93, `Repeated word "${k.t}".`, ['']);
      }

      // a / an
      if ((k.low === 'a' || k.low === 'an') && nx && nx.kind === 'w' && !/^\p{Lu}{2,}$/u.test(nx.t) && /^\s+$/.test(text.slice(k.e, nx.s))) {
        const need = vowelSound(nx.low) ? 'an' : 'a';
        if (need !== k.low) add(k.s, k.e, 'A_AN', 'grammar', .88, `Use "${need}" before "${nx.t}".`, [caseLike(k.t, need)]);
      }

      // double negative
      if (k.low.endsWith("n't") || k.low === 'never') {
        for (const j of [i + 1, i + 2]) {
          const t = toks[j];
          if (!t) break;
          const map = { no: 'any', nothing: 'anything', nobody: 'anybody', nowhere: 'anywhere' };
          if (map[t.low]) { add(t.s, t.e, 'DOUBLE_NEG', 'grammar', .75, 'Double negative.', [caseLike(t.t, map[t.low])]); break; }
        }
      }

      // Skeleton-Rank spelling
      if (!k.flagged && k.kind === 'w') spell(k, add, cfg);

      // style: weak intensifiers (tech writing: also words that talk down to the reader)
      const weak = cfg.weak && WEAK.has(k.low);
      const talkDown = cfg.condescend && CONDESCEND.has(k.low);
      if (weak || talkDown) {
        const end = text[k.e] === ' ' ? k.e + 1 : k.e;
        add(k.s, end, talkDown ? 'CONDESCEND' : 'WEAK_WORD', 'style', talkDown ? .5 : .45,
          talkDown ? `"${k.t}" can sound condescending in documentation, readers decide what is easy.` : `"${k.t}" is a weak intensifier, consider cutting it.`, [''], { hint: true });
      }
      // ASD-STE100: modal verbs, perfect and progressive tenses (Tag-Lattice patterns)
      if (cfg.ste) {
        if (STE_MODALS.has(k.low)) add(k.s, k.e, 'STE_MODAL', 'style', .6, `STE: avoid "${k.t}". Use "must" (rule), "can" (ability) or "will" (future).`, [], { hint: true });
        let j = i + 1;
        if (toks[j] && toks[j].tags.includes('ADV')) j++;
        const nxt = toks[j];
        if (nxt && nxt.kind === 'w') {
          if (k.tags.includes('HAVE') && nxt.tags.includes('VBN') && !k.low.endsWith("n't")) add(k.s, nxt.e, 'STE_TENSE', 'style', .55, 'STE: use the simple past or simple present, not a perfect tense.', [], { hint: true });
          if (k.tags.includes('BE') && nxt.tags.includes('VBG')) add(k.s, nxt.e, 'STE_TENSE', 'style', .55, 'STE: use the simple present or simple past, not a continuous form.', [], { hint: true });
        }
        if (approved && k.t.length > 2 && !curBrain.has(k.low) && !(/^\p{Lu}/u.test(k.t) && !k.sentStart) && !approved.has(k.low) && !approved.has(k.low.replace(/(ies|es|s|ed|ing|d|ly)$/, '')) && isKnown(k.low)) {
          add(k.s, k.e, 'STE_VOCAB', 'style', .4, `"${k.t}" is not in your approved STE vocabulary.`, [], { hint: true });
        }
      }

      // style: passive via tags
      if (cfg.passive && k.tags.includes('BE')) {
        let j = i + 1;
        if (toks[j] && toks[j].tags.includes('ADV')) j++;
        if (toks[j] && toks[j].kind === 'w' && toks[j].tags.includes('VBN') && !toks[j].tags.includes('VBG')) {
          add(k.s, toks[j].e, 'PASSIVE', 'style', .4, 'Possible passive voice, active voice is usually clearer.', [], { hint: true });
        }
      }
    }

    // wordy phrases
    {
      const low = text.toLowerCase();
      const phrases = [
        ...MALAPROPS.map(([a, b]) => [a, b, 'MALAPROP', 'grammar', .9, `Common slip: "${a}" → "${b}".`]),
        ...(cfg.wordy ? WORDY.map(([a, b]) => [a, b, 'WORDY', 'style', .6, `Wordy: "${a}" → "${b || '(cut)'}".`]) : []),
        ...(cfg.buzz ? BUZZ.map(([a, b]) => [a, b, 'BUZZ', 'style', .6, `Plainer: "${a}" → "${b || '(cut)'}".`]) : []),
        ...(cfg.ste ? STE_WORDS.map(([a, b]) => [a, b, 'STE_WORD', 'style', .6, `STE: use "${b}" instead of "${a}".`]) : []),
        ...(cfg.region === 'en-IN' && cfg.buzz ? IN_IDIOMS.map(([a, b]) => [a, b, 'IN_IDIOM', 'style', .5, `Common in Indian English; global readers may prefer "${b}".`]) : []),
      ];
      for (const [ph, rep, rule, type, p, msg] of phrases) {
        let idx = -1;
        while ((idx = low.indexOf(ph, idx + 1)) !== -1) {
          const b = low[idx - 1], a = low[idx + ph.length];
          if ((b && /\p{L}/u.test(b)) || (a && /\p{L}/u.test(a)) || inMask(idx)) continue;
          add(idx, idx + ph.length, rule, type, p, msg, [caseLike(text[idx], rep)], type === 'style' ? { hint: true } : {});
        }
      }
    }
    const lsLimit = cfg.ste && /^\s*(\d+[.)]|[-*\u2022])\s/.test(text) ? 20 : cfg.longSent;
    if (lsLimit) {
      let count = 0, startTok = null;
      for (const t of toks) {
        if (t.kind === 'w') { if (!startTok) startTok = t; count++; }
        if (t.endsSentence) {
          if (count > lsLimit) add(startTok.s, t.e, 'LONG_SENT', 'style', .5, `Long sentence (${count} words), consider splitting.`, [], { hint: true });
          count = 0; startTok = null;
        }
      }
    }

    // punctuation (raw text)
    const punct = (re, fn) => {
      for (const m of text.matchAll(re)) if (!inMask(m.index) && !inMask(m.index + m[0].length)) fn(m);
    };
    if (cfg.emDash) punct(/\s*—\s*|\s+–\s+/g, (m) => add(m.index, m.index + m[0].length, 'EM_DASH', 'punct', .85, 'Avoid dashes as punctuation. Use a comma, a colon, or a full stop.', [', ', ': ', '. ']));
    if (cfg.ste) punct(/;/g, (m) => add(m.index, m.index + 1, 'STE_SEMICOLON', 'style', .6, 'STE: write two short sentences instead of using a semicolon.', ['.'], { hint: true }));
    if (cfg.exclaim) punct(/!(?!!)/g, (m) => add(m.index, m.index + 1, 'EXCLAIM', 'style', .35, 'Exclamation marks can read as unprofessional here.', ['.'], { hint: true }));
    punct(/(?<=\S)[ \t]+(?=[,;:!?](?!\.)|\.(?!\.))/g, (m) => add(m.index, m.index + m[0].length, 'SPACE_BEFORE_PUNCT', 'punct', .85, 'No space before punctuation.', ['']));
    punct(/(?<=\p{L}),(?=\p{L})/gu, (m) => add(m.index, m.index + 1, 'SPACE_AFTER_COMMA', 'punct', .93, 'Add a space after the comma.', [', ']));
    punct(/(?<=\p{Ll}{2})\.(?=\p{Lu}\p{Ll})/gu, (m) => add(m.index, m.index + 1, 'SPACE_AFTER_PERIOD', 'punct', .8, 'Add a space after the period.', ['. ']));
    punct(/(?<=\S)[ ]{2,}(?=\S)/g, (m) => add(m.index, m.index + m[0].length, 'DOUBLE_SPACE', 'punct', .9, 'Extra spaces.', [' ']));
    punct(/,{2,}|;{2,}|!{2,}|\?{2,}|(?<!\.)\.\.(?!\.)/g, (m) => add(m.index, m.index + m[0].length, 'REPEAT_PUNCT', 'punct', .88, 'Repeated punctuation.', [m[0][0] === '.' ? '.' : m[0][0]]));

    if (cfg.ste && sentences > 6) { const f = toks.find((t) => t.kind === 'w'); if (f) add(f.s, f.e, 'STE_PARA', 'style', .5, `STE: keep paragraphs to 6 sentences or fewer (this has ${sentences}).`, [], { hint: true }); }
    return { issues, counts: { words: nW, sentences: Math.max(sentences, nW ? 1 : 0), syll } };
  }

  function spell(k, add, cfg) {
    const t = k.t;
    if (t.length < 2 || /[^\x00-\x7f]/.test(t)) return;
    if (/^\p{Lu}/u.test(t) && !k.sentStart) return;           // proper noun
    if (t.length > 1 && t === t.toUpperCase()) return;         // acronym
    if (/\p{Lu}/u.test(t.slice(1))) return;                    // camelCase / McX
    if (isKnown(k.low)) return;
    if (MODERN.has(k.low)) return;
    if (cfg.region === 'en-IN' && INDIAN_ACCEPT.has(k.low)) return;
    if (cfg.slang && (SLANG.has(k.low) || HINGLISH.has(k.low))) return;
    if (cfg.codeMix) return;
    // stretched words: "soooo", "heyyyy", "nooo", normal in chat, a typo in a report
    if (/(.)\1{2,}/.test(k.low)) {
      const one = k.low.replace(/(.)\1+/g, '$1'), two = k.low.replace(/(.)\1{2,}/g, '$1$1');
      const base = [two, one].find((c) => isKnown(c) || SLANG.has(c) || MODERN.has(c));
      if (base) {
        if (cfg.slang) return;
        add(k.s, k.e, 'STRETCHED', 'spelling', .9, `Stretched spelling "${t}", fine in chat, not in ${cfg.mode} writing.`, [caseLike(t, base)]);
        return;
      }
    }
    if (cfg.tech && TECH.has(k.low)) return;
    if (/'$|^'/.test(k.low)) return;
    const c = suggest(k.low.replace(/'.*$/, ''));
    add(k.s, k.e, 'SPELLING', 'spelling', .99, `Unknown word "${t}".`, c.map((x) => caseLike(t, x.w)), { cands: c.map((x) => ({ w: x.w, score: x.score })) });
  }

  // ---- hardened, resumable check -------------------------------------------
  // iterate(): generator yielding {issues, done, pos} slices of ~sliceChars each.
  // The worker awaits between slices so a 5 MB paste never freezes anything and a
  // newer request can cancel the old one. Every segment is isolated: a bug or a
  // pathological input in one paragraph costs that paragraph, never the session.
  const LIMITS = { maxIssuesPerSeg: 400, maxIssues: 60000, cacheChars: 12e6 };
  let cacheChars = 0;
  function* iterate(input, opts = {}, sliceChars = 60000) {
    const text = typeof input === 'string' ? input : String(input ?? '');
    const cfg = modeCfg(opts);
    const ck = cfg.mode + cfg.region + cfg.dialects.join() + (approved ? 'A' : '') + (opts.style === false ? '0' : '1');
    const myBrain = getBrain(cfg.dialects);
    const tot = { words: 0, sentences: 0, syll: 0 };
    const meta = { errors: 0, truncated: false, dropped: 0 };
    let total = 0, inFence = false, sinceYield = 0, batch = [];
    for (const seg of segments(text)) {
      if (/^\s*```/.test(seg.text)) { inFence = !inFence; continue; }
      if (inFence) continue;
      const key = ck + (seg.cont ? 'c' : 'n') + seg.text;
      let res = segCache.get(key);
      if (!res) {
        try {
          curBrain = myBrain;
          res = analyse(seg, cfg);
          if (res.issues.length > LIMITS.maxIssuesPerSeg) { res.issues.length = LIMITS.maxIssuesPerSeg; meta.truncated = true; }
        } catch (err) {
          meta.errors++;
          res = { issues: [], counts: { words: 0, sentences: 0, syll: 0 }, failed: String(err && err.message || err) };
        }
        cacheChars += seg.text.length;
        segCache.set(key, res);
        while (cacheChars > LIMITS.cacheChars && segCache.size) {   // bound memory by characters, oldest first
          const k0 = segCache.keys().next().value;
          cacheChars -= Math.max(0, k0.length - ck.length - 1);
          segCache.delete(k0);
        }
      } else if (res.failed) meta.errors++;
      for (const i of res.issues) {
        const s = i.start + seg.offset, e = i.end + seg.offset;
        // validity gate: an issue must point at real text and be consistent with it
        if (!(s >= 0 && e > s && e <= text.length) || text.slice(s, e) !== i.text) { meta.dropped++; continue; }
        if (total >= LIMITS.maxIssues) { meta.truncated = true; continue; }
        batch.push({ ...i, start: s, end: e }); total++;
      }
      tot.words += res.counts.words; tot.sentences += res.counts.sentences; tot.syll += res.counts.syll;
      sinceYield += seg.text.length;
      if (sinceYield >= sliceChars) { yield { issues: batch, done: false, pos: seg.offset + seg.text.length, len: text.length }; batch = []; sinceYield = 0; }
    }
    yield { issues: batch, done: true, pos: text.length, len: text.length, stats: summarize(tot, text), meta };
  }

  function check(text, opts = {}) {
    const issues = [];
    let last;
    for (const part of iterate(text, opts, Infinity)) { for (const i of part.issues) issues.push(i); last = part; }
    return { issues, stats: last.stats, meta: last.meta };
  }

  function clearCache() { segCache.clear(); sugCache.clear(); cacheChars = 0; }

  return { check, iterate, suggest, isKnown, analyse, setBrain, addPack, clearCache, size: dict.size, regionPairs: region.us2uk.size, brainSize: () => curBrain.size, setApproved, dialects: Object.keys(DIALECTS) };
}

/* ----------------------------------------------------------------- helpers */

const COMPILED = PATTERN_RULES.concat(EXTRA_PATTERNS).map((r) => ({ r, els: r.m.map(compileEl) }));
const FORMS = { usa: 'USA', whatsapp: 'WhatsApp', youtube: 'YouTube', linkedin: 'LinkedIn', github: 'GitHub', openai: 'OpenAI', tiktok: 'TikTok', gurugram: 'Gurugram' };
const titleCase = (w) => FORMS[w] || w[0].toUpperCase() + w.slice(1);

function compileEl(spec) {
  if (spec[0] === '#') { const tag = spec.slice(1); return (t) => t.tags.includes(tag); }
  const set = new Set(spec.split('|'));
  return (t) => set.has(t.low);
}

function vowelSound(w) {
  if (/^(hour|honest|honou?r|heir|herb)/.test(w)) return true;
  if (/^(uni([^nm]|$)|use|usa|usu|uti|uter|eu|euro|one|once|ubi|ura|ure|uri|uro|uk)/.test(w)) return false;
  return /^[aeiou]/.test(w);
}

export function syllables(w) {
  w = w.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  let n = (w.match(/[aeiouy]+/g) || []).length;
  if (n > 1 && /e$/.test(w) && !/le$/.test(w)) n--;
  return Math.max(1, n);
}

function summarize(t, text) {
  const wps = t.sentences ? t.words / t.sentences : 0;
  const spw = t.words ? t.syll / t.words : 0;
  const flesch = t.words ? Math.max(0, Math.min(100, 206.835 - 1.015 * wps - 84.6 * spw)) : 0;
  return { words: t.words, chars: text.length, sentences: t.sentences, flesch: Math.round(flesch), minutes: Math.max(t.words ? 1 : 0, Math.round(t.words / 230)) };
}

function* segments(text) {
  const n = text.length;
  let pos = 0;
  while (pos <= n) {
    let nl = text.indexOf('\n', pos);
    if (nl < 0) nl = n;
    let s = pos, cont = false;
    while (nl - s > MAXSEG) {
      let cut = -1;
      for (let i = s + MAXSEG; i > s + MAXSEG / 2; i--) if (/[.!?]/.test(text[i - 1]) && /\s/.test(text[i])) { cut = i; break; }
      let mid = false;
      if (cut < 0) { cut = text.lastIndexOf(' ', s + MAXSEG); mid = true; if (cut <= s) cut = s + MAXSEG; }
      yield { text: text.slice(s, cut), offset: s, cont };
      cont = mid; s = cut;
    }
    if (nl > s) yield { text: text.slice(s, nl), offset: s, cont };
    pos = nl + 1;
  }
}
