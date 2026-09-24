# /connector/v1 — open questions

**Status:** open · **Raised:** 2026-09-04 · **Decision owner:** product owner,
in coordination with the `tally-connector` session

Four recommended changes to the frozen contract, from an adversarial review of
it. **None has been applied.** `packages/contracts/src/connector.ts` encodes the
contract exactly as frozen, with a `HUMAN(CONNECTOR-nn)` marker at each point —
changing the shape while another session codes against it is precisely what the
brief forbids.

They are grouped here because they are cheap now and expensive after either side
ships: the connector runs on machines we do not control and must stay
compatible with a cloud release eighteen months newer than itself.

---

## The finding underneath all four

**Leasing solves the wrong half of the problem.** It prevents two connectors
being *handed* the same voucher. It does nothing to prevent the same voucher
*reaching Tally twice*, which is what corrupts a book of account. Three
interleavings where leasing is irrelevant:

1. **Lease expires mid-POST.** Tally is single-threaded; with a modal dialog
   open its HTTP server blocks until a human presses a key. The connector starts
   posting at t=299s, Tally commits at t=340s, and another instance polled at
   t=301s and posted the same voucher.
2. **Post succeeds, connector crashes before reporting.** The voucher is in
   Tally, the lease expires, the cloud re-offers it.
3. **The result report is lost in transit.** Same outcome.

The durable fix is cloud-side and needs no wire change: a stable `REMOTEID` on
every `<VOUCHER>` so Tally itself can deduplicate. That is M3 work in
`services/finance` and is tracked there, not here.

> **Needs verification against a real Tally before it is relied on.** Whether a
> second `ACTION="Create"` with an existing `REMOTEID` is treated as an
> alteration or a second insert differs between Tally ERP 9 and TallyPrime, and
> Tally publishes no specification. This came from integrator experience, not
> documentation.

---

## CONNECTOR-01 — add `status: "unknown"`

**Where:** `voucherResultStatus`

A POST can time out because Tally is blocked on a dialog, and Tally then
processes the request anyway. With only `posted | failed` the connector has to
guess: reporting `failed` duplicates the voucher on retry, reporting `posted`
loses it. This case is common, not exotic.

**Proposed:** `"posted" | "failed" | "unknown"`. The cloud moves an `unknown` to
`NEEDS_VERIFY`, does not count an attempt, and flags it in `apps/admin`.

---

## CONNECTOR-02 — define when `attempts` increments

**Where:** `voucher.attempts`

The contract exposes the field and never says what it counts. The two readings
fail in opposite directions:

| Increments on | Failure |
|---|---|
| hand-out | A connector that leases 50 and crash-loops dead-letters all 50 in ~25 minutes, with nothing having reached Tally |
| any reported failure | Tally closed over a weekend exhausts the budget by Friday evening; Monday's queue is entirely dead-lettered |

**Proposed:** count **permanent** failures only. Hand-out does not count,
transient codes do not count and instead trigger tenant-level backoff, and
`unknown` does not count. Connectors must not branch on the value.

---

## CONNECTOR-03 — make `error.code` a closed enum

**Where:** `voucherResultError.code`

Unlike `kind`, this one must **not** be open: the connector observes the Tally
response and the cloud decides the consequence, so both sides have to share the
vocabulary. Today "Tally is closed" and "this ledger does not exist" are
indistinguishable and share one retry budget.

**Proposed**, with a transient/permanent class attached to each:

| Code | Class |
|---|---|
| `TALLY_UNREACHABLE` | transient, tenant-level |
| `TALLY_TIMEOUT` | transient, per-voucher → report `unknown` |
| `TALLY_COMPANY_NOT_OPEN` | transient, tenant-level |
| `TALLY_REJECTED` | permanent — message carries Tally's `LINEERROR` verbatim |
| `TALLY_BAD_RESPONSE` | unknown |
| `CONNECTOR_INTERNAL` | transient |

---

## CONNECTOR-04 — make `X-Connector-Instance` required

**Where:** `CONNECTOR_HEADERS.instance`

The contract currently says a connector that omits the header gets the old
unleased behaviour, "so older builds keep working unchanged". There are no older
builds — nothing has shipped. The carve-out protects a population of zero and
re-opens the exact hole leasing was added to close.

**Proposed:** require the header; drop the unleased path.

---

## Also recommended, smaller

- **Define "posted".** Currently unspecified, which by omission re-creates the
  legacy bug ADR-0014 records — treating HTTP 200 as success when Tally answers
  200 while rejecting. Proposed: 200 **and** the body parses as `<RESPONSE>`
  **and** `ERRORS`=0 **and** `IGNORED`=0 **and** `EXCEPTIONS`=0 **and**
  `CREATED+ALTERED ≥ 1` **and** no `LINEERROR`.
- **A `posted` report is accepted unconditionally** — any instance, any version,
  lease held or not, even when rate-limited or version-gated. It is a fact about
  Tally, not about the queue. Only a revoked key may refuse it. Today a 426 or
  429 on the result endpoint turns an already-posted voucher into a re-post.
- **One `xml` = one voucher = one POST**, sequential, never concurrent. A batched
  envelope returns aggregate counts (`CREATED=47 ERRORS=3`) that cannot be
  mapped back to ids.
- **Report each result immediately**, not at the end of a batch.
- **Gate `426` on `GET /vouchers` only.** Gating `/health` is self-defeating —
  it is how a connector learns what to upgrade to — and gating `POST /result`
  would strand vouchers that are already in Tally.

---

## Related, and already in the schema

Three findings from the same review landed in M1 rather than waiting, because
they changed a table shape and touching a two-reviewer migration twice is worse
than deciding early. See `docs/plans/M1.md` D7:

- multiple simultaneously-active connector keys, so rotation has an overlap
  window and is not an outage per customer machine;
- `expires_at` on a key, surfaced through `/health`;
- a `connector_instances` registry, which is how a single machine is disabled
  without moving to per-machine keys.
