import type { ReactNode } from "react";
import Link from "next/link";
import { API_ROUTES, type Project } from "@cog/contracts";
import { AppliedFilters, AttachmentClip, ColumnControl, Empty, Icon, KebabMenu, ListCard, ListPager, ListTable, ListToolbar, Money, MoneyExact, Notice, PageHeader, Pill, RecordPane, Refusal, Section, Steps, UnreachableState, load, type Column, type Crumb, type Row } from "@cog/design-system";
import { apiAsCaller } from "../../../lib/api";
import { columnsIn, terms } from '../../../lib/terms';
import { orderSteps } from "../../../lib/approval-steps";
import { exportHref } from "../../../lib/export";
import { applied, listAddress, pageSizeOf, withView } from "../../../lib/lists";
import { pageLinks, pageState } from "../../../lib/paging";
import { chooseColumns } from "../../actions/preferences";
import { ViewsMenu } from "../../_components/views-menu";
import { ProjectPageHeader } from "../projects/[projectId]/header";
import { OrdersTabs } from "./tabs";
import { NewOrderForm } from "./forms";
import { ORDER_STATE_OPTIONS, orderStateLabel, orderStateTone } from "./status";


/**
 * Buying › Orders — `docs/design/07-buying.html`, the list; `03-navigation.html`,
 * the same list across all projects with its Project column.
 *
 * *See every order still waiting on somebody, and which somebody.*
 *
 * The list on the pattern: the view's name as the title, the toolbar with its
 * filters as field and value, the table in the reference's columns — raised,
 * number, vendor, project, status, total, the rate check, a clip — a row
 * opening its record in the pane beside the list (`?order=`), and the pager
 * with its count line. Filters, sort, the page and the open record are all
 * in the address; the server answers every one of them. The screen sorts
 * and filters nothing.
 *
 * The Project column and its filter are the firm's; inside a project the
 * same list is the project's twin, with neither (`/projects/[id]/orders`).
 * The rate check is the server's: an order is above the agreed rate when
 * `listRateDeviations` names one of its lines.
 */
const FIRM_FILTER_KEYS = ["state", "vendor", "project", "q", "sort"] as const;
const PROJECT_FILTER_KEYS = ["state", "vendor", "q", "sort"] as const;
const VALUE = "See every order still waiting on somebody, and which somebody.";

const FIRM_COLUMNS: readonly Column[] = [
  { key: "raised", label: "Raised", p: 3, num: true, sort: null },
  { key: "number", label: "Order", p: 1 },
  { key: "vendor", label: "Vendor", p: 3 },
  { key: "project", label: "Project", p: 3 },
  { key: "status", label: "Status", p: 2 },
  { key: "total", label: "Total", p: 2, num: true, sort: null },
  { key: "rates", label: "Rates", p: 2 },
  { key: "clip", label: "", p: 3, clip: true },
];

export async function OrdersList({
  params: raw,
  project,
}: {
  params: Record<string, string | undefined>;
  /** Inside a project, the project — the list is its own and the Project column and filter go. */
  project: Project | null;
}): Promise<ReactNode> {
  const client = await apiAsCaller();
  const t = await terms();
  const LIST = project === null ? 'orders' : 'project-orders';
  const BASE = project === null ? '/purchase-orders' : `/projects/${project.id}/orders`;
  const FILTER_KEYS = project === null ? FIRM_FILTER_KEYS : PROJECT_FILTER_KEYS;
  const COLUMNS = columnsIn(project === null ? FIRM_COLUMNS : FIRM_COLUMNS.filter((c) => c.key !== 'project'), t);

  // a saved view fills the address in where it is silent
  const viewId = raw["view"] ?? null;
  const views = await load(client, API_ROUTES.savedViews, {
    query: { list: LIST },
  });
  const view = viewId === null || views.kind !== "ok" ? null : (views.data.items.find((v) => v.id === viewId) ?? null);
  const params = withView(raw, view?.criteria ?? null);

  // an address carrying a state the list does not know is read as All,
  // not sent to the server to be refused
  const stateAsked = params["state"] ?? "";
  const stateFilter = ORDER_STATE_OPTIONS.some(([value]) => value === stateAsked) ? stateAsked : "";
  const vendorFilter = params["vendor"] ?? "";
  const projectFilter = project === null ? (params["project"] ?? "") : project.id;
  const q = (params["q"] ?? "").trim();
  const [sortKeyRaw, sortDirRaw] = (params["sort"] ?? "raised:desc").split(":");
  const sortKey = sortKeyRaw === "amount" ? "amount" : "raised";
  const sortDir: "asc" | "desc" = sortDirRaw === "asc" ? "asc" : "desc";
  const anyFilter = stateFilter !== "" || vendorFilter !== "" || (project === null && projectFilter !== "") || q !== "";
  const limit = pageSizeOf(params);
  const paging = pageState(params, "", limit);
  const openId = params["order"] ?? null;

  const listQuery = {
    ...paging.query,
    sort: `${sortKey}:${sortDir}`,
    ...(stateFilter === "" ? {} : { state: stateFilter }),
    ...(vendorFilter === "" ? {} : { vendorId: vendorFilter }),
    ...(projectFilter === "" ? {} : { projectId: projectFilter }),
    ...(q === "" ? {} : { q }),
  };
  const [orders, everyOrder, vendors, projects, nextNumber, deviations, blocked, prefs, me, open, history, chains] =
    await Promise.all([
      load(client, API_ROUTES.listPurchaseOrders, { query: listQuery }),
      anyFilter ? load(client, API_ROUTES.listPurchaseOrders, { query: { limit: "1", ...(project === null ? {} : { projectId: project.id }) } }) : null,
      load(client, API_ROUTES.listVendors, { query: { limit: "200" } }),
      load(client, API_ROUTES.listProjects, { query: { limit: "200" } }),
      load(client, API_ROUTES.nextPurchaseOrderNumber, {}),
      load(client, API_ROUTES.listRateDeviations, { query: { limit: "200" } }),
      load(client, API_ROUTES.blockedApprovals, {}),
      load(client, API_ROUTES.preferences, {}),
      load(client, API_ROUTES.myEntitlements, {}),
      openId === null ? null : load(client, API_ROUTES.getPurchaseOrder, { params: { id: openId } }),
      openId === null
        ? null
        : load(client, API_ROUTES.approvalHistory, {
            params: { entityType: "purchase_order", entityId: openId },
          }),
      openId === null ? null : load(client, API_ROUTES.approvalChains, {}),
    ]);

  const { hrefFor, perPageHrefs, clearAll, criteria } = listAddress(BASE, params, FILTER_KEYS);

  if (orders.kind === "unreachable") return <UnreachableState />;

  const vendorOptions =
    vendors.kind === "ok"
      ? vendors.data.items.filter((v) => v.status === "active").map((v) => [v.id, `${v.code} — ${v.name}`] as const)
      : [];
  const projectCodeOf = new Map(projects.kind === "ok" ? projects.data.items.map((p) => [p.id, p.code]) : []);
  const projectNameOf = new Map(projects.kind === "ok" ? projects.data.items.map((p) => [p.id, p.name]) : []);
  const vendorNameOf = new Map(vendors.kind === "ok" ? vendors.data.items.map((v) => [v.id, v.name]) : []);
  const above = new Set(deviations.kind === "ok" ? deviations.data.items.map((d) => d.purchaseOrderId) : []);
  // inside a project, the queue narrowed to it — the server names each item's project
  const waiting = blocked.kind === "ok" ? (project === null ? blocked.data.count : blocked.data.items.filter((b) => b.projectCode === project.code).length) : null;
  const mayShare = me.kind === "ok" && me.data.actions.includes("manage_settings");
  const mayRaise = me.kind === "ok" && me.data.actions.includes("create_po");
  const chosen = prefs.kind === "ok" ? (prefs.data.columns[LIST] ?? null) : null;
  const columns = COLUMNS.filter((c) => c.p === 1 || chosen === null || chosen.includes(c.key));
  const sortHref = (key: string): string =>
    hrefFor({
      sort: `${key}:${sortKey === key && sortDir === "desc" ? "asc" : "desc"}`,
    });
  const withSort: readonly Column[] = columns.map((c): Column => {
    if (c.sort === undefined) return c;
    const key = c.key === "raised" ? "raised" : "amount";
    return {
      ...c,
      sort: key === sortKey ? sortDir : null,
      sortHref: sortHref(key),
    };
  });

  const chips = applied(hrefFor, [
    {
      key: "state",
      label: "Status",
      value: stateFilter,
      show: orderStateLabel,
    },
    {
      key: "vendor",
      label: t.vendor,
      value: vendorFilter,
      show: (v) => vendorNameOf.get(v) ?? v,
    },
    ...(project === null
      ? [
          {
            key: "project",
            label: "Project",
            value: projectFilter,
            show: (v: string) => projectCodeOf.get(v) ?? v,
          },
        ]
      : []),
    { key: "q", label: "Search", value: q },
  ]);

  const HeaderTag = project === null ? PageHeader : ProjectPageHeader;
  const headerProps = project === null ? { crumbs: [{ href: "/purchase-orders", label: "Buying" }] } : { project, section: "Build", tabs: <OrdersTabs projectId={project.id} current="orders" /> };
  const header = (
    <HeaderTag
      {...(headerProps as { crumbs: Crumb[] } & { project: Project; section: string })}
      title={
        views.kind === "ok" ? (
          <ViewsMenu
            listKey={LIST}
            base={BASE}
            views={views.data.items}
            currentViewId={view?.id ?? null}
            defaultName="All orders"
            criteria={criteria}
            columns={chosen}
            mayShare={mayShare}
          />
        ) : (
          "All orders"
        )
      }
      help={VALUE}
      sub={
        orders.kind === "ok" ? (
          <>
            {everyOrder !== null && everyOrder.kind === "ok" ? everyOrder.data.count : orders.data.count} orders
            {waiting === null ? "" : ` · ${String(waiting)} waiting for approval`}
            {nextNumber.kind === "ok" ? (
              <>
                {" · next number "}
                <span className="nowrap">{nextNumber.data.number}</span>
              </>
            ) : null}
          </>
        ) : undefined
      }
      more={
        <KebabMenu
          sortHrefs={[
            ["Newest first", hrefFor({ sort: "raised:desc" })],
            ["Oldest first", hrefFor({ sort: "raised:asc" })],
            ["Largest first", hrefFor({ sort: "amount:desc" })],
            ["Smallest first", hrefFor({ sort: "amount:asc" })],
          ]}
          exportHref={exportHref("orders", project === null ? params : { ...params, project: project.id }, ["sort", "state", "vendor", "project", "q"])}
          refreshHref={hrefFor({})}
        />
      }
      primary={
        mayRaise ? (
          <Link className="btn primary" href={`${hrefFor({ new: "1" })}#raise-order`}>
            <Icon name="plus" />
            Raise an order
          </Link>
        ) : undefined
      }
    />
  );

  if (orders.kind === "refused") {
    return (
      <>
        {header}
        <ListCard label="Orders">
          <div className="card-b">
            <Refusal error={orders.error} />
          </div>
        </ListCard>
      </>
    );
  }

  const totalCount = everyOrder !== null && everyOrder.kind === "ok" ? everyOrder.data.count : orders.data.count;
  const links = pageLinks(paging, orders.data, hrefFor, limit);

  const rows: Row[] = orders.data.items.map((o) => {
    const code = o.projectId === null ? null : (projectCodeOf.get(o.projectId) ?? null);
    const vendorName = o.vendorName ?? `${t.vendor} no longer registered`;
    const raised = o.createdAt.slice(0, 10);
    const rate = above.has(o.id) ? (
      <Pill key="a" tone="warn">
        Above agreed rate
      </Pill>
    ) : deviations.kind === "ok" ? (
      <span key="a" className="muted">
        Within agreed rates
      </span>
    ) : (
      <span key="a" className="muted">
        Not checked
      </span>
    );
    return {
      key: o.id,
      href: hrefFor({ order: o.id }),
      open: o.id === openId,
      selectLabel: o.number,
      cells: [
        <span key="r" className="nowrap">
          {raised}
        </span>,
        <Link key="n" href={`/purchase-orders/${o.id}`}>
          <span className="nowrap">{o.number}</span>
        </Link>,
        vendorName,
        ...(project === null
          ? [
              code === null ? (
                <span key="p" className="muted">
                  No project
                </span>
              ) : (
                <span key="p" className="nowrap">
                  {code}
                </span>
              ),
            ]
          : []),
        <Pill key="s" tone={orderStateTone(o.state)}>
          {orderStateLabel(o.state)}
        </Pill>,
        <MoneyExact key="t" wire={o.gross} />,
        rate,
        <AttachmentClip key="c" what={null} />,
      ],
      detail: (
        <>
          <span className="nowrap">{raised}</span> · {vendorName}
          {code === null ? (
            ""
          ) : (
            <>
              {" "}
              · <span className="nowrap">{code}</span>
            </>
          )}
        </>
      ),
    };
  });

  const toolbar = (
    <ListToolbar
      formAction={BASE}
      search={{
        name: "q",
        placeholder: "Number or vendor",
        value: params["q"] ?? "",
        label: "Number or vendor",
      }}
      hidden={{
        sort: `${sortKey}:${sortDir}`,
        ...(viewId === null ? {} : { view: viewId }),
      }}
      compact={openId !== null}
      filters={[
        {
          key: "state",
          label: "Status",
          value: stateFilter === "" ? null : orderStateLabel(stateFilter),
          control: (
            <div className="field">
              <label htmlFor="f-state">Status</label>
              <select id="f-state" name="state" defaultValue={stateFilter}>
                <option value="">All</option>
                {ORDER_STATE_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          ),
        },
        {
          key: "vendor",
          label: t.vendor,
          value: vendorFilter === "" ? null : (vendorNameOf.get(vendorFilter) ?? vendorFilter),
          control: (
            <div className="field">
              <label htmlFor="f-vendor">{t.vendor}</label>
              <select id="f-vendor" name="vendor" defaultValue={vendorFilter}>
                <option value="">All</option>
                {vendorOptions.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          ),
        },
        ...(project === null
          ? [
              {
                key: "project",
                label: "Project",
                value: projectFilter === "" ? null : (projectCodeOf.get(projectFilter) ?? projectFilter),
                control: (
                  <div className="field">
                    <label htmlFor="f-project">Project</label>
                    <select id="f-project" name="project" defaultValue={projectFilter}>
                      <option value="">All</option>
                      {[...projectCodeOf].map(([id, code]) => (
                        <option key={id} value={id}>
                          {code}
                        </option>
                      ))}
                    </select>
                  </div>
                ),
              },
            ]
          : []),
      ]}
      columns={
        <ColumnControl
          listKey={LIST}
          columns={COLUMNS.map((c) => ({
            key: c.key,
            label: c.label === "" ? "Attachment" : c.label,
            locked: c.p === 1,
          }))}
          chosen={chosen}
          action={chooseColumns.bind(null, BASE)}
          compact={openId !== null}
        />
      }
      exportHref={exportHref("orders", project === null ? params : { ...params, project: project.id }, ["sort", "state", "vendor", "project", "q"])}
    />
  );

  // the record beside the list
  let pane: ReactNode = undefined;
  if (openId !== null && open !== null) {
    if (open.kind === "ok") {
      const o = open.data;
      const code = o.projectId === null ? null : (projectCodeOf.get(o.projectId) ?? null);
      const chain =
        chains !== null && chains.kind === "ok"
          ? (chains.data.items.find((c) => c.entityType === "purchase_order" && c.isActive) ??
            chains.data.items.find((c) => c.entityType === "purchase_order") ??
            null)
          : null;
      const blockedHere = blocked.kind === "ok" ? (blocked.data.items.find((b) => b.id === o.id) ?? null) : null;
      const steps = orderSteps(
        chain,
        history !== null && history.kind === "ok" ? history.data.items : [],
        blockedHere,
        (id) => `Approver ${id.slice(0, 8)}`,
        o.state,
      );
      const lineChecks =
        deviations.kind === "ok" ? deviations.data.items.filter((d) => d.purchaseOrderId === o.id) : [];
      pane = (
        <RecordPane
          title={o.number}
          status={<Pill tone={orderStateTone(o.state)}>{orderStateLabel(o.state)}</Pill>}
          sub={
            <>
              {o.vendorName ?? `${t.vendor} no longer registered`}
              {code === null ? "" : ` · ${code}`} · raised {o.createdAt.slice(0, 10)}
            </>
          }
          backHref={hrefFor({ order: undefined })}
          closeHref={hrefFor({ order: undefined })}
          fullHref={`/purchase-orders/${o.id}`}
          actions={
            <>
              <span className="spacer" />
              <Link className="btn primary" href={`/purchase-orders/${o.id}`}>
                Open the full order
              </Link>
            </>
          }
        >
          <div className="figbox">
            <div className="fig">
              <MoneyExact wire={o.gross} />
            </div>
          </div>
          <dl className="kv">
            <dt>Before GST</dt>
            <dd>
              <Money wire={o.taxable} />
            </dd>
            <dt>GST</dt>
            <dd>
              <Money wire={o.gst} />
            </dd>
            <dt>{t.vendor}</dt>
            <dd>{o.vendorName ?? `${t.vendor} no longer registered`}</dd>
            <dt>Project</dt>
            <dd>
              {code === null ? (
                <span className="muted">No project</span>
              ) : (
                `${code} · ${projectNameOf.get(o.projectId ?? "") ?? ""}`
              )}
            </dd>
            <dt>Rates</dt>
            <dd>
              {lineChecks.length === 0 ? (
                <span className="muted">No line above an agreed rate</span>
              ) : (
                <Pill tone="warn">
                  {lineChecks.length} line{lineChecks.length === 1 ? "" : "s"} above the agreed rate
                </Pill>
              )}
            </dd>
          </dl>
          <p className="u-strong">Approval steps</p>
          {steps === null ? (
            <p className="muted">
              No approval chain is configured, so every decision is refused rather than let through by default.
            </p>
          ) : (
            <Steps steps={steps} />
          )}
        </RecordPane>
      );
    } else if (open.kind === "refused") {
      pane = (
        <RecordPane
          title="This order"
          backHref={hrefFor({ order: undefined })}
          closeHref={hrefFor({ order: undefined })}
        >
          <Refusal error={open.error} />
        </RecordPane>
      );
    } else {
      pane = (
        <RecordPane
          title="This order"
          backHref={hrefFor({ order: undefined })}
          closeHref={hrefFor({ order: undefined })}
        >
          <Notice tone="bad" title="The API is not reachable">
            Nothing was read. The list beside this is what was read a moment ago.
          </Notice>
        </RecordPane>
      );
    }
  }

  const body =
    totalCount === 0 ? (
      <Empty
        illustration="orders"
        title="No orders yet"
        action={
          mayRaise ? (
            <Link className="btn primary" href={`${hrefFor({ new: "1" })}#raise-order`}>
              <Icon name="plus" />
              Raise an order
            </Link>
          ) : undefined
        }
      >
        Raise the first one here, or from any project’s BOQ.
      </Empty>
    ) : rows.length === 0 ? (
      <Empty
        illustration="search"
        variant="filtered"
        title={`No order matches ${chips.length === 1 ? "this filter" : "these filters"}`}
        action={
          <a className="btn primary" href={clearAll}>
            {chips.length === 1 ? "Clear the filter" : "Clear the filters"}
          </a>
        }
      >
        {chips.map((c) => `${c.label} ${c.value}`).join(" · ")}. Widen it, or drop one.
      </Empty>
    ) : (
      <ListTable label="Orders" columns={withSort} rows={rows} />
    );

  return (
    <>
      {header}
      <ListCard
        label="Orders"
        toolbar={totalCount === 0 ? undefined : toolbar}
        applied={<AppliedFilters applied={chips} clearAllHref={clearAll} />}
        pager={
          totalCount === 0 ? undefined : (
            <ListPager
              from={links.shown.from}
              to={links.shown.to}
              total={orders.data.count}
              unit="orders"
              perPage={limit}
              prevHref={links.prev}
              nextHref={links.next}
              perPageHrefs={perPageHrefs}
              {...(anyFilter ? { filteredFrom: totalCount } : {})}
            />
          )
        }
        {...(pane === undefined ? {} : { pane })}
      >
        {body}
      </ListCard>

      {params["new"] === "1" && mayRaise ? (
        <Section bare title="Raise an order">
          <div className="card-b" id="raise-order">
            {vendorOptions.length === 0 ? (
              <p className="muted">
                No active vendor is registered. <Link href="/vendors">Register one first.</Link>
              </p>
            ) : (
              <NewOrderForm
                vendors={vendorOptions}
                projects={
                  project !== null
                    ? [[project.id, `${project.code} — ${project.name}`] as const]
                    : projects.kind === "ok"
                      ? projects.data.items.map((p) => [p.id, `${p.code} — ${p.name}`] as const)
                      : []
                }
              />
            )}
          </div>
        </Section>
      ) : null}
    </>
  );
}


