import { describe, expect, it } from 'vitest';
import { paise, toRupeeString } from '@cog/money';
import type { Paise } from '@cog/contracts';
import {
  PaymentRequestError,
  approve,
  canTransition,
  cancel,
  effectiveAmount,
  isOpen,
  netPayable,
  reject,
  remit,
  submit,
  summarise,
  type PaymentRequest,
} from '../src/domain/payment-request.js';

const pr = (over: Partial<PaymentRequest> = {}): PaymentRequest => ({
  id: 'pr_1',
  purchaseOrderId: 'po_1',
  vendorId: 'v_1',
  state: 'draft',
  amountRequested: paise(1_00_000n), // ₹1000.00
  amountApproved: null,
  tdsAmount: null,
  version: 1,
  ...over,
});

describe('effectiveAmount — the approved_amount ?? amount_requested rule', () => {
  it('uses the requested amount until something is approved', () => {
    expect(toRupeeString(effectiveAmount(pr()))).toBe('1000.00');
  });

  it('uses the approved amount once set', () => {
    expect(toRupeeString(effectiveAmount(pr({ amountApproved: paise(80_000n) })))).toBe('800.00');
  });

  it('keeps both, so "approved for less" stays expressible and auditable', () => {
    // Overwriting the requested amount would make the reduction invisible.
    const approved = approve(pr({ state: 'pending_approval' }), {
      approverId: 'u_1',
      amountApproved: paise(80_000n),
    });
    expect(toRupeeString(approved.amountRequested)).toBe('1000.00');
    expect(toRupeeString(approved.amountApproved as Paise)).toBe('800.00');
  });
});

describe('approval', () => {
  const pending = pr({ state: 'pending_approval' });

  it('approves the full amount by default', () => {
    const a = approve(pending, { approverId: 'u_1' });
    expect(a.state).toBe('approved');
    expect(toRupeeString(a.amountApproved as Paise)).toBe('1000.00');
  });

  it('allows approving for less', () => {
    const a = approve(pending, { approverId: 'u_1', amountApproved: paise(60_000n) });
    expect(toRupeeString(a.amountApproved as Paise)).toBe('600.00');
  });

  it('refuses to approve MORE than was requested', () => {
    // That is a revised request, not an approval. Allowing it silently would
    // let an approval step increase an outflow with nothing raised.
    expect(() =>
      approve(pending, { approverId: 'u_1', amountApproved: paise(1_50_000n) }),
    ).toThrow(/more than the amount requested/);
  });

  it('refuses a zero or negative approval', () => {
    expect(() => approve(pending, { approverId: 'u_1', amountApproved: paise(0n) })).toThrow();
  });

  it('requires an approver to be recorded', () => {
    expect(() => approve(pending, { approverId: '  ' })).toThrow(/who made it/);
  });

  it('does NOT check entitlement — that belongs to the caller, then workflow', () => {
    // Nothing in this domain knows a role name or an approval threshold. If it
    // ever does, the boundary with services/workflow has slipped.
    const a = approve(pending, { approverId: 'anyone-at-all' });
    expect(a.state).toBe('approved');
  });
});

describe('the state machine', () => {
  it('allows only declared transitions', () => {
    expect(canTransition('draft', 'pending_approval')).toBe(true);
    expect(canTransition('draft', 'approved')).toBe(false);
    expect(canTransition('remitted', 'cancelled')).toBe(false);
  });

  it('cannot be confused by one state name containing another', () => {
    // `stage.includes('reject')` makes "Rejected", "rejected by finance" and
    // "not rejected" the same state to the legacy engine.
    expect(canTransition('rejected', 'draft')).toBe(true);
    expect(canTransition('rejected', 'approved')).toBe(false);
  });

  it('refuses an undeclared move rather than guessing', () => {
    expect(() => submit(pr({ state: 'approved' }))).toThrow(PaymentRequestError);
    expect(() => remit(pr({ state: 'draft' }), { tdsAmount: paise(0n) })).toThrow(
      PaymentRequestError,
    );
  });

  it('treats remitted as terminal — money has left', () => {
    expect(() => cancel(pr({ state: 'remitted' }))).toThrow();
  });

  it('walks the full path', () => {
    let p = pr();
    p = submit(p);
    expect(p.state).toBe('pending_approval');
    p = approve(p, { approverId: 'u_1' });
    expect(p.state).toBe('approved');
    p = remit(p, { tdsAmount: paise(10_000n) });
    expect(p.state).toBe('remitted');
    expect(p.version).toBe(4); // one per transition
  });

  it('allows a rejected request to be reworked', () => {
    const r = reject(pr({ state: 'pending_approval' }), 'u_1');
    expect(r.state).toBe('rejected');
    expect(submit({ ...r, state: 'draft' }).state).toBe('pending_approval');
  });
});

describe('remittance', () => {
  const approved = pr({ state: 'approved', amountApproved: paise(80_000n) });

  it('nets the withheld tax off what the vendor receives', () => {
    const r = remit(approved, { tdsAmount: paise(8_000n) });
    expect(toRupeeString(netPayable(r))).toBe('720.00'); // 800 - 80
  });

  it('refuses tax greater than the payment', () => {
    expect(() => remit(approved, { tdsAmount: paise(90_000n) })).toThrow(/cannot exceed/);
  });

  it('refuses negative tax', () => {
    expect(() => remit(approved, { tdsAmount: paise(-1n) })).toThrow();
  });

  it('does not compute the tax itself', () => {
    // The TDS domain computes it from an effective-dated rate; this aggregate
    // records it. Deriving it here would put a statutory rule in two places.
    const r = remit(approved, { tdsAmount: paise(1n) });
    expect(r.tdsAmount).toBe(1n);
  });
});

describe('roll-up', () => {
  it('classifies each request exactly once, from its explicit state', () => {
    // The legacy equivalent buckets by substring, so a stage of
    // "Pending approval - not rejected" matches both includes('pending') and
    // includes('reject') and is counted twice.
    const requests = [
      pr({ id: 'a', state: 'remitted', amountApproved: paise(1_00_000n), tdsAmount: paise(10_000n) }),
      pr({ id: 'b', state: 'approved', amountApproved: paise(50_000n) }),
      pr({ id: 'c', state: 'pending_approval' }),
      pr({ id: 'd', state: 'rejected', amountRequested: paise(99_00_000n) }),
      pr({ id: 'e', state: 'cancelled', amountRequested: paise(99_00_000n) }),
    ];
    const s = summarise(requests);
    expect(toRupeeString(s.remitted)).toBe('900.00'); // 1000 - 100 withheld
    expect(toRupeeString(s.committed)).toBe('500.00');
    expect(toRupeeString(s.pending)).toBe('1000.00');
  });

  it('excludes rejected and cancelled requests from every bucket', () => {
    const s = summarise([
      pr({ state: 'rejected', amountRequested: paise(5_00_000n) }),
      pr({ state: 'cancelled', amountRequested: paise(5_00_000n) }),
    ]);
    expect(s.remitted).toBe(0n);
    expect(s.committed).toBe(0n);
    expect(s.pending).toBe(0n);
  });

  it('sums an empty set to zero rather than throwing', () => {
    expect(summarise([]).remitted).toBe(0n);
  });
});

describe('isOpen', () => {
  it('is true only while a request is still live', () => {
    expect(isOpen(pr({ state: 'draft' }))).toBe(true);
    expect(isOpen(pr({ state: 'approved' }))).toBe(true);
    expect(isOpen(pr({ state: 'remitted' }))).toBe(false);
    expect(isOpen(pr({ state: 'cancelled' }))).toBe(false);
  });
});
