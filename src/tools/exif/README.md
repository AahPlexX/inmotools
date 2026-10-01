# EXIF Scrubber

Local inspection and sanitizing for JPEG, PNG, WebP, and HEIC/HEIF images. Files stay in the browser.

## What it does

- Reads metadata with ExifReader and groups fields as location, device, identity, time, or camera setting.
- Strip embedded metadata removes EXIF, XMP, IPTC, comments, PNG text/`eXIf`/`tIME`/`caBX` chunks, and WebP `EXIF`/`XMP ` chunks without recompressing the image. JPEG color profiles stay unless the user turns that off. Animation chunks stay.
- Rebuild pixels draws a new image. Use it to change format or to drop a payload that lives in the pixels. It recompresses JPEG and WebP, paints transparency onto a chosen JPEG background, and keeps only the first frame of an animation after an explicit confirmation.
- HEIC/HEIF can be inspected. Stripping that container is not implemented. Rebuilding works only when the browser can decode the file.
- Batch ZIP names are prefixed so two identical filenames do not collide. A JSON inspection report is local and includes the original values.

## Limits

Strip does not claim to remove data hidden in pixel values. “No privacy fields found” means the inspector did not see location, device, identity, or time fields. Canvas size limits still apply to rebuild. Very large files are bounded by browser memory.

## Checks

Unit coverage lives in `tests/unit/exif.test.ts`. Browser coverage lives in `tests/e2e/exif.spec.ts`.
