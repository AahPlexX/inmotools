# HAR Sanitizer

Local review tool for HTTP Archive files. Route: `#/tools/har-sanitizer`.

Files: `har-engine.ts`, `HarWorkspace.tsx`, `HarWaterfallCanvas.tsx`. Tests: `tests/unit/har.test.ts`, `tests/e2e/har.spec.ts`.

## What it does

A HAR is read only in this browser. The engine keeps unsafe JSON numbers as their original lexemes, lists credential locations without printing the values, and builds a reviewed download. Replacement modes are `[REDACTED]`, SHA-256, and a custom mask. SHA-256 is a stable stand-in, not encryption.

Categories:

- Sensitive headers, cookies, URL/query credentials, and form or JSON bodies. These start on.
- Email addresses and IP addresses. These start off so an existing review policy is unchanged until you opt in.
- Extra field names you type, matched case-insensitively.

IP hiding covers `serverIPAddress`, forwarding headers (`X-Forwarded-For`, `X-Real-IP`, `Forwarded`, `CF-Connecting-IP`, `True-Client-IP`, `X-Client-IP`), and IP literals in bodies. A URL whose host is an IP becomes `redacted.invalid` so the rest of the URL still parses.

On-screen URLs hide userinfo and sensitive query values even before export. The downloaded file follows the mode you picked.

## Waterfall

HAR timing `-1` means "does not apply" and is drawn as zero. TLS is nested inside connect in the HAR 1.2 spec, so connect is drawn with TLS removed and TLS gets its own bar. The canvas windows rows to the scrollport (`clamp(220px, 52vh, 520px)`) instead of painting the whole capture at once. The request table is the same filtered set, paged, and usable without the canvas.

## Export

Prepare builds the cleaned HAR in memory. Download stays disabled until that review exists. Finding CSV contains category, request number, and path only.

## Not in this tool

No upload, no remote analyzer, and no live capture. Replay of a sanitized HAR is a support share, not a byte-identical proxy log. Custom patterns beyond field names, emails, and IPs are out of scope.

## Checks

`pnpm exec vitest run tests/unit/har.test.ts`

`pnpm exec playwright test tests/e2e/har.spec.ts`

## Fixes

- 2026-10-01 — A URL's `user:password@host` was also reported as an email address, so a fully cleaned HAR still listed 2 "remaining" findings when the optional email category was off. The email check now ignores URL user info (it is already reported as a credential under URL and query). Unit test: "reports URL user:password as a credential, not as an email address". The browser test now matches the current review wording ("0 unsanitized locations remain").
