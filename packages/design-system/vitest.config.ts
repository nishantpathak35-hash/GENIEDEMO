import { defineConfig } from 'vitest/config';

/**
 * The only package in this repo with a DOM.
 *
 * **Why it needs one when nothing else does.** Every other test here runs
 * against a value: `packages/money` multiplies, `packages/contracts` parses,
 * the services answer a request. Their subject is a return value, and a `node`
 * environment is the honest place to check one.
 *
 * This package's subject is a rendered form, and three of the four properties
 * worth asserting about it are not visible in a return value at all:
 *
 *   - what a `<form>` SUBMITS is `FormData`, built by the DOM from the fields
 *     it contains. `Picker` returns a `<select>` and a nameless `<input>`, and
 *     the claim being tested — that a vendor's id is submitted and the typed
 *     text never is — is a fact about that FormData, not about the JSX.
 *   - `required` refusing an empty field is the DOM's constraint validation.
 *     Asserting the attribute is present tests that somebody typed the
 *     attribute; asserting the form will not submit tests the behaviour.
 *   - `Picker` holds state across two interactions. "The chosen option survives
 *     a search that excludes it" needs a second render caused by a first one.
 *
 * jsdom rather than happy-dom, and the reason is narrow: constraint validation.
 * jsdom implements `checkValidity`, `validity.valueMissing`, `validationMessage`
 * and blocks `requestSubmit()` on an invalid form. That is the whole subject of
 * one of these suites, and testing it against a DOM that only partly implements
 * it would produce failures nobody could attribute.
 *
 * The tests deliberately assert NO MARKUP. A test that pins a class name or an
 * element order fails on every restyle while proving nothing, and this package
 * exists to be restyled.
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.tsx', 'tests/**/*.test.ts'],
    // Each file gets a fresh document. `Picker` and `Form` both hold state, and
    // a leaked one is the flake that looks like a race.
    restoreMocks: true,
  },
});
