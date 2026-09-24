/**
 * Document rendering — Typst, in a sandboxed worker.
 *
 * ADR-0013. The legacy "official" purchase order PDF is whatever the
 * customer's browser rendered: `jspdf` + `jspdf-autotable` invoked from
 * `POsView.js`, a `'use client'` component. That is unverifiable and tamperable
 * — the document a customer receives is produced by code an attacker controls —
 * and it is why `next.config.mjs` stubs `node:fs`/`node:http`/`node:stream` to
 * `false` inside a `webpack()` block, which is in turn why Turbopack is
 * disabled (**DOC-01**).
 *
 * This module owns the part that must be right regardless of which renderer
 * runs: **tenant input must never become template code.**
 */

import { TERM_KEYS, type Terminology } from '@cog/contracts';

export class RenderError extends Error {
  override readonly name = 'RenderError';
}

/**
 * Escape a value for Typst *content*.
 *
 * Typst is a programming language. `#` begins code, `$` begins math, backslash
 * escapes, and brackets group — so a vendor named `#read("/etc/passwd")` in an
 * unescaped template is code execution inside the renderer, and a BOQ
 * description containing `$` silently becomes a maths block that swallows the
 * rest of the line.
 *
 * ADR-0013 puts it as a rule: templates ship with the release, tenant input
 * enters as JSON data, and data must never become template code. This is the
 * function that makes the rule true.
 */
export function escapeTypst(value: string): string {
  return String(value).replace(/[\\#$_&%~^{}[\]"@<>]/g, (ch) => `\\${ch}`);
}

/**
 * Values a template may be given.
 *
 * Deliberately narrow. A nested object or a function would have to be
 * stringified somewhere, and "somewhere" is where escaping gets skipped.
 * Money arrives already formatted as a string by `packages/money` — it is never
 * a number here, because a number would be formatted by the template and the
 * template is not allowed to know about lakh/crore grouping.
 */
export type TemplateValue = string | number | boolean | null;


export interface RenderRequest {
  /** Names a template that ships with the release. Never a path, never source. */
  readonly template: string;
  readonly data: Readonly<Record<string, TemplateValue>>;
  /** Recorded with the output so a re-render can be compared to what was issued. */
  readonly templateVersion: string;
}

/**
 * The firm's words enter a render as data — Settings › Terminology reaches a
 * document's heading the way it reaches a label. A template reads
 * `sys.inputs.term_boq` and prints it; the word is never template code, so a
 * word is escaped like every other value and can open no maths block. Every
 * pair is bound, always, so a template can rely on the key being there.
 */
export function withTerminology(request: RenderRequest, terminology: Terminology): RenderRequest {
  const words: Record<string, TemplateValue> = {};
  for (const key of TERM_KEYS) words[`term_${key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)}`] = terminology[key];
  return { ...request, data: { ...request.data, ...words } };
}

/** Templates that exist. An allowlist, so a name cannot become a path. */
const TEMPLATES = new Set(['purchase-order', 'payment-advice', 'boq-schedule']);

const KEY = /^[a-zA-Z][a-zA-Z0-9_]*$/;

/**
 * Turn a render request into the Typst `--input` bindings.
 *
 * Every value is escaped. Every key is checked against a strict pattern,
 * because a key is emitted as an identifier and an identifier that contains a
 * `#` is code.
 */
export function bindInputs(request: RenderRequest): Record<string, string> {
  if (!TEMPLATES.has(request.template)) {
    // A template name that is not on the list would otherwise be a path, and a
    // path is `../../` away from reading anything the worker can see.
    throw new RenderError(`unknown template: ${request.template}`);
  }
  if (request.templateVersion.trim() === '') {
    // Without it, an archived PDF cannot be tied to the code that produced it,
    // and "show me the document you issued" has no verifiable answer.
    throw new RenderError('a render must record its template version');
  }

  const bound: Record<string, string> = {};
  for (const [key, value] of Object.entries(request.data)) {
    if (!KEY.test(key)) throw new RenderError(`unsafe template key: ${key}`);
    bound[key] = value === null ? '' : escapeTypst(String(value));
  }
  return bound;
}

/**
 * What gets archived alongside the rendered bytes.
 *
 * ADR-0013: archive the PDF **with its template version and input snapshot**.
 * The auditor's question is "show me the document you issued", not "re-render
 * it identically" — which is what makes renderer determinism a secondary
 * concern and the snapshot the primary evidence.
 */
export interface RenderArchive {
  readonly template: string;
  readonly templateVersion: string;
  readonly inputs: Readonly<Record<string, string>>;
  readonly renderedAt: string;
  /** sha256 of the produced bytes. */
  readonly checksum: string;
}

export function archiveRecord(
  request: RenderRequest,
  checksum: string,
  renderedAt: Date,
): RenderArchive {
  if (!/^[0-9a-f]{64}$/.test(checksum)) {
    throw new RenderError('an archive record needs a sha256 checksum of the rendered bytes');
  }
  return {
    template: request.template,
    templateVersion: request.templateVersion,
    inputs: bindInputs(request),
    renderedAt: renderedAt.toISOString(),
    checksum,
  };
}

/**
 * The sandbox the renderer must run under.
 *
 * Stated as data so it can be asserted in a test rather than living only in a
 * Dockerfile comment. ADR-0013: no network, no filesystem beyond a temp dir.
 */
export const SANDBOX = Object.freeze({
  network: false,
  writableRoot: false,
  /** Only this, and it is emptied after every render. */
  tempDirOnly: true,
  /** Typst's own `read()` can reach the filesystem, so the dir is empty too. */
  templatesReadOnly: true,
});
