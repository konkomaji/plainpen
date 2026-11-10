// Deployment configuration. Run once for YOUR deployment; the open source repo stays tracker-free.
//
//   node tools/configure.mjs --url https://your.domain --ga G-XXXXXXX --gsc <verification-token>
//
//  --url  replaces the placeholder domain in canonical, Open Graph, JSON-LD, robots, sitemap, llms.txt
//  --gsc  adds the Google Search Console verification meta tag (no runtime code, no tracking)
//  --repo shows the "View the source on GitHub" links once your repository is public
//  --ga   enables Google Analytics 4 behind a visitor opt-in, and opens the CSP to exactly the
//         Google hosts it needs (nothing else). Text is never sent: no custom events exist.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1]]] : a), []));
const rd = (f) => readFileSync(root + f, 'utf8'), wr = (f, s) => writeFileSync(root + f, s);
const fail = (m) => { console.error('Error: ' + m); process.exit(1); };

if (args.url) {
  let u; try { u = new URL(args.url); } catch { fail('--url must be a full URL such as https://example.com'); }
  if (u.protocol !== 'https:') fail('--url must use https');
  // Keep the path so the site can live in a sub folder, for example https://example.com/plainpen
  const base = u.origin + u.pathname.replace(/\/+$/, '');
  for (const f of ['index.html', 'privacy.html', 'terms.html', 'robots.txt', 'sitemap.xml', 'llms.txt', 'tools/build-pages.mjs']) wr(f, rd(f).replaceAll('https://plainpen.example', base));
  console.log('Site URL set to ' + base);
}

if (args.repo) {
  if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(args.repo)) fail('--repo must look like https://github.com/user/repo');
  let html = rd('index.html');
  html = html.replace(/(<p class="repo-line" data-repo)( hidden)?>/g, '$1>').replace(/(<a class="repo-link" href=")[^"]*(")/g, '$1' + args.repo + '$2');
  wr('index.html', html);
  wr('llms.txt', rd('llms.txt').replace(/\n- Source code: .*/g, '').replace('## Pages', '- Source code: ' + args.repo + '\n\n## Pages'));
  console.log('GitHub links are now visible and point to ' + args.repo);
}

if (args.gsc) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(args.gsc)) fail('--gsc token looks wrong (expected 20 to 100 letters, digits, - or _)');
  let html = rd('index.html');
  html = html.replace(/<meta name="google-site-verification"[^>]*>\n?/, '');
  html = html.replace('<meta name="referrer"', `<meta name="google-site-verification" content="${args.gsc}">\n<meta name="referrer"`);
  wr('index.html', html);
  console.log('Search Console verification tag added. Also submit sitemap.xml in Search Console.');
}

if (args.ga) {
  if (!/^G-[A-Z0-9]{4,14}$/.test(args.ga)) fail('--ga must look like G-XXXXXXXXXX');
  wr('js/config.js', `// Set by tools/configure.mjs for this deployment.\nexport const GA_ID = '${args.ga}';\n`);
  const add = (csp, dir, hosts) => csp.replace(new RegExp(`(${dir} [^;]*)`), (m) => hosts.reduce((s, h) => (s.includes(h) ? s : s + ' ' + h), m));
  const widen = (csp) => {
    csp = add(csp, 'script-src', ['https://www.googletagmanager.com']);
    csp = add(csp, 'connect-src', ['https://www.googletagmanager.com', 'https://*.google-analytics.com', 'https://*.analytics.google.com']);
    csp = add(csp, 'img-src', ['https://www.googletagmanager.com', 'https://*.google-analytics.com']);
    return csp;
  };
  let html = rd('index.html');
  html = html.replace(/(<meta http-equiv="Content-Security-Policy" content=")([^"]*)(")/, (_, a, csp, c) => a + widen(csp) + c);
  wr('index.html', html);
  for (const pg of ['privacy.html', 'terms.html']) wr(pg, rd(pg).replace(/(<meta http-equiv="Content-Security-Policy" content=")([^"]*)(")/, (_, a, csp, c) => a + widen(csp) + c));
  wr('_headers', rd('_headers').replace(/(Content-Security-Policy: )(.*)/, (_, a, csp) => a + widen(csp)));
  console.log('Google Analytics 4 enabled behind visitor opt-in (' + args.ga + '). CSP widened to Google hosts only.');
}

if (!args.url && !args.ga && !args.gsc && !args.repo) console.log('Nothing to do. See the header of tools/configure.mjs for options.');
