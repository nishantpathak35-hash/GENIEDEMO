/**
 * `services/procurement` — vendors, purchase orders, inventory, retention.
 *
 * Owns its tables outright. Imports no other service; cross-domain reads go
 * through `packages/contracts`.
 */

export {
  quantity,
  lineTotals,
  purchaseOrderTotals,
  requiresReapproval,
  applyEdit,
  transition,
  canTransition,
  PurchaseOrderError,
  PO_STATES,
  type Quantity,
  type PurchaseOrderLine,
  type LineTotals,
  type PurchaseOrderTotals,
  type PurchaseOrder,
  type PoState,
  type ApplyEditInput,
} from './domain/purchase-order.js';

export { purchaseOrderRoutes, type TradeCatalogue } from './api/routes.js';

export {
  PURCHASE_ORDER_ENTITY_TYPE,
  PurchaseOrderNotFound,
  loadApprovalSubject,
  submitForApproval,
  PurchaseOrderStaleWrite,
  applyChainAdvance,
  cancelDeclinedOrder,
  type ApprovalSubject,
} from './application/approval-subject.js';

export {
  createPurchaseOrder,
  updatePurchaseOrder,
  renamePurchaseOrder,
  toDomainLines,
  toWriteResponse,
  DuplicatePurchaseOrderNumber,
  type CreateInput,
  type UpdateInput,
  type WriteResult,
  type PurchaseOrderLineInputLike,
} from './application/purchase-order-writes.js';

export {
  allocateNumber,
  previewNumber,
  listSeries,
  saveSeriesFormat,
  NumberSeriesError,
  NUMBERED_MODULES,
  type AllocatedNumber,
  type NumberFormat,
  type NumberedModule,
  type SeriesFormatInput,
} from './application/number-series.js';

export {
  FY_FORMATS,
  financialYear,
  formatSeriesNumber,
  isFyFormat,
  previewSeries,
  type FyFormat,
  type SeriesFormat,
} from './domain/number-format.js';

export {
  purchaseOrderLinesFromBoq,
  type OrderableLine,
} from './application/from-boq.js';

export {
  countVendors,
  getVendor,
  createVendor,
  updateVendor,
  deleteVendor,
  vendorNames,
  vendorExists,
  VendorNotFound,
  DuplicateVendorCode,
  VendorStaleWrite,
  VendorInUse,
  type VendorInput,
} from './application/vendors.js';

export {
  createStockItem,
  listStock,
  stockSummary,
  loadCostingPolicy,
  seedCostingPolicy,
  type CostingPolicy,
  receiveStock,
  listAwaitingReceipts,
  checkInReceipt,
  ReceiptNotAwaitingCheckIn,
  issueStock,
  transferStock,
  StockItemNotFound,
  DuplicateStockItem,
  InsufficientStock,
  InvalidMovement,
  type StockBalance as StockBalanceRow,
} from './application/inventory.js';

export {
  committedByProject,
  approvedCommitmentsByProject,
  type ProjectCommitment,
} from './application/commitments.js';

export {
  pendingApprovals,
  summariseBlockedApprovals,
  wholeDaysBetween,
  type PendingOrder,
  type StageResolution,
  type BlockedApprovalItem,
  type BlockedApprovalsSummary,
} from './application/blocked-approvals.js';

export { payablesAgeing, tradeSpendLines, orderIdsOfProject, type PayablesAgeing } from './application/dashboard.js';
export {
  ageing,
  bucketOf,
  sharePct,
  spendByTrade,
  UNASSIGNED_LABEL,
  TOP_TRADES,
  type Ageing,
  type AgeingBucket,
  type SpendByTrade,
  type TradeSpend,
} from './domain/ageing.js';

export {
  listRetention,
  recordRetention,
  RetentionRefused,
  type RetentionHolding,
} from './application/retention.js';

export {
  listOrdersForVendor,
  orderLinesForVendor,
  recordAcceptance,
  listBillsForVendor,
  submitBill,
  VendorPortalRefused,
  type VendorOrder,
  type VendorBill,
} from './application/portal.js';

export {
  DuplicateContractNumber,
  OverlappingContractRate,
  RateContractNotFound,
  UnknownVendor,
  createRateContract,
  deleteRateContract,
  getRateContract,
  listRateContracts,
  rateContractsEndingBy,
  listRateDeviations,
  resolveContractedRate,
  updateRateContract,
  type RateContractInput,
  type RateContractItemInput,
  type RateContractRow,
  type RateDeviation,
} from './application/rate-contracts.js';
export { purchaseOrderLines, type PurchaseOrderLineView } from './application/purchase-order-lines.js';
export { rateLibrary, type RateLibraryRow, type RateLibraryFilters } from './application/rate-library.js';
export { orderedSoFarByWeek } from './application/weekly.js';
export { rateCoverage, type RateCoverage } from './application/rate-coverage.js';

export {
  BILL_VIEWS,
  BillNotFound,
  BillRefused,
  UPCOMING_LIMIT,
  acknowledgeBill,
  billForPayment,
  getStaffBill,
  listStaffBills,
  markBillPaid,
  payablesSummary,
  payeeProfile,
  type BillForPayment,
  type BillView,
  type PayablesSummary,
  type PayeeProfile,
  type StaffBill,
} from './application/payables.js';
export { todayInIndia, weekBounds } from './domain/payables.js';
export {
  VendorTdsProfileRefused,
  setVendorTdsProfile,
  type VendorTdsProfileInput,
} from './application/vendors.js';
export { STATUTORY_MODULES } from './application/number-series.js';
export {
  RetentionNotFound,
  markRetentionReleased,
  retentionForRelease,
} from './application/retention.js';
export {
  TransporterDeclarationRefused,
  financialYearOfDate,
  listTransporterDeclarations,
  recordTransporterDeclaration,
  type TransporterDeclaration,
} from './application/transporter-declarations.js';

/** The bar's search: this service's records by the words typed. */
export { searchOrders, searchVendors } from './application/search.js';
