# ADR-0013: Typst for document rendering, in a sandboxed worker

- **Status:** Accepted
- **Date:** 2026-09-03

## Context

The legacy app generates PDFs with `jspdf` + `jspdf-autotable` + `html2pdf.js`,
invoked from `components/views/POsView.js` — a `'use client'` component. **The
"official" purchase order PDF is therefore whatever the customer's browser
rendered**, which is unverifiable and tamperable.

Those libraries also drag Node built-ins into the browser bundle, which is why
`next.config.mjs` stubs `node:fs`/`node:http`/`node:stream`/`node:zlib` to
`false` inside a `webpack()` function — and why the project forces `--webpack`
despite a `turbopack` block sitting directly above it.

The documents owed are purchase orders, BOQ schedules (hundreds of rows), TDS
Form 281 challans, RA bills and progress reports. The generation surface today
is only 2 files, so this is the cheapest moment to change it.

## Decision

**Typst**, with the binary baked into a queue-driven worker image.

- Rendering runs in a **sandboxed worker**: no network, no filesystem beyond a
  temp dir.
- **Templates ship with the release.** Tenant input enters as JSON data only and
  **must never become template code**.
- **The rendered PDF is archived** with its template version and input snapshot,
  to versioned/WORM object storage.

## Consequences

- Multi-page tables work properly — `table.header` repeats across pages, breaks
  are controllable. This is precisely where `jspdf-autotable` and HTML-to-PDF
  fail, and a BOQ is hundreds of rows.
- Milliseconds per render from a small Rust binary, against roughly 200 MB RSS
  per Chromium worker.
- Statutory layouts like Form 281 need exact positioning, which is what a
  typesetting language is for and what CSS print is not.
- **It is not a second backend language.** It is a template format invoked with
  JSON — the same category of dependency as ffmpeg. The worker around it is
  TypeScript, so ADR-0011 is not violated.
- Moving rendering off the client is a security fix in its own right, and it
  removes the Node-polyfill block, **which unblocks Turbopack**.
- Archiving the artifact means renderer determinism is a secondary concern: the
  auditor's question is "show me the document you issued", not "re-render it
  identically".
- Typst is a skill a future hire will not have. Templates are small and
  learnable, but it belongs on the onboarding list.

**Indic text shaping was raised as the main risk** — Typst shapes via rustybuzz
and is a 0.x typesetter, where conjuncts and matras can fail quietly. **This is
not applicable: documents are English-only.** A helper is still needed for
lakh/crore digit grouping (`₹1,23,45,678`), which is number formatting rather
than text shaping. Should non-English documents ever be required, re-open this
ADR and spike before committing.

## Alternatives considered

**`@react-pdf/renderer`** — the tempting wrong answer. Same language and a
React-like API, but complex tables with carried-forward subtotals and controlled
page breaks are chronically painful, and long documents degrade badly.

**Playwright / Chromium to PDF** — HTML and CSS already known, and Indic shaping
is battle-tested. Rejected on pagination pain for long tables and memory cost
per render. Retained as the fallback if Typst ever proves unworkable, pinned by
container digest with vendored fonts.

**JasperReports** — mature and built for exactly this. Rejected: it drags a JVM
into a TypeScript shop for one capability.
