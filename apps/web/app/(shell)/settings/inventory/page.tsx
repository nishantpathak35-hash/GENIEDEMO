import type { ReactNode } from "react";
import { API_ROUTES } from "@cog/contracts";
import { apiAsCaller } from "../../../../lib/api";
import { AbsentNotice, Empty, PageHeader, Pager, Pill, Refusal, Section, UnreachableState, load } from "@cog/design-system";
import { pageLinks, pageState } from "../../../../lib/paging";
import { RetireLocationButton, StockLocationForm } from "./forms";

export const metadata = { title: "Inventory costing · Settings" };
export const dynamic = "force-dynamic";

/** Settings › Stock locations — the hub's card, opened. */
const HEADER = <PageHeader crumbs={[{ href: '/settings', label: 'Settings' }]} title="Stock locations" sub="The stores — a site’s or the firm’s." />;

/**
 * How stock is valued — INV-03, answered provisionally.
 *
 * Read-only on purpose. There is exactly one implemented method, and a picker
 * offering FIFO next to it would be a setting that appears to take effect and
 * does not. When a second method exists this becomes a choice; until then it is
 * a statement of what is happening, and of how confident anybody should be
 * about it.
 */
export default async function InventoryCostingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<ReactNode> {
  const params = await searchParams;
  const paging = pageState(params);
  const client = await apiAsCaller();
  const [policy, locations, projects] = await Promise.all([
    load(client, API_ROUTES.costingPolicy, {}),
    load(client, API_ROUTES.listStockLocations, { query: { ...paging.query, includeRetired: "true" } }),
    // a lookup: the widest window the endpoint allows
    load(client, API_ROUTES.listProjects, { query: { limit: "200" } }),
  ]);

  if (policy.kind === "unreachable") return <UnreachableState />;
  if (policy.kind === 'refused') {
    return (
      <>
        {HEADER}
        <Section title="Stock locations">
          <Refusal error={policy.error} />
        </Section>
      </>
    );
  }

  return (
    <>
      {HEADER}
      <Section bare title="Costing method">
        <div className="card-b">
          <dl className="kv">
            <dt>Method</dt>
            <dd>
              Moving weighted average{" "}
              <Pill tone={policy.data.status === "confirmed" ? "ok" : "warn"}>
                {policy.data.status === "confirmed"
                  ? "Confirmed"
                  : "Provisional"}
              </Pill>
            </dd>
            <dt>What that means</dt>
            <dd>
              Every receipt blends its own price into the average. An issue
              takes value out in the same proportion as quantity, so issuing
              stock never moves the average. A transfer carries the dispatched
              stock&rsquo;s own cost to the destination.
            </dd>
          </dl>
          <p className="muted u-mb0">
            This is what the previous system does, read from its code rather
            than from a decision anybody recorded. A finance director choosing
            FIFO instead is a change to one row, not a release — but the second
            method is not written yet, so today this is the only answer
            available.
          </p>
        </div>
      </Section>

      <AbsentNotice title="There is no unit-cost figure anywhere, and that is on purpose">
        A unit cost is value divided by quantity, and dividing rounds. Store the
        quotient and the ledger stops adding up — multiply the rounded unit
        costs back against their quantities and the total no longer matches the
        one it came from. Value and quantity are both exact whole numbers here,
        their sums are exact, and the division happens once, when somebody
        looks. The previous system keeps a single <code>unit_price</code> column
        that every goods receipt overwrites, which is neither a cost basis nor
        an average.
      </AbsentNotice>

      <Section bare
        title="Stock locations"
        {...(locations.kind === "ok" ? { sub: `${locations.data.count} registered` } : {})}
      >
        {locations.kind !== "ok" ? (
          <div className="card-b">
            {locations.kind === "refused" ? (
              <Refusal error={locations.error} />
            ) : (
              <p className="muted u-mb0">The locations could not be read.</p>
            )}
          </div>
        ) : locations.data.count === 0 ? (
          <Empty illustration="stock" title="No locations registered">
            Register the stores and site stores you keep stock in below. Receipts and issues already
            recorded keep the store names they were written with.
          </Empty>
        ) : (
          <div className="tbl-wrap">
            {/* Name(1) · Kind(2) · State(3, decision) · action */}
            <table className="tbl" data-priority>
              <thead>
                <tr>
                  <th data-p="1">Name</th>
                  <th data-p="2">Kind</th>
                  <th data-p="3">State</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {locations.data.items.map((loc) => (
                  <tr key={loc.id}>
                    <td data-p="1">{loc.name}</td>
                    <td data-p="2" data-label="Kind">
                      {loc.kind === "site"
                        ? `Site store${loc.projectId === null ? "" : ` · ${projects.kind === "ok" ? (projects.data.items.find((p) => p.id === loc.projectId)?.code ?? "") : ""}`}`
                        : "Store"}
                    </td>
                    <td data-p="3" data-label="State">
                      <Pill tone={loc.retired ? "idle" : "ok"}>{loc.retired ? "Retired" : "In use"}</Pill>
                    </td>
                    <td>{loc.retired ? null : <RetireLocationButton locationId={loc.id} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <LocationsPager data={locations.data} paging={paging} params={params} />
          </div>
        )}
        <div className="card-b">
          <StockLocationForm
            projects={projects.kind === "ok" ? projects.data.items.map((p) => [p.id, `${p.code} · ${p.name}`] as const) : []}
          />
        </div>
      </Section>
    </>
  );
}

function LocationsPager({
  data,
  paging,
  params,
}: {
  data: { items: readonly unknown[]; nextCursor: string | null; prevCursor: string | null; count: number };
  paging: ReturnType<typeof pageState>;
  params: Record<string, string | undefined>;
}): ReactNode {
  const hrefFor = (overrides: Record<string, string | undefined>): string => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...params, ...overrides })) {
      if (value !== undefined && value !== "") next.set(key, value);
    }
    const qs = next.toString();
    return qs === "" ? "/settings/inventory" : `/settings/inventory?${qs}`;
  };
  const links = pageLinks(paging, data, hrefFor);
  return <Pager shown={links.shown} of={data.count} unit="locations" next={links.next} prev={links.prev} />;
}
