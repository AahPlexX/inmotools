# FC-37 Manufacturer Catalog Provenance Research

**As of:** 2026-09-19  
**Scope:** FC-37 universal floss palette matching for DMC, Anchor, Madeira, and Sullivans.  
**Decision status:** blocked on redistribution/provenance, not on color-distance code.

## Question

Can InmoTools ship complete, authoritative manufacturer color catalogs for DMC, Anchor, Madeira, and Sullivans inside the local-first Fiber Craft Workstation without inventing color values, relying on third-party conversion tables, or violating first-party usage restrictions?

## Findings

### DMC

- DMC's printed color card product page currently states **489 colors of Six-Strand Embroidery Floss**.
- DMC's threaded shade-card page states **485 solid Six-Strand Embroidery Floss colors**, showing that even first-party catalog counts can differ by product/version and should not be flattened without provenance.
- DMC's current Terms and Conditions state that DMC Color Cards and other proprietary content are protected by copyright and that reproduction without prior written consent is strictly prohibited, specifically calling out conversion cards.

**Operational implication:** do not scrape, transcribe, or bundle a DMC color card/conversion card as an embedded catalog unless written permission/licensing is obtained.

Sources:
- https://www.dmc.com/US/en/products/printed-color-card
- https://www.dmc.com/US/en/products/floss-color-card-mouline-pearl-cotton
- https://www.dmc.com/CA/en/terms-and-conditions

### Anchor

- Anchor's official shade-card page states **444 solid Stranded Cotton colors**, plus ombre and multicolor ranges.
- Anchor's Terms of Sale state that customers are not authorized to download or modify all or part of the website content and that the website or any part of it may not be reproduced, copied, sold, or commercially exploited without express written permission.

**Operational implication:** do not build the shipped Anchor catalog by scraping/transcribing Anchor product pages or shade-card content without permission.

Sources:
- https://anchorcrafts.com/products/anchor-embroidery-thread-shade-card
- https://anchorcrafts.com/products/anchor-stranded-cotton-mouline
- https://anchorcrafts.com/policies/terms-of-sale

### Madeira

- Madeira's official Classic color-card page states **422 colors represented with original threads** and says original color cards should be used for color samples.
- Madeira product pages explicitly warn that colors displayed digitally do not exactly match the actual thread colors.
- Madeira also exposes an official Pantone conversion download, but no redistribution license for embedding a complete derived catalog was found in the first-party material reviewed.

**Operational implication:** website RGB values are not authoritative enough for FC-37's nearest-color matching. A trustworthy Madeira matcher needs licensed manufacturer data or independently measured physical swatches with documented provenance.

Sources:
- https://shop.madeira.com/en/accessories/colorcards/classic.htm
- https://shop.madeira.com/en/threads/viscose-classic/11/classic-no.40.htm

### Sullivans

- Sullivans publishes an official DMC-to-Sullivans conversion chart.
- Current Six-Strand product pages state **489 solid colors** and expose Sullivans numbers, names, and comparable DMC numbers.
- An older official color-card page still describes **454 solid colors**, so the catalog has version drift and must be versioned if imported.
- No first-party redistribution license for embedding the complete conversion/catalog dataset was found in the official materials reviewed.

**Operational implication:** the official data is useful for verification, but it should not be copied wholesale into the shipped app without explicit redistribution permission or another clearly licensed provenance route.

Sources:
- https://www.sullivansusa.net/wp-content/uploads/2021/09/Conversion-Chart-from-DMC.pdf
- https://www.sullivansusa.net/product/six-strand-embroidery-floss-color-card/
- https://www.sullivansusa.net/product/sullivans-six-strand-embroidery-floss-group-46-bulk/

## Existing code

`src/tools/fiber-craft/engines/floss-matcher-engine.ts` already provides a generic CIEDE2000 nearest-match engine using the pinned `culori@4.0.2` dependency. That code is not the blocker.

## Wayfinder decision

**Do not mark FC-37 complete and do not add scraped/community manufacturer color tables.** The implementation is blocked until the catalog data has a defensible provenance and redistribution path.

Acceptable routes, in descending preference:

1. **Written manufacturer permission/license** for the complete machine-readable color catalog(s), including code/name/color values needed for local matching.
2. **Manufacturer-supplied licensed machine-readable dataset/API** whose terms explicitly permit the required local redistribution/cache behavior.
3. **Independently measured physical swatches** with documented measurement methodology and provenance, while keeping manufacturer identifiers limited to what is legitimately usable.
4. **User-supplied catalog import** as a capability, if the product requirement is explicitly revised so InmoTools does not bundle the protected manufacturer datasets.

Until one of those routes is chosen and evidenced, FC-37 remains partial and the function ledger stays unchanged.

## Next decision

Choose whether FC-37 should:
- pursue manufacturer permission/licensing as the canonical route while other independent Fiber functions continue, or
- revise the product requirement to a user-supplied catalog-import model.

Do not silently weaken the original requirement.