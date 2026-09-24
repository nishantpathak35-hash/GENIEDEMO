# ADR-0004: Tally integration via staged XML and an on-prem connector

- **Status:** Accepted · re-drafted 2026-09-03 (originally decided 2026-08-16)
- **Deciders:** Product owner

## Context

Tally is the accounting system of record for most Indian contractors. It exposes
an HTTP XML interface, but only on the local machine, typically
`http://127.0.0.1:9000` with "Act as Server" enabled.

The legacy code posts vouchers server-side:

```js
// app/api/tally/push/route.js
response = await fetch('http://127.0.0.1:9000', { ... })
```

This works on localhost only. Once hosted (ADR-0003), `127.0.0.1` is the
**application server itself**, not the customer's Tally machine. The feature is
not merely broken in the cloud — it is architecturally impossible as written.

## Decision

Split the integration in two:

1. **Cloud side** (`svc-finance`) generates Tally XML vouchers and **stages**
   them in a queue table with status, attempt count and last error.
2. **On-prem side** (`tally-connector`) is a small agent the customer installs
   on the machine running Tally. It polls the cloud for pending vouchers, posts
   the XML to local `:9000`, and reports results back.

The connector holds no business logic and no database. It is a pipe with retries.

## Consequences

- `tally-connector` must be its own repository and its own release artifact.
  It is installed on someone else's machine and upgraded on their schedule, so
  it **must stay backwards-compatible with cloud releases months older than
  itself**. This is the only forced repo split in the system.
- Sync becomes asynchronous and observable: a voucher has a state, a history and
  a retry policy, rather than succeeding or throwing inline.
- Customers must install and keep a component running. Onboarding gains a step,
  and "the connector is down" becomes a support category.
- Vouchers accumulate safely while Tally or the customer's machine is offline.

## Alternatives considered

**Expose the customer's Tally to the internet.** Rejected: Tally's HTTP
interface has no authentication. This would be negligent.

**VPN or reverse tunnel into the customer's network.** Rejected: requires the
customer's IT to provision access per tenant, which is a longer sale than the
product warrants at this stage.

**Export files for manual import.** Rejected: it is not an integration, and
manual re-keying is the problem the product exists to remove.
