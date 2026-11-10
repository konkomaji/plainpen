# Research notes: what exists, how it works, and where Plainpen differs

This is the study behind the design. Items marked (checked) were looked up during development. The rest is general knowledge and should be re-verified before you quote it.

## What people use today

| Tool | Approach | Where it runs | Notes |
|---|---|---|---|
| Grammarly | Proprietary machine learning models | Cloud | Text is sent to servers. The most used consumer tool. |
| LanguageTool | Hand written rules (XML and Java), n-gram statistics for confusable words, optional neural checks (checked) | Java server, local or cloud | Open source (LGPL). The n-gram data is large (several GB). |
| Harper (Automattic) | Rust core, compiled to WebAssembly, rule based (checked) | Local | Open source (Apache-2.0). Very fast, offline, privacy first. The closest in spirit to Plainpen. |
| Chrome Proofreader API | On device Gemini Nano model (checked) | Local, in the browser | Needs a large model download and capable hardware. Still in trial. |
| Hemingway, ProWritingAid, Slick Write | Style and readability heuristics plus some rules | Mixed | Readability scores, passive voice, adverbs. |
| Hunspell / nspell | Dictionary plus affix rules | Local | The base of most editors' spell check. |
| SymSpell | Deletion neighbourhood index, edit distance | Local | Very fast spelling suggestions. |
| write-good, retext, proselint | Pattern lists for prose | Local | Open source style checkers. |
| Research systems (GECToR, T5 based) | Neural grammar correction | Needs a GPU or a server | Best at fluency errors. Too large for a light web tool. |

## The landscape in one line

Strong grammar correction today needs a neural model, which needs a server or a large download. Rule based tools are fast and private but cover less. Plainpen chooses the second path on purpose and tries to close the gap with better knowledge and learning.

## Techniques Plainpen uses, and why

1. **Dictionary plus rules, no model.** Keeps the page small, fast and private, and removes the question of training data entirely.
2. **Skeleton-Rank for spelling.** Retrieval by edit distance 1 and by a sound-folded consonant skeleton, then ranking by a weighted Damerau-Levenshtein distance with keyboard adjacency, doubled letter and transposition costs. A "productivity" signal (how many inflections a word has in the dictionary) stands in for word frequency, which the open word list lacks.
3. **Tag-Lattice for grammar.** A very small tagger (closed class words and suffix morphology) lets patterns describe grammar roles, which makes rules shorter and more general than literal phrase lists.
4. **Trust-Gate for learning.** Per rule, per mode precision estimate from accept and dismiss counts. This answers the real complaint about rule based checkers (false alarms) without a server.
5. **A taught Brain and dialect packs.** Names, places, brand spellings and dialect words are data the user can add, share and export.
6. **Per paragraph caching and sliced checking.** Only changed paragraphs are re-analysed. A 165,000 word document checks cold in about a second and re-checks a one paragraph edit in about 10 ms.

## Honest comparison

- Plainpen is **not** a replacement for a neural checker on subtle fluency errors. It is aimed at being fast, private, predictable and explainable, with very few false alarms.
- It is **strong** where rules and word knowledge are enough: typos, agreement, confusable words, punctuation, regional spelling, house style, tone, and simplified writing.
- Because every flag names its rule and shows its trust score, users can see and change why something was flagged.

## Benchmarks (`npm test`)

Measured on the included gold sets (small, written by the author, so treat as a regression guard and not as a published benchmark):

- Spelling, 85 common misspellings: top 1 about 83 percent, top 5 about 95 percent. A plain Levenshtein baseline scores about 58 percent and 80 percent.
- Grammar gold set: precision and recall at 100 percent on the included set, with zero false positives on the clean sentences.
- Speed: about 150 to 250 thousand words per second cold, a few milliseconds for a one paragraph edit.
- Robustness: 4,800 plus invariant checks, including fuzzed Unicode, 3 MB lines with no spaces, and quote storms.

### What a fair public benchmark needs (next step)

- **Spelling:** the Birkbeck, Aspell and Wikipedia misspelling corpora.
- **Grammar:** the CoNLL-2014 and BEA-2019 shared tasks (measure F0.5, which weights precision twice as much as recall), plus JFLEG for fluency.
- **False positives:** run the checker over clean published text (public domain books, documentation) and count flags per 1,000 words by rule.
- **Speed:** words per second and edit latency on a mid range phone.
- Publish the harness, the data licences and the numbers, so others can reproduce them.

## Ideas that could make it better than others

- **Document consistency checks:** one spelling variant per document (US or UK), consistent hyphenation, serial comma, number style.
- **Real word errors:** flag rare words that are one edit from a common word when the context suggests a slip.
- **House style packs:** share a team style as a lexicon file (preferred spellings, banned words) that works offline.
- **Community rule packs** with their own test cases, so rules are reviewed like code.
- **Explain mode:** a short rule explanation and example for every flag.
- **Frequency data:** ship a compact open frequency list to improve spelling ranking.

## On the dictionary and "up to date"

No static list is ever complete or current. Plainpen keeps the base small, lets you add words (`data/extra.txt`, the Brain, lexicon packs) and treats refresh as a data update, not a code change. A build script that merges a current open word list and a place name list (for example GeoNames, CC BY 4.0) is the natural next addition.
