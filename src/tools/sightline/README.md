# Sightline Velocity: browser-only maintenance

## Architecture boundaries

- Run document ingestion, reading, annotations, drills, and exports in the browser.
- Require no account, authentication, private API key, backend, or external database.
- Preserve the existing device-local persistence. Browser storage is not cloud backup and can be cleared or evicted.
- Keep user-controlled file exports available as the portable copy of reading data.
- Add no dependency or network request for these model and anchor corrections.

## Document model contracts

Sentence and token ranges are UTF-16 offsets into `DocumentModel.text`; slicing a recorded range must reproduce its recorded text. Chapter boundaries must be remapped after prose-only, note, and empty-paragraph filtering. Entirely filtered chapters must not acquire text from the next chapter.

Normalization preserves zero-width joiners and non-joiners. ORP selection and splitting use complete grapheme clusters while returning UTF-16 indices for existing consumers. Non-finite ratio values fall back to 0.35, and finite ratios are clamped to 0–1. The existing ASCII anchor table remains unchanged.

`Intl.Segmenter` supplies full grapheme segmentation when available. The fallback preserves code points, combining marks, and common joined emoji sequences; it is not a complete implementation of every Unicode grapheme rule. These changes do not make the English syllable/readability estimates multilingual or add language-aware word segmentation.

## Maintenance sequence

1. Observe: verify the current main tip and affected file hashes before each write.
2. Orient: preserve source contracts, browser-only constraints, and parallel edits.
3. Decide: scope the patch to the two engines and focused regression coverage.
4. Act: integrate one non-destructive main commit, then inspect fresh CI evidence.

Source changes and regression coverage are recorded in `changelog.md`. Existing design and implementation records remain authoritative and are preserved:

- `../../../docs/superpowers/specs/2026-09-15-sightline-velocity-design.md`
- `../../../docs/superpowers/plans/2026-09-15-sightline-velocity.md`

## Acceptance and remaining work

The regression suite is `tests/unit/sightline-browser-audit-regressions.test.ts`. Acceptance requires fresh repository TypeScript/build and Sightline unit/browser CI results, not only isolated algorithm checks. No browser layout, scrolling, tooltip, speech, export, or Safari/iPhone validation is implied by this engine patch.

The token guard still bounds token creation rather than all ingestion work or retained text. A follow-up must bound processing while preserving text/token/paragraph contracts and explicitly report excluded content. Keep this item open until large-document tests and measurements support closure.
