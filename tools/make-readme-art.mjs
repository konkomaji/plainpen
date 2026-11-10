// Generates the README artwork in .github/assets/ (light and dark versions).
//   node tools/make-readme-art.mjs
// Plain SVG, no external fonts or images, so GitHub renders it as is.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const out = fileURLToPath(new URL('../.github/assets/', import.meta.url));
mkdirSync(out, { recursive: true });

const SANS = "Poppins, 'Segoe UI', Helvetica, Arial, sans-serif";
const HAND = "Caveat, 'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive";

const THEMES = {
  light: { bg: '#f7f9fc', card: '#ffffff', line: '#dfe5f3', soft: '#e6ebfb', t1: '#1b2433', t2: '#4d5a70', t3: '#7a869c', red: '#e5484d', purple: '#8a52d0', good: '#1f7a4d', goodBg: '#e3f5ec' },
  dark:  { bg: '#0f1420', card: '#161d2e', line: '#28324a', soft: '#1d2742', t1: '#e8edf7', t2: '#a7b2c8', t3: '#7c88a1', red: '#ff6b6b', purple: '#b48cf0', good: '#5fd39a', goodBg: '#173528' },
};

// The logo: a pen on the brand blue, with a teacher's red wavy mark under the tip.
const logoBody = `<rect width="64" height="64" rx="14" fill="#3f5fd6"/>
  <path d="M15 46l5-13 24-24 8 8-24 24z" fill="#ffffff"/>
  <path d="M15 46l5-13 8 8z" fill="#c9d3f7"/>
  <path d="M39 14l8 8" stroke="#3f5fd6" stroke-width="3"/>
  <path d="M12 54q3-3 6 0t6 0t6 0t6 0" stroke="#ff6b5a" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
const logo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="128" height="128" role="img" aria-label="Plainpen logo">
  ${logoBody}
</svg>
`;

const wavy = (x1, x2, y, color) => {
  let d = `M${x1} ${y}`;
  for (let x = x1; x < x2; x += 8) d += ` q2 -4 4 0 t4 0`;
  return `<path d="${d}" stroke="${color}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
};
// textLength fixes the word width, so marks line up whatever font the viewer has.
const word = (x, y, w, s, fill, size = 26) => `<text x="${x}" y="${y}" font-family="${SANS}" font-size="${size}" fill="${fill}" textLength="${w}" lengthAdjust="spacingAndGlyphs">${s}</text>`;

function banner(c) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 420" width="1280" height="420" role="img" aria-label="Plainpen: the private grammar and spell checker">
  <rect width="1280" height="420" rx="28" fill="${c.bg}"/>
  <g transform="translate(72 78) scale(1.6)">${logoBody}</g>
  <text x="72" y="268" font-family="${SANS}" font-size="84" font-weight="700" fill="${c.t1}">Plainpen</text>
  <text x="74" y="320" font-family="${SANS}" font-size="29" fill="${c.t2}">The private grammar and spell checker.</text>
  <text x="74" y="364" font-family="${SANS}" font-size="21" fill="${c.t3}">Open source · No AI · No login · Nothing leaves your device</text>

  <rect x="700" y="52" width="520" height="316" rx="18" fill="${c.card}" stroke="${c.line}" stroke-width="2"/>
  <circle cx="730" cy="80" r="6" fill="${c.line}"/><circle cx="750" cy="80" r="6" fill="${c.line}"/><circle cx="770" cy="80" r="6" fill="${c.line}"/>

  <text x="744" y="140" font-family="${HAND}" font-size="32" font-weight="600" fill="${c.red}">There</text>
  ${word(740, 176, 64, 'Their', c.t1)}
  <path d="M736 168l74 -14" stroke="${c.red}" stroke-width="2.6" stroke-linecap="round"/>
  ${word(818, 176, 250, 'is a meeting at 10.', c.t1)}

  <text x="782" y="222" font-family="${HAND}" font-size="32" font-weight="600" fill="${c.red}">received</text>
  ${word(740, 258, 14, 'I', c.t1)}
  ${word(764, 258, 112, 'recieved', c.t1)}
  ${wavy(764, 876, 268, c.red)}
  ${word(888, 258, 130, 'your file.', c.t1)}

  ${word(740, 326, 108, 'The file', c.t1)}
  ${word(858, 326, 116, 'was sent', c.t1)}
  <path d="M858 336h116" stroke="${c.purple}" stroke-width="2.6" stroke-dasharray="2 6" stroke-linecap="round"/>
  ${word(984, 326, 80, 'by me.', c.t1)}
  <text x="1092" y="300" font-family="${HAND}" font-size="24" font-weight="600" fill="${c.purple}">active?</text>

  <rect x="1060" y="70" width="140" height="34" rx="17" fill="${c.goodBg}"/>
  <text x="1130" y="93" text-anchor="middle" font-family="${SANS}" font-size="17" font-weight="600" fill="${c.good}">✓ Clear · 92</text>
</svg>
`;
}

function howItWorks(c) {
  const box = (x, y, w, h, title, sub) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="${c.card}" stroke="${c.line}" stroke-width="2"/>
  <text x="${x + w / 2}" y="${y + h / 2 - 6}" text-anchor="middle" font-family="${SANS}" font-size="24" font-weight="600" fill="${c.t1}">${title}</text>
  <text x="${x + w / 2}" y="${y + h / 2 + 26}" text-anchor="middle" font-family="${SANS}" font-size="17" fill="${c.t2}">${sub}</text>`;
  const arrow = (x1, x2, y) => `<path d="M${x1} ${y}H${x2 - 10}" stroke="${c.t3}" stroke-width="3"/><path d="M${x2 - 14} ${y - 8}l12 8l-12 8z" fill="${c.t3}"/>`;
  const pill = (y, name, job, color) => `<rect x="392" y="${y}" width="496" height="54" rx="27" fill="${c.soft}"/>
  <circle cx="422" cy="${y + 27}" r="9" fill="${color}"/>
  <text x="444" y="${y + 34}" font-family="${SANS}" font-size="20" font-weight="600" fill="${c.t1}">${name}</text>
  <text x="868" y="${y + 34}" text-anchor="end" font-family="${SANS}" font-size="18" fill="${c.t2}">${job}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 440" width="1280" height="440" role="img" aria-label="How Plainpen works: your text is checked inside your browser and never sent to a server">
  <rect width="1280" height="440" rx="28" fill="${c.bg}"/>
  ${box(40, 120, 240, 170, 'Your text', 'typed or pasted')}
  ${arrow(290, 360, 205)}
  <rect x="360" y="48" width="560" height="304" rx="22" fill="${c.card}" stroke="#3f5fd6" stroke-width="2.5"/>
  <text x="640" y="96" text-anchor="middle" font-family="${SANS}" font-size="24" font-weight="600" fill="${c.t1}">Inside your browser</text>
  ${pill(124, 'Skeleton-Rank', 'spelling', c.red)}
  ${pill(194, 'Tag-Lattice', 'grammar', '#3f5fd6')}
  ${pill(264, 'Trust-Gate', 'learns from you', c.good)}
  ${arrow(930, 1000, 205)}
  ${box(1000, 120, 240, 170, 'Teacher’s pen', 'marks and fixes')}
  <text x="640" y="404" text-anchor="middle" font-family="${SANS}" font-size="21" font-weight="600" fill="${c.red}">✕ No server   ✕ No AI model   ✕ No account   ✕ No tracking of your words</text>
</svg>
`;
}

function modes(c) {
  const list = [
    ['Professional', 'Clear and formal', '#3f5fd6'],
    ['Technical', 'Code aware, precise', '#1f8fb3'],
    ['Simplified', 'ASD-STE100 style', '#a77b0c'],
    ['Friendly', 'Warm and relaxed', '#d14d7a'],
    ['Casual', 'Slang welcome', '#8a52d0'],
  ];
  const w = 232, gap = 16, x0 = 24;
  const cards = list.map(([name, sub, col], i) => {
    const x = x0 + i * (w + gap);
    return `<rect x="${x}" y="24" width="${w}" height="132" rx="18" fill="${c.card}" stroke="${c.line}" stroke-width="2"/>
  <rect x="${x}" y="24" width="${w}" height="8" rx="4" fill="${col}"/>
  <text x="${x + 22}" y="88" font-family="${SANS}" font-size="24" font-weight="600" fill="${c.t1}">${name}</text>
  <text x="${x + 22}" y="122" font-family="${SANS}" font-size="17" fill="${c.t2}">${sub}</text>`;
  }).join('\n  ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 180" width="1280" height="180" role="img" aria-label="Five writing modes: Professional, Technical, Simplified, Friendly, Casual">
  <rect width="1280" height="180" rx="24" fill="${c.bg}"/>
  ${cards}
</svg>
`;
}

writeFileSync(out + 'logo.svg', logo);
for (const [name, c] of Object.entries(THEMES)) {
  writeFileSync(out + `banner-${name}.svg`, banner(c));
  writeFileSync(out + `how-it-works-${name}.svg`, howItWorks(c));
  writeFileSync(out + `modes-${name}.svg`, modes(c));
}
console.log('README art written to .github/assets/');
