import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * One document per test.
 *
 * `@testing-library/react` registers this itself when the test framework
 * exposes `afterEach` as a global. This repo does not use Vitest globals —
 * every other suite imports `describe` / `it` / `expect` explicitly — so the
 * cleanup has to be registered here instead.
 *
 * Without it the second test in a file renders into a document that still holds
 * the first one's markup, and the failure reads `Found multiple elements with
 * the role "button"` — which looks like a component rendering two buttons
 * rather than like two tests sharing a page.
 */
afterEach(cleanup);
