// Security, privacy, SEO and content gate. Run: node tests/security.mjs
// Fails the build if any rule is broken. Works with the strict default AND after
// `tools/configure.mjs --ga` (then only the allow-listed Google hosts may appear).
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const rd = (f) => readFileSync(root + f, 'utf8');
let fails = 0, checks = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log('  FAIL: ' + msg); } };
const section = (t) => console.log(t);

const jsFiles = readdirSync(root + 'js').filter((f) => f.endsWith('.js')).map((f) => 'js/' + f).concat('sw.js');
const html = rd('index.html'), headers = rd('_headers'), config = rd('js/config.js');
const GA = /GA_ID = '(G-[A-Z0-9]+)'/.exec(config)?.[1] || '';
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');

section('code: dangerous sinks');
const SINKS = [/\.innerHTML\s*=/, /\.outerHTML\s*=/, /insertAdjacentHTML/, /document\.write/, /\beval\s*\(/, /new\s+Function\s*\(/, /setTimeout\s*\(\s*['"`]/, /setInterval\s*\(\s*['"`]/, /importScripts/, /\.srcdoc/, /dangerouslySetInnerHTML/, /\.insertAdjacentText\s*\(\s*['"]beforebegin/];
for (const f of jsFiles) { const src = stripComments(rd(f)); for (const re of SINKS) ok(!re.test(src), `${f} uses forbidden sink ${re}`); }

section('html: no inline script, style or handlers');
const noJson = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '');
ok(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(noJson), 'inline <script> found');
ok(!/\sstyle\s*=/i.test(html), 'inline style attribute found');
ok(!/\son[a-z]+\s*=/i.test(noJson), 'inline event handler found');
ok(!/<iframe|<object|<embed/i.test(html), 'iframe/object/embed found');
ok((html.match(/<form[^>]*>/g) || []).every((f) => /method="dialog"/.test(f)), 'only <form method="dialog"> is allowed');
ok(!/javascript:/i.test(html), 'javascript: URL found');

section('csp');
const meta = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html)?.[1] || '';
const hdr = /Content-Security-Policy: (.*)/.exec(headers)?.[1] || '';
const dir = (csp, d) => (new RegExp(`(?:^|; )${d} ([^;]*)`).exec(csp) || [])[1] || '';
for (const [name, csp] of [['meta', meta], ['_headers', hdr]]) {
  ok(csp.length > 50, `${name}: CSP missing`);
  ok(dir(csp, 'default-src') === "'none'", `${name}: default-src must be 'none'`);
  ok(!/unsafe-inline|unsafe-eval|unsafe-hashes|\s\*(\s|;|$)|data:(?!.*img)/.test(csp.replace(/img-src [^;]*/, '')), `${name}: unsafe CSP source`);
  ok(dir(csp, 'object-src') === "'none'" && dir(csp, 'base-uri') === "'none'" && dir(csp, 'form-action') === "'none'", `${name}: object/base/form`);
  ok(csp.includes("require-trusted-types-for 'script'"), `${name}: Trusted Types not enforced`);
  ok(dir(csp, 'style-src') === "'self'" && dir(csp, 'font-src') === "'self'" && dir(csp, 'worker-src') === "'self'", `${name}: style/font/worker must be 'self'`);
  const allowed = GA ? /^('self'|https:\/\/www\.googletagmanager\.com|https:\/\/\*\.google-analytics\.com|https:\/\/\*\.analytics\.google\.com|data:)$/ : /^('self'|data:)$/;
  for (const d of ['script-src', 'connect-src', 'img-src']) for (const src of dir(csp, d).split(' ').filter(Boolean)) ok(allowed.test(src), `${name}: ${d} allows ${src}${GA ? '' : ' (analytics is off)'}`);
  if (!GA) ok(dir(csp, 'connect-src') === "'self'", `${name}: connect-src must be only 'self' when analytics is off`);
}
ok(/frame-ancestors 'none'/.test(hdr), '_headers: frame-ancestors none');
ok(dir(meta, 'script-src') === dir(hdr, 'script-src') && dir(meta, 'connect-src') === dir(hdr, 'connect-src'), 'meta CSP and _headers CSP disagree');
for (const h of ['X-Content-Type-Options: nosniff', 'Referrer-Policy: no-referrer', 'Strict-Transport-Security', 'Cross-Origin-Opener-Policy: same-origin', 'Permissions-Policy']) ok(headers.includes(h), `_headers missing ${h}`);

section('privacy: no network beyond same origin');
const URLS = /https?:\/\/[^\s"'`)<>]+/g;
const OK_URL = [/^https:\/\/github\.com\/konkomaji\/plainpen$/, /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/, /^https:\/\/buymeacoffee\.com\/konko$/, /^https:\/\/github\.com\/konkomaji$/, /^https:\/\/www\.instagram\.com\/whereiskonko\/$/, /^https:\/\/www\.linkedin\.com\/in\/konkomaji$/, /^https:\/\/x\.com\/konkomaji$/, /^https:\/\/konkomaji\.com\/?$/, /^https:\/\/plainpen\.example/, /^https:\/\/konkomaji\.com\/plainpen\//,/^http:\/\/www\.w3\.org\/2000\/svg/, /^https:\/\/schema\.org/, /^http:\/\/www\.sitemaps\.org/, /^https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=/, /^https:\/\/\*\.(google-analytics|analytics\.google)\.com/, /^https:\/\/www\.googletagmanager\.com/, /^https?:\/\/(localhost|127\.0\.0\.1)/];
const siteFiles = ['index.html', 'style.css', 'design/tokens.css', 'manifest.webmanifest', 'robots.txt', 'sitemap.xml', 'llms.txt', 'icon.svg', 'og.svg', ...jsFiles];
for (const f of siteFiles) {
  const text = f.endsWith('.js') ? stripComments(rd(f)) : rd(f);
  for (const u of text.match(URLS) || []) {
    if (/googletagmanager|google-analytics|analytics\.google/.test(u) && !GA && f !== 'js/analytics.js') ok(false, `${f}: Google URL present but analytics is off: ${u}`);
    else ok(OK_URL.some((re) => re.test(u)), `${f}: unexpected external URL ${u}`);
  }
  ok(!/\bfetch\s*\(\s*['"`]https?:/.test(text) && !/XMLHttpRequest|sendBeacon|WebSocket|EventSource/.test(text), `${f}: network API to a foreign origin`);
}
ok(!/localStorage\.setItem\([^)]*(text|draft|editor)/i.test(rd('js/app.js')), 'plain-text storage of user text');
ok(!/document\.cookie/.test(jsFiles.map(rd).join('\n')), 'cookies used');
if (!GA) ok(!/googletagmanager|google-analytics/.test(rd('js/app.js') + rd('js/config.js') + html), 'analytics code path present while GA_ID is empty');

section('external links are safe');
for (const m of html.matchAll(/<a [^>]*href="https?:[^>]*>/g)) ok(/rel="[^"]*noopener[^"]*noreferrer[^"]*"/.test(m[0]) || /rel="[^"]*noreferrer[^"]*noopener[^"]*"/.test(m[0]), 'external link without noopener noreferrer: ' + m[0].slice(0, 80));
for (const f of ['icons/bmc-logo.svg', 'icons/bmc-button.svg']) { const t = rd(f); ok(!/<script|<foreignObject|\son\w+=|href="https?:|javascript:/i.test(t), f + ' must be an inert SVG'); }

section('legal pages');
for (const f of ['privacy.html', 'terms.html']) {
  ok(existsSync(root + f), `${f} missing`);
  const p = rd(f);
  ok((/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(p) || [])[1] === meta, `${f}: CSP differs from index.html`);
  ok(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(p) && !/\sstyle\s*=/i.test(p) && !/\son[a-z]+\s*=/i.test(p) && !/<iframe|<object|<embed|<form/i.test(p), `${f}: inline code or forbidden element`);
  ok((p.match(/<h1[\s>]/g) || []).length === 1 && /<title>[^<]{8,62}<\/title>/.test(p) && /rel="canonical"/.test(p) && /name="description" content="[^"]{60,165}"/.test(p), `${f}: SEO basics`);
  ok(!/[—–]/.test(p), `${f}: em dash or en dash`);
  ok(p.includes('mailto:hello@konkomaji.com'), `${f}: contact email missing`);
  for (const m of p.matchAll(/<a [^>]*href="https?:[^>]*>/g)) ok(/rel="[^"]*noopener[^"]*"/.test(m[0]) && /noreferrer/.test(m[0]), `${f}: external link without noopener noreferrer`);
  for (const u of p.match(/https?:\/\/[^\s"'`)<>]+/g) || []) ok(OK_URL.some((re) => re.test(u)), `${f}: unexpected external URL ${u}`);
}
ok(/href="privacy\.html"/.test(html) && /href="terms\.html"/.test(html) && /mailto:hello@konkomaji\.com/.test(html), 'footer must link Privacy, Terms and Contact');

section('crypto + storage');
const st = rd('js/store.js');
ok(/name: 'AES-GCM', length: 256\s*\}, false/.test(st), 'storage key must be AES-GCM 256 and non-extractable');
ok(/getRandomValues\(new Uint8Array\(12\)\)/.test(st), 'random 96-bit IV per write');
ok(/PBKDF2/.test(st) && /ITER = 600000/.test(st), 'PBKDF2 600k for backups');
ok(!/Math\.random/.test(st + rd('js/profile.js')), 'Math.random in security code');
ok(/Object\.hasOwn/.test(rd('js/profile.js')) && /BAD_KEYS/.test(rd('js/profile.js')), 'prototype-pollution guard');

section('data integrity');
const words = rd('data/words.txt').split('\n').filter(Boolean);
ok(words.length > 200000 && words.every((w) => /^[a-z]+$/.test(w)), 'dictionary must be plain lowercase words only');
for (const f of ['fonts/poppins-latin-400-normal.woff2', 'fonts/poppins-latin-600-normal.woff2', 'fonts/OFL-LICENSE.txt', 'fonts/caveat-latin-600-normal.woff2', 'fonts/OFL-LICENSE-Caveat.txt']) ok(existsSync(root + f), `${f} missing`);
const core = /const CORE = \[([\s\S]*?)\];/.exec(rd('sw.js'))[1].match(/'[^']+'/g).map((s) => s.slice(1, -1));
for (const f of core) ok(f === './' || (existsSync(root + f) && statSync(root + f).isFile()), `service worker caches missing file ${f}`);

section('pwa: installable in Chrome');
const mf = JSON.parse(rd('manifest.webmanifest'));
ok(mf.name && mf.short_name && mf.start_url && mf.scope && mf.display === 'standalone' && mf.id, 'manifest core fields');
const iconOk = (sz, purpose) => mf.icons.some((i) => i.sizes === sz && i.type === 'image/png' && (i.purpose || 'any').includes(purpose) && existsSync(root + i.src));
ok(iconOk('192x192', 'any') && iconOk('512x512', 'any') && iconOk('512x512', 'maskable'), 'manifest needs 192 and 512 PNG icons plus a maskable one');
for (const i of mf.icons) ok(existsSync(root + i.src), 'manifest icon missing ' + i.src);
const pngHead = (f) => readFileSync(root + f).subarray(0, 8).toString('hex');
ok(['icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'].every((f) => pngHead(f) === '89504e470d0a1a0a'), 'icons are valid PNGs');
ok(/addEventListener\('fetch'/.test(rd('sw.js')), 'service worker needs a fetch handler');
ok(/rel="manifest"/.test(html) && /rel="apple-touch-icon"/.test(html) && /name="theme-color"/.test(html) && /viewport-fit=cover/.test(html), 'manifest/apple-touch-icon/theme-color/viewport-fit');
ok(mf.share_target && mf.share_target.method === 'POST' && /share-target/.test(rd('sw.js')), 'share target must be POST and handled in the service worker (never GET: text would reach server logs)');

section('content: no em dashes, SEO, AEO, GEO');
for (const f of ['index.html', 'llms.txt', 'manifest.webmanifest', 'README.md', 'SECURITY.md', 'BUILD-LOG.md', 'design/DESIGN.md', 'robots.txt']) {
  if (existsSync(root + f)) ok(!/[—–]/.test(rd(f)), `${f} contains an em dash or en dash`);
}
for (const f of jsFiles) { const bad = rd(f).split('\n').filter((l) => /—/.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l) && !/EM_DASH/.test(l)); ok(bad.length === 0, `${f}: em dash in user-facing text: ${bad[0]?.trim().slice(0, 80)}`); }
const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] || '';
const desc = /<meta name="description" content="([^"]*)"/.exec(html)?.[1] || '';
ok(title.length > 10 && title.length <= 62, `title length ${title.length}`);
ok(desc.length >= 80 && desc.length <= 165, `meta description length ${desc.length}`);
ok((html.match(/<h1[\s>]/g) || []).length === 1, 'exactly one h1');
ok(/<html lang="en"/.test(html) && /name="viewport"/.test(html) && /rel="canonical"/.test(html) && /name="robots"/.test(html), 'lang/viewport/canonical/robots');
ok(/property="og:title"/.test(html) && /property="og:description"/.test(html) && /name="twitter:card"/.test(html), 'Open Graph + Twitter tags');
const ld = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1];
let graph = []; try { graph = JSON.parse(ld)['@graph']; ok(true, 'JSON-LD parses'); } catch { ok(false, 'JSON-LD does not parse'); }
const types = graph.map((g) => g['@type']);
ok(['WebApplication', 'FAQPage', 'HowTo'].every((t) => types.includes(t)), 'JSON-LD needs WebApplication, FAQPage, HowTo');
const visible = html.replace(/<script[\s\S]*?<\/script>/g, '');
for (const q of (graph.find((g) => g['@type'] === 'FAQPage')?.mainEntity || [])) {
  ok(visible.includes(q.name), `FAQ question not visible on the page: ${q.name}`);
  const a = q.acceptedAnswer.text.slice(0, 40); ok(visible.includes(a), `FAQ answer differs from visible text: ${q.name}`);
}
ok(/<h2/.test(html) && !/<h4/.test(html), 'heading hierarchy');
ok(html.indexOf('id="editor"') < html.indexOf('id="h-checks"'), 'tool must come before the explanatory content');
for (const f of ['robots.txt', 'sitemap.xml', 'llms.txt']) ok(existsSync(root + f), `${f} missing`);
ok(/Sitemap:/.test(rd('robots.txt')), 'robots.txt lacks Sitemap');

section('design system');
const css = rd('style.css'), tokens = rd('design/tokens.css');
ok(!/#[0-9a-fA-F]{3,8}\b/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')), 'style.css must use tokens, not raw hex colours');
ok(/Poppins/.test(tokens) && !/fonts\.googleapis|fonts\.gstatic/.test(css + tokens + html), 'Poppins must be self-hosted');

console.log(`\n${checks - fails}/${checks} checks passed${GA ? ' (analytics mode: ' + GA + ')' : ' (strict mode)'}`);
process.exit(fails ? 1 : 0);
