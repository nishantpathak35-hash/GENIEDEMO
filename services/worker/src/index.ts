/**
 * `services/worker` — the queue worker.
 *
 * CPU-bound work never runs in the request path: Node is single-threaded per
 * process, so a Typst render or a large BOQ export in a handler stalls every
 * other request on that instance (ADR-0011).
 *
 * Jobs run on pg-boss against the same Postgres — no Redis, so one less
 * container to operate and one less thing to back up, and enqueue is
 * transactional with the data it acts on (ADR-0010).
 */

export {
  escapeTypst,
  bindInputs,
  archiveRecord,
  RenderError,
  SANDBOX,
  type RenderRequest,
  type RenderArchive,
  type TemplateValue,
} from './domain/typst-render.js';
