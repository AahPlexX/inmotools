---
task: T-markdown-readability-20261007-12d4
tool: markdown-workbench
doc: task
kind: fix
state: next
branch: fix/markdown-workbench
created: 2026-10-07
updated: 2026-10-07
---

# Add readability grades using native prose boundaries

## Request

Next frozen item MDW-R55: Flesch-Kincaid grade and Coleman-Liau index, with reference-score acceptance. Associated confirmed prose-metrics defects must be repaired without changing authored text. R51 release remains pending; no R55 implementation is present.

## Resume here

2026-10-07 15:20:46 UTC: R51 scoped release is verified at main 230f637 with full 37637141396 (1711 browser passes, no retries) and Pages deploy job success. R55 is the next frozen ID. Finish the independently checked associated metadata-display repair 42ab release before implementing grades; it has 403 units/38 production passes but is unpublished. No R55 runtime change. Read primary research and exact baseline/fixture counts below, record conservative defaults in the spec, then implement and obtain fresh required checks.

## Confirmed baseline

Direct evaluation of unchanged prose-metrics-engine.ts through Node 24.19.0 stripTypeScriptTypes (type erasure only) at 2026-10-07 14:03:19 UTC: `    hidden code words.` counted 3 words; a tilde JS fence counted 4 words including js; a native valid JSON metadata block with title hidden metadata words followed by Visible prose. counted 6 words instead of 2. The cat sat. reported 10 characters, including its punctuation, while the UI says letters and numbers. Numeric-only 123456789?! returned 0 words but 1 sentence and 11 characters. A preliminary metadata probe used unsupported ;;; delimiters and is excluded as a metadata baseline. A preliminary TypeScript transpileModule harness failed before evaluation because the installed compiler export API did not expose the assumed enum; it is excluded as product evidence.

## Primary and official research

- Microsoft Word official readability documentation retrieved live at 2026-10-07 14:00:06 UTC: [formula and language limits](https://support.microsoft.com/en-us/word/get-your-document-s-readability-and-level-statistics-in-microsoft-word). Flesch-Kincaid grade = 0.39 × words/sentences + 11.8 × syllables/words − 15.59. This is grade level, distinct from Flesch Reading Ease.
- [Original Coleman/Liau paper record](https://psycnet.apa.org/record/1975-22007-001), DOI 10.1037/h0076540, retrieved live at 14:00:06 UTC: predictors are letters per 100 words and sentences per 100 words. The requested full-text PDF resolved to the abstract/access page; do not claim the full original paper was read or redistribute it.
- [Harvard CS50 2026 readability exercise](https://cs50.harvard.edu/x/2026/psets/2/readability/) retrieved live at 14:01 UTC: index = 0.0588 × letters/words × 100 − 0.296 × sentences/words × 100 − 15.8; letters exclude digits/punctuation. Official published grade fixtures include public-domain Gatsby sentence (Grade 7), Alice passage (Grade 8), and Shakespeare sentence (Grade 9). Harvard's exercise assumes space-separated words and terminal .!?; it is a fixture reference, not a comprehensive document tokenizer specification.
- Current developer-primary [Flesch formula implementation](https://raw.githubusercontent.com/words/flesch-kincaid/master/index.js) and [Coleman formula implementation](https://raw.githubusercontent.com/words/coleman-liau/master/index.js) retrieved HTTP 200 at 14:02:05 UTC corroborate coefficients and undefined results without words/sentences. No new formula dependency is necessary for this arithmetic.
- [EPA readability guidance](https://www.epa.gov/choose-fish-and-shellfish-wisely/readability-developing-and-pretesting-concepts-messages-materials), last updated 2026-08-21, retrieved live at 14:03 UTC: readability is a rough indicator of some aspects of comprehension. Do not present a grade as a claim about an individual reader. Its linked CMS older toolkit URLs now redirect to generic writing guidance; no inaccessible toolkit content is evidence.
- [MDN Intl.Segmenter](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter) retrieved live at 14:04:11 UTC: supports locale-sensitive word/sentence segmentation and documents older-browser gaps. A browser-only change must retain a fallback and verify actual boundary cases; segmentation does not identify the document language.
- [Native mdast specification](https://github.com/syntax-tree/mdast) retrieved live at 14:04:11 UTC corroborates literal versus text/container node semantics. Reuse the already memoized native document tree so metrics do not add another complete parse on every keystroke.
- ERIC [original Navy report record ED108134](https://eric.ed.gov/?id=ED108134) retrieved live at 14:00 UTC corroborates original population/context (531 enlisted personnel, Navy training passages); the attempted ERIC full PDF redirected and yielded no paper text. It cannot establish an exact sample-passage score.

## Acceptance to specify before implementation

Add both named grades with explicit English/estimated syllable limitations, undefined empty/unsupported-input state and unbounded finite formula values rather than arbitrary grade clamps. Verify published Coleman fixtures and a manually counted monysyllabic passage against the official Flesch formula; do not label a derived result as a published passage score. Keep prose exclusion consistent with the native parser (all code fence forms, indented/inline code, math, metadata, URLs, inert HTML), preserve actual prose text/entities/emphasis/owned captions and avoid merging words across removed literals or native block boundaries. Test punctuation/digits, quotes/apostrophes/hyphenated words, blank and code-only documents, non-ASCII text, document replacement/reset and keyboard Undo. Native paragraph/container extraction must be iterative for deep documents and reuse the tree where available. Keep original source/download unchanged. The existing panel and live word count must update, wrap and remain within 320 portrait, 844 landscape and 768 tablet bounds; test no overlap and long labels. Preserve existing Fog/reading/speaking behavior except confirmed extraction/count defects. Any syllable-method change requires measured fixtures and documented primary basis; the existing suffix removal is heuristic, not a pronunciation dictionary.

## Log

- 2026-10-07 14:04:11 UTC: Preparatory authoritative research and unchanged-engine baseline recorded. No R55 runtime/test changes; R51 full integration is allowed to finish without cancellation.

- 2026-10-07 14:07:40 UTC: Actual unchanged R38-build browser metrics reproduce all five synthetic count baselines on desktop and mobile (10 measured cycles). Direct playwright package import failed before launching because it is not a direct dependency; corrected installed @playwright/test API launched the browser. R51 associated metadata repair 291b now precedes R55; no readability runtime change.

- 2026-10-07 14:24:27 UTC: Read-only instrumented evaluation of the unchanged private countSyllables helper (type erasure plus export, no algorithm change) returned morning 1, reading 1, bottle 1, table 1, beautiful 3, played 1, wanted 1. The current developer-primary syllable README explicitly gives bottle 2; the existing estimator differs on that published API fixture. Do not feed its count into a newly presented grade without recording/validating the syllable-method limitation. No dependency or readability implementation was added.

- 2026-10-07 15:11:18 UTC: Re-fetched primary syllable source/license and official CS50 2026 fixtures (HTTP 200 at 15:07:52–54); the guessed upstream test.js path returned 404 and is not evidence. Primary syllable implementation uses pluralize, normalize-strings and a problematic-word table, so it is not a single dependency-free function; MIT attribution is required for substantial copies. No code/dependency copied. Extracted three public-domain official Coleman fixtures and independently counted ASCII letters: Gatsby 23 words/1 sentence/96 letters → derived 7.4556521739130375 → published Grade 7; Alice 57/1/235 → derived 7.92280701754386 → published Grade 8; Shakespeare 16/1/72 → derived 8.81 → published Grade 9. Existing characters are 98/245/75 respectively and therefore cannot be substituted for formula letters. These are preparatory derived checks, not implementation acceptance; fixture source is the current official Harvard page above, independent of an execution-workspace artifact. No R55 runtime change.

- 2026-10-07 15:14:43 UTC: Official npm registry latest metadata retrieved HTTP 200 at 15:14:42 UTC: syllable 5.0.1, ESM, MIT, dependencies pluralize ^8.0.0, @types/pluralize ^0.0.29 and normalize-strings ^1.1.0. This is current package metadata, not installed/bundle/accuracy verification. No dependency was added; any adoption must pin an exact version, check primary browser support and include required license notices.
