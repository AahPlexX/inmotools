# Tactical Matchboard Studio third-party notices

## Noto Sans subset used by the coaching PDF

The coaching PDF embeds a subset of **Noto Sans** Regular and **Noto Sans** Bold so page text can keep accented Latin, Greek, and Cyrillic letters. The files are `fonts/NotoSans-Regular.subset.ttf` and `fonts/NotoSans-Bold.subset.ttf`. They are loaded only when a PDF export contains a character outside basic Latin. No font file is fetched from the network at export time.

Source: Noto Sans v2.015, tag `NotoSans-v2.015`, commit `c4a321e123e4d4ff315f57f4e0adf294fe3a95be`, repository https://github.com/notofonts/latin-greek-cyrillic. The unhinted Regular and Bold TrueType files were taken from the release zip `NotoSans-v2.015.zip` published 2024-11-20. License text checked 2026-10-11 from that release's `OFL.txt` and from https://github.com/notofonts/latin-greek-cyrillic/blob/main/OFL.txt. Both copies state the same copyright and SIL Open Font License 1.1. The copyright statement names no Reserved Font Name, so this subset keeps the names Noto Sans, NotoSans-Regular, and NotoSans-Bold.

Copyright 2022 The Noto Project Authors (https://github.com/notofonts/latin-greek-cyrillic)

License: SIL Open Font License, Version 1.1. The full license is [OFL.txt](fonts/OFL.txt). The license requires that copy of the copyright notice and license to travel with the font files. It does not require a credit line on a document that uses the font. The font is not sold by itself.

Subset kept for the page font: U+0000–007E, U+00A0–024F, U+02B0–02FF, U+0300–036F, U+0370–03FF, U+0400–052F, U+1E00–1EFF, U+1F00–1FFF, U+2000–206F, U+20A0–20CF, U+2116, and U+2122. Each subset file has 1,792 glyphs and contains the GDEF, GPOS, and GSUB tables. The GSUB and GPOS feature lists are empty. The DSIG table is absent. A character outside this subset is drawn as ? on the page. `metadata.json` keeps the original character. Page text is composed to Unicode NFC before drawing, so a letter typed as a base letter plus a combining accent prints as the single accented letter. A letter and accent with no single composed character print as the letter followed by the accent. The subset has no mark positioning, so that accent may not sit exactly over the letter.

Unhinted source sizes from the release zip: Regular 431,364 bytes, Bold 432,376 bytes. Subset sizes in this repository: Regular 116,848 bytes (gzip 64,926), Bold 116,952 bytes (gzip 66,762).

The production build on 2026-10-11 puts fontkit and both subset files in one lazy chunk, `pdf-unicode-font-*.js`: 1,023.46 kB, gzip 493.18 kB (Vite's reported gzip). That chunk is loaded only when a coaching PDF contains a character outside basic Latin. The Matchboard workspace chunk from the same build is 342.33 kB, gzip 92.38 kB, and does not contain the font or fontkit. Inside the lazy chunk, the fontkit script without the inlined font data is 711,694 bytes, gzip 329,533. The two inlined base64 font strings gzip to 80,640 and 82,021 bytes. Gzip of the separate pieces is not the gzip of the whole chunk.

## @pdf-lib/fontkit

`@pdf-lib/fontkit` 1.1.1 is pinned in `package.json` with no range. npm package metadata retrieved 2026-10-11 names the license as MIT, the version as 1.1.1 published 2020-11-28, and the unpacked package size as about 4.1 MB. The installed package is 4,282,008 bytes and includes Node and browser builds. Matchboard loads the browser build only from the PDF export chunk. pdf-lib 1.17.1 standard fonts cannot draw past WinAnsi. This package is the font embedder pdf-lib calls through `registerFontkit`. No other tool imports it.

Package: https://www.npmjs.com/package/@pdf-lib/fontkit/v/1.1.1

Registry record: https://registry.npmjs.org/@pdf-lib/fontkit/1.1.1

Authors named by that package: Andrew Dillon (author) and Devon Govett (contributor).

Copyright line: none is published. Checked 2026-10-12. The npm 1.1.1 tarball has no license file and its `package.json` says `"license": "MIT"`. The source repository https://github.com/Hopding/fontkit (a fork of https://github.com/foliojs/fontkit) has no license file and its README says MIT. https://github.com/foliojs/fontkit also has no license file and its README says MIT. The MIT permission notice below applies to `@pdf-lib/fontkit`, by the authors named above.

The Vite production build removes comments, so the notices below are the copy that ships with the coaching PDF chunk.

## Code bundled inside the fontkit browser build

`node_modules/@pdf-lib/fontkit/dist/fontkit.es.js` carries these modules inside its own file. Matchboard ships them in `pdf-unicode-font-*.js`. Versions come from the `yarn.lock` of https://github.com/Hopding/fontkit at `72b8e42bd6a398d496a63a6d483eabeed43861fb` (package version 1.1.0 there; the npm 1.1.1 tarball has no lockfile). Licenses and copyright lines were read from each version's npm tarball on 2026-10-12, except where the row names the fontkit build as the source.

| Module | Version | License | Copyright notice as published |
| --- | --- | --- | --- |
| `base64-js` | 1.3.1 | MIT | Copyright (c) 2014 Jameson Little |
| `ieee754` | 1.1.13 | BSD-3-Clause | Copyright 2008 Fair Oaks Labs, Inc. (full text below) |
| `buffer` | 5.6.0 | MIT | Copyright (c) Feross Aboukhadijeh, and other contributors. |
| Node.js `string_decoder` (from the fontkit build's own header) | — | MIT | Copyright Joyent, Inc. and other Node contributors. |
| `iconv-lite` | 0.4.24 | MIT | Copyright (c) 2011 Alexander Shtuchkin |
| `@pdf-lib/restructure` | 0.0.1 | MIT | No license file; `package.json` author Andrew Dillon |
| `@pdf-lib/unicode-properties` | 0.0.1 | MIT | "Copyright 2018" with no holder named; `package.json` author Andrew Dillon |
| `unicode-trie` | 0.3.1 | MIT | No license file; `package.json` author Devon Govett |
| `tiny-inflate` | 1.0.3 | MIT | Copyright (c) 2015-present Devon Govett |
| `base64-arraybuffer` | 0.1.5 | MIT | Copyright (c) 2012 Niklas von Hertzen |
| `clone` | 1.0.4 | MIT | Copyright © 2011-2015 Paul Vorbach <paul@vorba.ch> |
| `dfa` | 1.2.0 | MIT | No license file; `package.json` author Devon Govett |
| `@pdf-lib/brotli` | 0.0.0 | MIT (package) | No license file; `package.json` author Andrew Dillon |
| Brotli decoder inside `@pdf-lib/brotli` (from the fontkit build's own header) | — | Apache-2.0 | Copyright 2013 Google Inc. All Rights Reserved. Full license: [Apache-2.0.txt](licenses/Apache-2.0.txt) |

[Apache-2.0.txt](licenses/Apache-2.0.txt) is the text from https://www.apache.org/licenses/LICENSE-2.0.txt retrieved 2026-10-12, SHA-256 `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30`.

`ieee754` 1.1.13 license, verbatim:

> Copyright 2008 Fair Oaks Labs, Inc.
>
> Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
>
> 1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
>
> 2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
>
> 3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.
>
> THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

## pdf-lib and pako

The coaching PDF is written with these packages. They ship in the Matchboard workspace chunk; `pako` also ships in `pdf-unicode-font-*.js` because fontkit imports it. Licenses were read from the installed packages on 2026-10-12.

| Package | Version | License | Copyright notice as published |
| --- | --- | --- | --- |
| `pdf-lib` | 1.17.1 | MIT | Copyright (c) 2019 Andrew Dillon |
| `@pdf-lib/standard-fonts` | 1.0.0 | MIT | Copyright (c) 2018 Andrew Dillon |
| `@pdf-lib/upng` | 1.0.1 | MIT | Copyright (c) 2017 Photopea |
| `pako` | 1.0.11 | MIT | Copyright (C) 2014-2017 by Vitaly Puzrin and Andrei Tuputcyn |
| zlib port inside `pako` (`lib/zlib/*.js`) | 1.0.11 | Zlib | (C) 1995-2013 Jean-loup Gailly and Mark Adler; (C) 2014-2017 Vitaly Puzrin and Andrey Tupitsin |

`pdf-lib` also depends on `tslib` 1.14.1, Copyright (c) Microsoft Corporation, license 0BSD. 0BSD does not require a notice.

zlib license from the `pako` 1.0.11 source headers, verbatim:

> This software is provided 'as-is', without any express or implied warranty. In no event will the authors be held liable for any damages arising from the use of this software.
>
> Permission is granted to anyone to use this software for any purpose, including commercial applications, and to alter it and redistribute it freely, subject to the following restrictions:
>
> 1. The origin of this software must not be misrepresented; you must not claim that you wrote the original software. If you use this software in a product, an acknowledgment in the product documentation would be appreciated but is not required.
> 2. Altered source versions must be plainly marked as such, and must not be misrepresented as being the original software.
> 3. This notice may not be removed or altered from any source distribution.

## MIT License

Every row above marked MIT, and `@pdf-lib/fontkit`, is distributed under this permission notice together with the copyright notice listed for it:

> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
