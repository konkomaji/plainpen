# Plainpen

An open source grammar, spelling and style checker that runs entirely in your browser.
Your writing is never uploaded, stored on a server or used to train AI. There is no login, no ads and no AI model inside it.

Created by [Konko Maji](https://konkomaji.com). MIT license.

## Run it

```
npm start            # http://localhost:8080 with the same security headers as production
npm test             # accuracy benchmark, robustness suite, security and content gate
```

No install step: there are no dependencies. Node 20 or newer is only needed for the dev server and the tests.

## What is inside

| Part | File | What it does |
|---|---|---|
| Engine | `js/engine.js` | Dictionary, Skeleton-Rank spelling, Tag-Lattice grammar, modes, regions. Pure JS, no DOM. |
| Knowledge | `js/lexicon.js` | Rules and word data as plain tables: regional spelling, dialects, encyclopedia, STE seeds. |
| Learning | `js/profile.js` | Trust-Gate (per rule, per mode), the taught Brain, safe import and export. |
| Storage | `js/store.js` | AES-GCM 256 encrypted local storage, passphrase backups. |
| Worker | `js/worker.js` | Runs the engine off the main thread, in slices, with cancel and restart. |
| Case tools | `js/textcase.js` | UPPER, lower, Sentence, Title, camel, snake and more. Brain aware. |
| Interface | `js/app.js`, `style.css`, `design/` | DOM only (no innerHTML), so Trusted Types can be enforced. |

## The three original ideas

1. **Skeleton-Rank (spelling).** Candidates come from edit distance 1 plus a consonant skeleton index (so "fone" finds "phone"). They are ranked by a keyboard aware, doubled letter aware Damerau-Levenshtein distance, a commonness signal derived from how many inflections a word has in the dictionary, and your own past corrections.
2. **Tag-Lattice (grammar).** Closed class words and suffix morphology tag every token, so a rule can say "a form of BE followed by a past participle" and not only list literal words.
3. **Trust-Gate (learning).** Each rule starts with a prior precision. Your accepts and dismissals update `trust = (accepted + prior * 4) / (accepted + dismissed + 4)` for that rule in that writing mode. Rules below 35 percent go quiet. It is counting, not a model.

## Features

- Modes: Professional, Technical, Simplified (ASD-STE100 ideas), Friendly, Casual.
- English: American, British, Indian, plus the Banglish dialect (Pujo, Pandel).
- Modern lingo: text speak, stretched words, Gen Z slang, romanised Hindi and Bengali, brand names.
- The Brain: teach a word as a name, place, brand, acronym, term, slang or preferred spelling, with a note and exact casing. Export and import lexicon packs.
- Long text: up to 12 million characters, checked in slices, only changed paragraphs are rechecked.
- Teacher's pen: marks look like a teacher marked the page, with clickable handwritten corrections.
- Case converter, drag and drop, offline, installable as an app, accepts text from the phone share sheet.
- No em dashes: the checker flags them and suggests a comma, colon or full stop.

## Known limits (honest)

- Grammar coverage is rule based. It catches common errors with high precision. It does not parse every sentence, and it will miss subtle errors that a language model might find. Contributions of rules are welcome: add rows to `js/lexicon.js`.
- The dictionary is an open word list of about 275,000 words. It is not Wiktionary fresh. `data/extra.txt` (optional) is merged at start so you can add newer words without code changes.
- The STE mode checks the rules of ASD-STE100 that can be checked by pattern. The official approved dictionary is licensed by ASD and is not included. You can supply your own list with `setApproved()`.
- The place pack is built in small (countries, major cities, Indian states). Larger packs load lazily from `data/packs/places.txt` and `data/packs/names.txt` when present.

## Deploy

Any static host works. Use the `_headers` file on Netlify or Cloudflare Pages. On other hosts, send the same headers.

```
node tools/configure.mjs --url https://your.domain
node tools/configure.mjs --gsc <search-console-token>
node tools/configure.mjs --repo https://github.com/you/plainpen   # shows the "View the source" links
node tools/configure.mjs --ga G-XXXXXXXXXX      # optional, see SECURITY.md
```

The open source repo is tracker free. `--ga` is for your own deployment, shows an opt-in switch, and opens the content security policy only to the Google hosts it needs.

## Contributing

Run `npm test` before every pull request. The gate checks accuracy, robustness, security headers, dangerous code patterns, external links, design tokens and that no page copy contains an em dash.
