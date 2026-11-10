// Generates the legal pages from one template so the header, footer and security policy
// always match index.html:  node tools/build-pages.mjs
// This is a plain English template, not legal advice. Have it reviewed for your jurisdiction.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const index = readFileSync(root + 'index.html', 'utf8');
const pick = (re, what) => { const m = re.exec(index); if (!m) throw new Error('index.html is missing ' + what); return m[0]; };
const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(index)[1];
const brand = pick(/<a class="brand"[\s\S]*?<\/a>/, 'the brand link');
const footer = pick(/<footer class="site">[\s\S]*?<\/footer>/, 'the footer');
const EMAIL = 'hello@konkomaji.com';
const UPDATED = '10 November 2026';

const page = ({ file, title, description, h1, body }) => `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="referrer" content="no-referrer">
<title>${title}</title>
<meta name="description" content="${description}">
<link rel="canonical" href="https://konkomaji.com/plainpen/${file}">
<meta name="robots" content="index, follow">
<meta name="theme-color" content="#f7f9fc">
<link rel="icon" href="icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<link rel="manifest" href="manifest.webmanifest">
<link rel="stylesheet" href="design/tokens.css">
<link rel="stylesheet" href="style.css">
</head>
<body>
<a class="skip" href="#main">Skip to the content</a>
<header class="top"><div class="wrap top-in">
  ${brand}
  <nav class="top-actions" aria-label="Page"><a class="ghost" href="./">Back to the checker</a></nav>
</div></header>
<main id="main" class="content legal-doc">
  <h1>${h1}</h1>
  <p class="meta">Last updated: ${UPDATED}</p>
${body}
</main>
${footer}
<script type="module" src="js/legal.js"></script>
</body>
</html>
`;

const privacy = page({
  file: 'privacy.html',
  title: 'Privacy Policy | Plainpen',
  description: 'How Plainpen handles your data: your writing stays on your device, there are no cookies, and nothing is used to train AI.',
  h1: 'Privacy Policy',
  body: `  <p class="note">The short version: your writing never leaves your device, Plainpen sets no cookies, and nothing you write is collected, sold or used to train AI.</p>

  <h2>Who we are</h2>
  <p>Plainpen is an open source grammar and spell checker created and run by Konko Maji. You can contact us at <a href="mailto:${EMAIL}">${EMAIL}</a>.</p>

  <h2>What we do not collect</h2>
  <ul>
    <li>We do not receive, store or read the text you type, paste or open.</li>
    <li>We do not ask you to create an account or give your name or email address.</li>
    <li>We do not use your writing to train, test or improve any AI model. Plainpen contains no AI model.</li>
    <li>We do not sell or share personal data, and we show no advertising.</li>
  </ul>

  <h2>What stays on your device</h2>
  <p>To work as you expect, Plainpen stores a few things in your own browser. They are not sent to us.</p>
  <ul>
    <li><strong>Your draft</strong>, so it is still there when you come back.</li>
    <li><strong>Your settings</strong>, such as writing mode, kind of English and theme.</li>
    <li><strong>What you teach it</strong>: words, names, places, preferred spellings, and which suggestions you accept or dismiss.</li>
    <li><strong>An offline copy of the app</strong>, so it works without a connection.</li>
  </ul>
  <p>These items are encrypted with AES-GCM (256 bit) using a key that your browser keeps and that page code cannot read. You can export an encrypted backup, or erase everything, from the <em>Data</em> panel at any time. Clearing your browser data also removes it.</p>

  <h2>Cookies</h2>
  <p>Plainpen does not set cookies. If you choose to allow visit statistics (see below), your choice is remembered in your browser's local storage, not in a cookie.</p>

  <h2>Optional visit statistics</h2>
  <p>The open source project has no analytics. If the site owner turns on Google Analytics for a deployment, a switch appears in the <em>Data</em> panel. It is off until you turn it on. When on, Google receives standard page visit information such as the page address, browser type, approximate location from your IP address (anonymised) and the time. It never receives your writing, because the page sends no custom events. Advertising features are switched off. You can turn it off again at any time, and reloading the page stops all measurement. Google's own privacy policy applies to its handling of that data.</p>

  <h2>Hosting and server logs</h2>
  <p>Like any website, the host that serves the files may keep ordinary technical logs, such as the time of a request, the page requested and your IP address, for security and reliability. We do not use these logs to identify you or to track you across sites. They do not contain your writing.</p>

  <h2>Links to other sites</h2>
  <p>The page links to services such as Buy Me a Coffee, GitHub, Instagram, LinkedIn and X. If you follow a link, that service's own privacy policy applies. Plainpen does not load their scripts or trackers on this page.</p>

  <h2>Children</h2>
  <p>Plainpen collects no personal data from anyone, including children. It is suitable for general audiences.</p>

  <h2>Your rights</h2>
  <p>Because we do not hold your personal data, there is usually nothing for us to access, correct or delete. You hold the data on your device and control it in the <em>Data</em> panel. If you believe we hold information about you, or you have a privacy question or complaint, write to <a href="mailto:${EMAIL}">${EMAIL}</a>. You may also contact your local data protection authority.</p>

  <h2>Changes to this policy</h2>
  <p>If we change this policy, we will update the date at the top of this page. If a change affects how your data is handled, we will make it clear on the site.</p>

  <h2>Contact</h2>
  <p>Questions about privacy: <a href="mailto:${EMAIL}">${EMAIL}</a>.</p>`,
});

const terms = page({
  file: 'terms.html',
  title: 'Terms of Use | Plainpen',
  description: 'The terms for using Plainpen, the open source grammar and spell checker. Free to use, provided as is, with your writing staying on your device.',
  h1: 'Terms of Use',
  body: `  <p class="note">The short version: Plainpen is free to use and provided as it is. Your writing stays yours and stays on your device. Check anything important yourself.</p>

  <h2>Agreement</h2>
  <p>By using Plainpen you agree to these terms. If you do not agree, please do not use it. Plainpen is created and run by Konko Maji. Contact: <a href="mailto:${EMAIL}">${EMAIL}</a>.</p>

  <h2>What Plainpen is</h2>
  <p>Plainpen is a free tool that suggests corrections for spelling, grammar, punctuation and style. It runs in your browser. Suggestions are produced by a dictionary and written rules, and they can be wrong or incomplete.</p>

  <h2>Your writing</h2>
  <ul>
    <li>You own your writing. We do not receive it, claim any right in it, or use it to train any AI model.</li>
    <li>Your writing is processed on your device. You are responsible for keeping copies, because we cannot recover anything for you.</li>
    <li>Do not paste material you have no right to use.</li>
  </ul>

  <h2>Acceptable use</h2>
  <p>Please do not use Plainpen to break the law, to attack or overload the site, to probe it for weaknesses without permission, or to copy the site's branding and pass it off as your own. Good faith security research is welcome: write to <a href="mailto:${EMAIL}">${EMAIL}</a> first.</p>

  <h2>No professional advice, no guarantee</h2>
  <p>Plainpen does not give legal, medical, financial or other professional advice. Always read and check important text yourself, especially contracts, official documents, safety instructions and anything where a mistake could cause harm. The Simplified mode draws on the ideas of ASD-STE100 but is not certified as compliant with that standard.</p>

  <h2>Open source and licences</h2>
  <p>The source code is released under the MIT license, which lets you use, copy, modify and share it under its terms. The fonts Poppins and Caveat are used under the SIL Open Font License. The Buy Me a Coffee and social media names and logos belong to their owners. The Plainpen name and the credit to its creator are not covered by the code license.</p>

  <h2>Availability and changes</h2>
  <p>We try to keep Plainpen available and working, but we do not promise that it will always be available, error free, or unchanged. We may change or stop it at any time. An installed copy may keep working offline.</p>

  <h2>Disclaimer of warranties</h2>
  <p>Plainpen is provided "as is" and "as available", without warranties of any kind, whether express or implied, including fitness for a particular purpose and non-infringement. Some places do not allow these exclusions, so they may not apply to you.</p>

  <h2>Limitation of liability</h2>
  <p>To the fullest extent the law allows, we are not liable for any indirect, incidental, special or consequential loss, or for loss of data, profit or goodwill, arising from your use of Plainpen or from errors in its suggestions. Nothing in these terms limits liability that cannot be limited by law.</p>

  <h2>Links to other sites</h2>
  <p>Plainpen links to other sites. We do not control them and are not responsible for their content or practices.</p>

  <h2>Changes to these terms</h2>
  <p>We may update these terms. The date at the top shows when they last changed. If you keep using Plainpen after a change, you accept the new terms.</p>

  <h2>Governing law</h2>
  <p>These terms are governed by the laws of India, and the courts of India have jurisdiction, except where your local consumer protection law gives you rights that cannot be waived.</p>

  <h2>Contact</h2>
  <p>Questions about these terms: <a href="mailto:${EMAIL}">${EMAIL}</a>.</p>`,
});

writeFileSync(root + 'privacy.html', privacy);
writeFileSync(root + 'terms.html', terms);
console.log('wrote privacy.html and terms.html');
