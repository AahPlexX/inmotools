# Tactical Matchboard Studio third-party notices

## Noto Sans subset used by the coaching PDF

The coaching PDF embeds a subset of **Noto Sans** Regular and **Noto Sans** Bold so page text can keep accented Latin, Greek, and Cyrillic letters. The files are `fonts/NotoSans-Regular.subset.ttf` and `fonts/NotoSans-Bold.subset.ttf`. They are loaded only when a PDF export contains a character outside basic Latin. No font file is fetched from the network at export time.

Source: Noto Sans v2.015, tag `NotoSans-v2.015`, commit `c4a321e123e4d4ff315f57f4e0adf294fe3a95be`, repository https://github.com/notofonts/latin-greek-cyrillic. The unhinted Regular and Bold TrueType files were taken from the release zip `NotoSans-v2.015.zip` published 2024-11-20. License text checked 2026-10-11 from that release's `OFL.txt` and from https://github.com/notofonts/latin-greek-cyrillic/blob/main/OFL.txt. Both copies state the same copyright and SIL Open Font License 1.1. The copyright statement names no Reserved Font Name, so this subset keeps the names Noto Sans, NotoSans-Regular, and NotoSans-Bold.

Copyright 2022 The Noto Project Authors (https://github.com/notofonts/latin-greek-cyrillic)

License: SIL Open Font License, Version 1.1. The full license is [OFL.txt](fonts/OFL.txt). The license requires that copy of the copyright notice and license to travel with the font files. It does not require a credit line on a document that uses the font. The font is not sold by itself.

Subset kept for the page font: U+0000–007E, U+00A0–024F, U+02B0–02FF, U+0300–036F, U+0370–03FF, U+0400–052F, U+1E00–1EFF, U+1F00–1FFF, U+2000–206F, U+20A0–20CF, U+2116, and U+2122. Each subset file has 1,792 glyphs and contains the GDEF, GPOS, and GSUB tables. The GSUB and GPOS feature lists are empty. The DSIG table is absent. A character outside this subset is drawn as ? on the page. `metadata.json` keeps the original character.

Unhinted source sizes from the release zip: Regular 431,364 bytes, Bold 432,376 bytes. Subset sizes in this repository: Regular 116,848 bytes (gzip 64,926), Bold 116,952 bytes (gzip 66,762).

The production build on 2026-10-11 puts fontkit and both subset files in one lazy chunk, `pdf-unicode-font-*.js`: 1,023.46 kB, gzip 493.18 kB (Vite's reported gzip). That chunk is loaded only when a coaching PDF contains a character outside basic Latin. The Matchboard workspace chunk from the same build is 342.33 kB, gzip 92.38 kB, and does not contain the font or fontkit. Inside the lazy chunk, the fontkit script without the inlined font data is 711,694 bytes, gzip 329,533. The two inlined base64 font strings gzip to 80,640 and 82,021 bytes. Gzip of the separate pieces is not the gzip of the whole chunk.

## @pdf-lib/fontkit

`@pdf-lib/fontkit` 1.1.1 is pinned in `package.json` with no range. npm package metadata retrieved 2026-10-11 names the license as MIT, the version as 1.1.1 published 2020-11-28, and the unpacked package size as about 4.1 MB. The installed package is 4,282,008 bytes and includes Node and browser builds. Matchboard loads the browser build only from the PDF export chunk. pdf-lib 1.17.1 standard fonts cannot draw past WinAnsi. This package is the font embedder pdf-lib calls through `registerFontkit`. No other tool imports it.

Package: https://www.npmjs.com/package/@pdf-lib/fontkit/v/1.1.1

Registry record: https://registry.npmjs.org/@pdf-lib/fontkit/1.1.1

Authors named by that package: Andrew Dillon and Devon Govett.

The package metadata does not ship a separate license file. The MIT terms require the copyright and permission notice to stay with copies of the software. The installed package is that copy. This notice records the authors and the MIT license named by the registry.
