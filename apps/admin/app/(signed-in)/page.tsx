import type { ReactNode } from "react";
import { API_ROUTES } from "@cog/contracts";
import { Absent, Empty, Icon, Notice, PageHeader, Pager, Refusal, Section, UnreachableState, load } from "@cog/design-system";
import { apiAsCaller } from "../../lib/api";
import { pageLinks, pageState } from "../../lib/paging";
import { ProvisionTenantForm, SetPlanForm } from "./forms";

export const metadata = { title: "Organisations · Platform administration" };
export const dynamic = "force-dynamic";

/**
 * The back office.
 *
 * **What is here: creating an organisation, and the record of every attempt.**
 * That is M6's stated done-when — *onboarding a tenant is self-service, with no
 * SQL run by hand* — and it is what `services/tenancy/scripts/seed.mjs` does
 * today as the migration role.
 *
 * **What is not here, and why:** a tenant's own data. This console has no
 * tenant context at all, so every tenant-scoped policy denies its connection.
 * Reaching a customer's books requires impersonation, which is **not built** —
 * it needs an audit row on start and on end, the impersonator's id carried
 * alongside the impersonated principal on every action, a time box, and a
 * refusal on any route that writes money. Half of it, a way to assume a tenant
 * context without the record, is indistinguishable from an insider reading a
 * customer's books.
 */
export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<ReactNode> {
  const params = await searchParams;
  // Two lists on one page, each with its own window: `t…` for organisations, `e…` for attempts.
  const tenantsPaging = pageState(params, "t");
  const eventsPaging = pageState(params, "e");
  const client = await apiAsCaller();
  const [tenants, events] = await Promise.all([
    load(client, API_ROUTES.listTenants, { query: tenantsPaging.query }),
    load(client, API_ROUTES.provisioningEvents, { query: eventsPaging.query }),
  ]);

  if (tenants.kind === "unreachable") return <UnreachableState />;
  if (tenants.kind === "refused") {
    return (
      <>
        <PageHeader title="Organisations" sub="the back office" />
        <Section title="Organisations">
          <Refusal error={tenants.error} />
        </Section>
      </>
    );
  }

  const items = tenants.data.items;

  function hrefFor(overrides: Record<string, string | undefined>): string {
    const next = new URLSearchParams();
    const merged: Record<string, string | undefined> = { ...params, ...overrides };
    for (const [key, value] of Object.entries(merged)) {
      if (value !== undefined && value !== "") next.set(key, value);
    }
    const qs = next.toString();
    return qs === "" ? "/" : `/?${qs}`;
  }
  const tenantsLinks = pageLinks(tenantsPaging, tenants.data, hrefFor);
  const eventsLinks = events.kind === "ok" ? pageLinks(eventsPaging, events.data, hrefFor) : null;

  return (
    <>
      <PageHeader
        title="Organisations"
        sub={`${String(tenants.data.count)} on this deployment`}
        primary={
          <a className="btn primary" href="#new-organisation">
            <Icon name="plus" />
            New organisation
          </a>
        }
      />

      <div data-hero>
      <Section bare title="Organisations" sub={`${String(tenants.data.count)} on this deployment`}>
        {tenants.data.count === 0 ? (
          <Empty illustration="projects" title="No organisations yet">
            Create the first one below.
          </Empty>
        ) : (
          <>
            <div className="tbl-wrap">
              {/* Organisation · Plan · Tally · Last active — identity never
                  drops. The three instants are what each tenant reported about
                  itself to the directory (0090), never read across tenants;
                  `null` is "none since tracking began", said in words. */}
              <table className="tbl" data-priority>
                <thead>
                  <tr>
                    <th data-p="1">Organisation</th>
                    <th data-p="2">Plan</th>
                    <th data-p="3">Tally</th>
                    <th className="num" data-p="4">
                      Last active
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((tenant) => (
                    <tr key={tenant.id}>
                      <td data-p="1">
                        {tenant.legalName}
                        <span className="sub">
                          {tenant.slug} ·{" "}
                          {tenant.appOrigin === null
                            ? "no app origin yet"
                            : tenant.appOrigin}
                        </span>
                      </td>
                      <td data-p="2" data-label="Plan">
                        {tenant.plan ?? <Absent why="No plan has been recorded for this organisation." />}
                      </td>
                      <td data-p="3" data-label="Tally">
                        {tenant.lastPostedAt !== null
                          ? `Posted ${tenant.lastPostedAt.slice(0, 10)}`
                          : tenant.connectorLastSeenAt !== null
                            ? `Connected ${tenant.connectorLastSeenAt.slice(0, 10)}, nothing posted`
                            : "Never connected"}
                      </td>
                      <td className="num" data-p="4" data-label="Last active">
                        {tenant.lastActiveAt === null ? "Not yet" : tenant.lastActiveAt.slice(0, 10)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager
              shown={tenantsLinks.shown}
              of={tenants.data.count}
              unit={tenants.data.count === 1 ? "organisation" : "organisations"}
              next={tenantsLinks.next}
              prev={tenantsLinks.prev}
            />
          </>
        )}
      </Section>
      </div>

      {items.length === 0 ? null : (
        <Section title="Plan" sub="a label for the operator; nothing gates on it">
          <SetPlanForm tenants={items.map((t) => [t.id, t.legalName] as const)} />
        </Section>
      )}

      <Section title="New organisation" sub="one transaction: the organisation and its first administrator">
        <div id="new-organisation">
          <ProvisionTenantForm />
        </div>
      </Section>

      <Section bare title="Provisioning events" sub="every attempt is recorded">
        {events.kind !== "ok" || eventsLinks === null || events.data.count === 0 ? (
          <Empty illustration="documents" title="Nothing recorded yet">
            Every attempt is written by the provisioning function itself, so a
            refusal cannot go unlogged.
          </Empty>
        ) : (
          <>
            <ul className="list">
              {events.data.items.map((event) => (
                <li key={event.id}>
                  <div>
                    {event.slug} —{" "}
                    {event.outcome === "created" ? "created" : "refused"}
                    <small>
                      {event.detail === "" ? event.occurredAt : event.detail}
                    </small>
                  </div>
                  <span className="muted">{event.occurredAt.slice(0, 10)}</span>
                </li>
              ))}
            </ul>
            <Pager
              shown={eventsLinks.shown}
              of={events.data.count}
              unit={events.data.count === 1 ? "attempt" : "attempts"}
              next={eventsLinks.next}
              prev={eventsLinks.prev}
            />
          </>
        )}
      </Section>

      {/*
        The design's own operator console is deliberately toned down —
        "confirmation and idle tones only, no status red, no caution" — so
        these two stay Notice at a neutral tone rather than AbsentNotice's
        fixed warn/amber. They are standing product-boundary documentation,
        not a reaction to something wrong on this screen.
      */}
      <Notice tone="neutral" title="Impersonation is not built">
        Support cannot debug what it cannot see, and &ldquo;log in as the
        customer&rdquo; without a record is indistinguishable from an insider
        reading a customer&rsquo;s books. It needs an audit row on start and on
        end, the impersonator&rsquo;s id on every action taken inside the
        session, a time box that cannot be renewed silently, and a refusal on
        any route that writes money. None of that exists yet, so neither does
        the feature.
      </Notice>

      <Notice
        tone="neutral"
        title="Connector keys are minted here, not by a GRANT"
      >
        M1 deliberately left <code>app_runtime</code> without the grant that
        would let a tenant route mint a connector key. That is not a gap to
        close by adding one: the key is issued by provisioning, under a platform
        account, and a route that could mint its own would be a tenant able to
        authorise a new integration for itself.
      </Notice>
    </>
  );
}
