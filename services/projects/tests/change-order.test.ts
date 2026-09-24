import { describe, expect, it } from 'vitest';
import { paise, toRupeeString } from '@cog/money';
import {
  ChangeOrderError,
  contractValue,
  decide,
  submitToClient,
  type ChangeOrder,
} from '../src/domain/change-order.js';

const AT = new Date('2026-09-04T10:00:00Z');

const co = (over: Partial<ChangeOrder> = {}): ChangeOrder => ({
  id: 'co_1',
  projectId: 'p_1',
  title: 'Additional partition, 2nd floor',
  state: 'pending_client',
  costImpact: paise(1_50_000n), // ₹1500.00
  decidedBy: null,
  decidedAt: null,
  ...over,
});

describe('CO-03 — a client decision must be explicit', () => {
  it('approves only on an explicit approve', () => {
    const d = decide(co(), 'approve', 'client_user_1', AT);
    expect(d.state).toBe('client_approved');
    expect(d.decidedBy).toBe('client_user_1');
  });

  it('rejects on an explicit reject', () => {
    expect(decide(co(), 'reject', 'client_user_1', AT).state).toBe('client_rejected');
  });

  it('refuses anything that is not one of the two', () => {
    // `approveChangeOrderAsClient` decides by `decision === 'Reject'` and treats
    // EVERYTHING else as approval — a typo, an empty string, a missing field.
    // A client portal that approves a contract variation by default is not a
    // signature.
    for (const bad of ['', 'Reject ', 'approved', 'yes', undefined, null]) {
      expect(() => decide(co(), bad as 'approve', 'u', AT)).toThrow(ChangeOrderError);
    }
  });

  it('requires the decision to record who made it', () => {
    expect(() => decide(co(), 'approve', '   ', AT)).toThrow(/who made it/);
  });

  it('refuses a decision on a change order not awaiting one', () => {
    expect(() => decide(co({ state: 'draft' }), 'approve', 'u', AT)).toThrow();
    expect(() => decide(co({ state: 'client_approved' }), 'reject', 'u', AT)).toThrow();
  });
});

describe('submitting to the client', () => {
  it('sends a draft with a real cost impact', () => {
    expect(submitToClient(co({ state: 'draft' })).state).toBe('pending_client');
  });

  it('refuses a zero-value variation', () => {
    // Either a mistake or an unpriced scope change; neither should go out for
    // signature.
    expect(() => submitToClient(co({ state: 'draft', costImpact: paise(0n) }))).toThrow(
      /no cost impact/,
    );
  });

  it('accepts a negative impact — an omission is a variation too', () => {
    expect(submitToClient(co({ state: 'draft', costImpact: paise(-50_000n) })).state).toBe(
      'pending_client',
    );
  });
});

describe('CO-02 — the contract value is derived, not mutated', () => {
  const original = paise(1_00_00_000n); // ₹1,00,000.00

  it('keeps the originally signed figure intact', () => {
    // The legacy rewrites contract_value in place, so after two variations the
    // agreed figure is gone and a dispute cannot be settled from the data.
    const v = contractValue(original, [
      co({ id: 'a', state: 'client_approved', costImpact: paise(1_50_000n) }),
      co({ id: 'b', state: 'client_approved', costImpact: paise(-50_000n) }),
    ]);
    expect(toRupeeString(v.original)).toBe('100000.00');
    expect(toRupeeString(v.current)).toBe('101000.00'); // +1500 -500
    expect(v.approvedVariations).toBe(2);
  });

  it('counts only client-approved variations', () => {
    const v = contractValue(original, [
      co({ id: 'a', state: 'pending_client', costImpact: paise(9_00_000n) }),
      co({ id: 'b', state: 'client_rejected', costImpact: paise(9_00_000n) }),
      co({ id: 'c', state: 'draft', costImpact: paise(9_00_000n) }),
      co({ id: 'd', state: 'withdrawn', costImpact: paise(9_00_000n) }),
    ]);
    expect(v.current).toBe(v.original);
    expect(v.approvedVariations).toBe(0);
  });

  it('is recomputable, so the arithmetic can be re-checked at any time', () => {
    const orders = [co({ id: 'a', state: 'client_approved', costImpact: paise(25_000n) })];
    expect(contractValue(original, orders)).toEqual(contractValue(original, orders));
  });
});
