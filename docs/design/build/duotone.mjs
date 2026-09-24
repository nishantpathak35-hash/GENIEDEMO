// duotone.mjs — the product's duotone icon family (19 September 2026): one hand-drawn line and one flat block, on a
// 24 × 24 grid, for the tinted disc a stat wears and the disc on a settings hub card. It is the middle of three
// styles, and the only three: monoline (icons.mjs, 16 px) in navigation and controls; duotone here, on a disc; the
// spot illustration (illustrations.mjs, 160 px) in an empty state. Never a fourth — the alignment gate holds it.
//
// The same hand as the illustrations: a 2-unit line, round caps and joins, the block under the line in the disc's
// own subtler step (--duo-<hue>, a token in each theme, so the dark variant is the token's), the line in the disc's
// icon colour (currentColor). Nothing here is traced from any published set; each is drawn from its plain metaphor.
const K = (d) => `<path class="k" d="${d}"/>`;   // the block
const L = (d) => `<path class="l" d="${d}"/>`;   // the line

const D = {
  // a BOQ sheet with its corner notched; the block is the row that is at risk
  margin: [K('M5 12h14v4H5z'), L('M5 3h10l4 4v14H5z'), L('M15 3v4h4M8 8h4M8 19h7')],
  // a bill with its torn foot, the rupee stamped over it
  bill: [K('M5 2.5h14v19l-2.33-1.8-2.34 1.8-2.33-1.8-2.33 1.8-2.34-1.8L5 21.5z'), L('M8.5 6h7M8.5 9.5h7'), L('M10 6c2.75 0 4.5 1 4.5 3.5S12.75 13 10 13l5.5 5')],
  // a gauge: the dial is the block, the limit a tick on the arc, the needle past it
  ceiling: [K('M6 17a6 6 0 0 1 12 0z'), L('M3.5 17a8.5 8.5 0 0 1 17 0M3.5 17h17'), L('M18 11l1.6-1.6'), L('M12 17l6.5-3.5')],
  // the same gauge, the needle short of the limit
  contract: [K('M6 17a6 6 0 0 1 12 0z'), L('M3.5 17a8.5 8.5 0 0 1 17 0M3.5 17h17'), L('M18 11l1.6-1.6'), L('M12 17l-3-7')],
  // a cone standing beside a map pin
  site: [K('M4 19.5h8.5L10 9H6.5z'), L('M2.5 19.5h11.5M4 19.5L6.5 9h3.5l2.5 10.5'), L('M17.5 20.5c-2.8-3.2-4.2-5.6-4.2-8a4.2 4.2 0 0 1 8.4 0c0 2.4-1.4 4.8-4.2 8z'), L('M17.5 12.5h.01')],
  // an in-tray: the mouth's dip, the front as the block
  tray: [K('M3 12h5l1.5 2.5h5L16 12h5v8H3z'), L('M3 12l2.5-7h13l2.5 7v8H3z'), L('M3 12h5l1.5 2.5h5L16 12h5')],
  // a voucher: the stub is the block, the tear line dashed
  voucher: [K('M14.5 6.5h6v11h-6z'), L('M3.5 6.5h17v11h-17z'), `<path class="l" stroke-dasharray="2 2" d="M14.5 6.5v11"/>`, L('M7 10.5h4M7 13.5h3')],
  // an invoice with the arrow coming in, and one with it going out; the sheet is the block
  'invoice-in': [K('M4 3h10v18H4z'), L('M4 3h10v18H4z'), L('M7 8h4M7 12h4M7 16h4'), L('M21.5 12H14M17 9l-3 3 3 3')],
  'invoice-out': [K('M4 3h10v18H4z'), L('M4 3h10v18H4z'), L('M7 8h4M7 12h4M7 16h4'), L('M14 12h7.5M18.5 9l3 3-3 3')],
  // an order form on its clipboard; the clip is the block
  orders: [K('M9 2.5h6v3.5H9z'), L('M5 5h14v16.5H5z'), L('M9 2.5h6v3.5H9z'), L('M8.5 11h7M8.5 14.5h7M8.5 18h4')],
  // a clock; the quarter gone is the block
  due: [K('M12 12V4.5a7.5 7.5 0 0 1 7.5 7.5z'), L('M12 4.5a7.5 7.5 0 1 0 0 15a7.5 7.5 0 1 0 0-15z'), L('M12 7.5V12l3.5 2')],
  // a crate in three-quarter view; the front is the block
  stock: [K('M3.5 9.5h11v11h-11z'), L('M3.5 9.5h11v11h-11zM14.5 9.5l5-4v11l-5 4M3.5 9.5l5-4h11'), L('M9 9.5v11')],
  // a plain sheet; its header band is the block
  count: [K('M5 3h14v5H5z'), L('M5 3h14v18H5z'), L('M8 12h8M8 16h5')],
  // two people; the one behind is the block
  people: [K('M16 5.5a3 3 0 1 1 0 6a3 3 0 1 1 0-6zM11 20v-1.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5V20z'), L('M9 5.5a3.25 3.25 0 1 0 0 6.5a3.25 3.25 0 1 0 0-6.5z'), L('M2.5 20v-1.5c0-3 3-4.5 6.5-4.5s6.5 1.5 6.5 4.5V20z')],
  // a lock — money held back; the body is the block
  held: [K('M5 11h14v10H5z'), L('M5 11h14v10H5z'), L('M8 11V8a4 4 0 0 1 8 0v3'), L('M12 15v2.5')],
  // ---- the settings hub's five categories ----
  // the firm: a building
  firm: [K('M5 21V6l7-3 7 3v15z'), L('M5 21V6l7-3 7 3v15H5z'), L('M9 10h2M13 10h2M9 14h2M13 14h2M10 21v-4h4v4')],
  // how work moves: a step, the arrow, the next step
  flow: [K('M2.5 8h7v8h-7z'), L('M2.5 8h7v8h-7zM14.5 8h7v8h-7z'), L('M9.5 12h4M11.5 10l2 2-2 2')],
  // the record: a ledger with its spine band
  record: [K('M5 3h4v18H5z'), L('M5 3h14v18H5z'), L('M9 3v18M12.5 8h3M12.5 11.5h3')],
  // yours: an identity card; the photo is the block
  yours: [K('M6 9.5h5v5H6z'), L('M2.5 5.5h19v13h-19z'), L('M6 9.5h5v5H6zM13.5 10h5M13.5 14h3.5')],
};
export const DUO_NAMES = Object.keys(D);
export const duoSprite = () => DUO_NAMES.map(n => `<symbol id="d-${n}" viewBox="0 0 24 24" class="duo-art">${D[n].join('')}</symbol>`).join('\n');
export const duo = (name) => {
  if (!D[name]) throw new Error(`duo: no duotone icon is named “${name}”`);
  return `<svg class="duo" aria-hidden="true" focusable="false"><use href="#d-${name}"/></svg>`;
};
// a disc named with a monoline icon's name (the pages did, until the family) resolves to the duotone that does its job
export const DUO_FOR_ICON = { cart: 'orders', site: 'site', users: 'people', clock: 'due', rupee: 'voucher', layers: 'stock', doc: 'count', inbox: 'tray', 'check-sq': 'tray', lock: 'held', bill: 'bill', alert: 'ceiling' };
export const duoFor = (name) => (D[name] ? name : DUO_FOR_ICON[name] || 'count');
// where each icon lands, for the components page
export const DUO_WHERE = {
  margin: 'Margin at risk — Today and a project’s Overview', bill: 'Payables this week — Today', ceiling: 'Past its contract ceiling — Today; a figure over its limit',
  contract: 'Contract, ordered, billed — a project’s Overview; a figure under its limit', site: 'Site this week, This week on site, the site visit — Today and Overview',
  tray: 'Approvals — what is waiting, what is to acknowledge', voucher: 'Cash — and any rupee figure with no direction', 'invoice-in': 'Total receivables; money coming in',
  'invoice-out': 'Total payables; money going out', orders: 'a count of orders', due: 'what falls due, and when', stock: 'stock and materials', count: 'a plain count',
  people: 'people, and what waits on them', held: 'money held back — a retention',
  firm: 'Settings › The firm (blue)', flow: 'Settings › How work moves (teal)', record: 'Settings › The record (neutral)', yours: 'Settings › Yours (green)',
};
export const HUB_DISC = { 'The firm': ['blue', 'firm'], 'People and access': ['purple', 'people'], 'How work moves': ['teal', 'flow'], 'The record': ['gray', 'record'], Yours: ['green', 'yours'] };
