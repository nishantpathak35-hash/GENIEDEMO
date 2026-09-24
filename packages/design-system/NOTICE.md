# NOTICE — where the kit's token values come from

`src/styles.css` opens with the token block of `docs/design/tokens.css` as committed
at `a45a9b4` (blob `7d4715d0`), verbatim: the published palette of a design system,
that system's semantic tokens in light and dark, and this product's own component names,
each pointing at a semantic token. The values were read from the system's published
token package and its documentation site (the read dates, the sources and every value
our gates moved to the nearest step on its own ramp are in `docs/design/00-foundations.html`
under *Provenance* and in `docs/design/TOKEN-DIFF.md`); the package's licence text and
the copied token artifacts sit beside the design's build in `docs/design/build/ads/`, with
its own `NOTICE.md` and `LICENSE`.

**What the product uses of that system: its tokens and its anatomy, as published values
and measurements.** Nothing else — none of its drawings, icons, illustrations, logos or
typeface is copied anywhere in this repository. Every icon, duotone and illustration the
kit renders is this product's own (`src/drawings.tsx`, generated from
`docs/design/build/icons.mjs`, `duotone.mjs` and `illustrations.mjs`, each drawn from its
plain subject on the published grid); the typeface is Inter under the OFL, vendored in
`src/fonts/` with its licence.

**The licence question is flagged, not settled** (`docs/design/README.md`, item 20). The
system's component packages declare Apache-2.0, which permits copying the token files
with their notice; the system's site licence grants use in connection with add-ons to its
owner's products and forbids derivative works, and the two token tables the design read
from the documentation site rather than the package carry that site's terms. Whether the
site licence's scope reaches this use is for the owner's legal advice. This notice travels
with the kit so the question travels with the product.
