---
tool: exif-scrubber
folder: src/tools/exif
doc: spec
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-01-exif-scrubber-design.md
tracker: src/tools/exif/TRACKER.md
updated: 2026-10-01
---

# EXIF Scrubber — spec

As built at `49c444d4` (last code change under `src/tools/exif/`). Requirement prefix: `EXF`. Status of each requirement: [TRACKER.md](../../../src/tools/exif/TRACKER.md). Behaviour notes: [README.md](../../../src/tools/exif/README.md).

## Purpose

Show which privacy-sensitive metadata an image carries (location, device, identity, time) and produce a cleaned copy, entirely in the browser, for anyone sharing photos.

## Scope

In scope:
- JPEG, PNG, WebP and HEIC/HEIF inspection; JPEG, PNG and WebP stripping without recompression; pixel rebuild with format change.
- Single files and batches, per-file download, batch ZIP and a JSON inspection report.

Out of scope:
- Removing data hidden in pixel values (steganography): stripping works on the container, and the README states this limit.

## Constraints

- Platform rules: no accounts, no server or database, everything runs in the browser ([DOCUMENTATION_STANDARD.md](../../DOCUMENTATION_STANDARD.md#platform-rules-apply-to-every-tool-and-every-spec)).
- Metadata is read with ExifReader; pixel rebuild uses the browser canvas, so canvas size and decoder support limit it.

## Requirements

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| EXF-R01 | Choose or drop one or more JPEG, PNG, WebP or HEIC/HEIF images | Files appear in the list |
| EXF-R02 | Fields are classified as location, device, identity, time or camera setting; camera settings are not counted as privacy fields; IPTC location and byline fields are caught | Classification matches the tag maps |
| EXF-R03 | The inspector says plainly when no location, device, identity or time fields were found | "Checked. No location, device, identity, or time fields found." |
| EXF-R04 | A field filter narrows the shown fields; values and the privacy-field list can be copied | Filter narrows rows; copy puts text on the clipboard |
| EXF-R05 | Strip mode removes EXIF, XMP, IPTC, comments, PNG text/`eXIf`/`tIME`/`caBX` chunks and WebP `EXIF`/`XMP ` chunks without recompressing the image data | JPEG scan, PNG image data and WebP image data unchanged after stripping |
| EXF-R06 | The JPEG color profile is kept unless turned off | Turning the option off removes the ICC profile |
| EXF-R07 | Stripping keeps animation; animated PNG and WebP are detected | APNG and animated WebP detected; animation chunks kept |
| EXF-R08 | Rebuild mode draws new pixels, can change format and quality, paints JPEG transparency on a chosen background, and flattens an animation to its first frame only after explicit confirmation | JPEG background option shown; animation needs confirmation |
| EXF-R09 | HEIC/HEIF can be inspected; stripping it is refused with an explanation, and rebuilding works only when the browser can decode it | HEIC strip shows the explanation |
| EXF-R10 | Every sanitized copy is inspected again and the result reported | "Checked again. No privacy fields found." |
| EXF-R11 | Output names are non-destructive (`-sanitized`) with the extension of the encoded type | `private-sanitized.png` |
| EXF-R12 | Per-file download, preview and removal; failed files can be retried | Remove takes the file out of the list |
| EXF-R13 | Batch ZIP download with prefixed names so identical filenames do not collide | `exif-sanitized-batch.zip` downloads |
| EXF-R14 | Download a local JSON inspection report including the original values | Report downloads |
| EXF-R15 | Leaving the tool during encoding prevents a later download | No download after leaving |
| EXF-R16 | Stripping HEIC/HEIF containers without rebuilding pixels | HEIC strip removes metadata and keeps the image data |
| EXF-R17 | No serious or critical axe violations | Catalog-wide accessibility spec for this route |
| EXF-R18 | No horizontal overflow and controls usable from 320 px to 2560 px | Viewport check at the standard widths |
| EXF-R19 | Workspace follows the site-wide theme (light, dark, system) from TASK-028 | Workspace switches with the site theme; axe passes in both themes |

## Definition of done

The tool is complete when every requirement is `verified` or `not planned`, and the completion gates in `.tasks/PROJECT_COMPLETION.md` are met.

## Intent not recorded

- EXF-R16 is listed as "not implemented" in the README. HEIC is an ISO BMFF container that can be edited in the browser, so it falls under the default integration rule; no design exists yet.
- The catalog title says "Media" and "Geotag Redactor", but the tool handles still images only. Unknown: whether video metadata (for example MP4 location atoms) is wanted or the title should say "Image".

## Change log

- 2026-10-01 — Created as an as-built spec from `src/tools/exif/`, its README, the catalog entry and the tool's tests.
