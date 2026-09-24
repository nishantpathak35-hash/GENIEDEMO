# NOTICE — the token sources in this folder

This folder holds the published token values the design set is built on. Nothing else of the design
system — no icon, illustration, logo, typeface or component code — is copied anywhere in this repository;
the drawings and icons in the set are this product's own (see `../illustrations.mjs`, `../icons.mjs`).

## From the npm package `@atlaskit/tokens`, version **17.0.0**

Verified 19 September 2026 against the npm registry metadata for `@atlaskit/tokens@17.0.0`, which declares
`"license": "Apache-2.0"`, and against the package's own `LICENSE` file, which reads in full:

> Copyright 2019 Atlassian Pty Ltd
>
> Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in
> compliance with the License. You may obtain a copy of the License at
> http://www.apache.org/licenses/LICENSE-2.0
>
> Unless required by applicable law or agreed to in writing, software distributed under the License is
> distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
> See the License for the specific language governing permissions and limitations under the License.

That file is copied beside this one as `LICENSE`. Apache-2.0 permits copying and redistribution of these
files with the licence and this notice; they are unmodified.

| File | Package path | What the build reads from it |
|---|---|---|
| `theme-light-17.0.0.js` | `dist/esm/artifacts/themes/atlassian-light.js` | every light-theme colour value, as a cross-check of the documentation read and as the source for any token the documentation does not list |
| `theme-dark-17.0.0.js` | `dist/esm/artifacts/themes/atlassian-dark.js` | the same for dark |
| `motion-17.0.0.css` | `dist/esm/artifacts/themes/atlassian-motion.js` (its CSS block) | the component-level motion tokens and their keyframes |
| `typography.js` | `dist/esm/artifacts/themes/atlassian-typography.js` | the numeric font weights the documentation names but does not print |

Two byte-identical copies of the theme files (`tokens-light.js`, `tokens-dark.js`) were deleted on
19 September 2026; the build reads the versioned names above.

## Read from the documentation site

`primitives.json` (150 palette values) and `semantic.json` (591 semantic tokens: the palette name each takes in
light and dark, and its one-line description) were read on 16–17 September 2026 from the public documentation
pages named in `SOURCES` in `../tokens.mjs`, not from the package. They are tables of names and values — the
same names, values and descriptions the Apache-2.0 package ships in its `dist/esm/artifacts/tokens-raw/`
artifacts — kept as the record of what was read, with the read dates. The documentation site's own terms have
not been verified for this copy; if that matters, regenerate both files from the package's raw artifacts at
build time (a script, not a copy) — recorded in `README.md` as the open licence question.
