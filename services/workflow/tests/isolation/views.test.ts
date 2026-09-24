import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { SavedViewNameTaken, SavedViewNotFound, createSavedView, deleteSavedView, listSavedViews } from '../../src/application/saved-views.js';
import { A_ONE, A_TWO, B_ONE, PROJECT_1, TENANT_A, TENANT_B, asTenant, tx, withPersonFixture } from './person-fixture.js';

/**
 * `workflow.saved_views`: the firm's views and a person's own on one list, tenant-scoped; a person deletes
 * their own and the firm's only with the permission the route checks.
 */

withPersonFixture();

describe('saved views — the firm’s and yours, on one list', () => {
  it('lists the firm’s views first, then this person’s, and a colleague’s not at all', async () => {
    await asTenant(TENANT_A, async () => {
      await createSavedView(tx, A_ONE, { listKey: 'orders', name: 'Waiting on me', shared: false, criteria: { state: 'pending_approval' }, columns: null });
      await createSavedView(tx, A_ONE, { listKey: 'orders', name: 'ANU-01 only', shared: true, criteria: { project: PROJECT_1 }, columns: ['number', 'vendor', 'gross'] });
      await createSavedView(tx, A_TWO, { listKey: 'orders', name: 'Mine', shared: false, criteria: { q: 'x' }, columns: null });
    });
    const mine = await asTenant(TENANT_A, () => listSavedViews(tx, A_ONE, 'orders'));
    expect(mine.map((v) => [v.name, v.ownerId])).toEqual([
      ['ANU-01 only', null],
      ['Waiting on me', A_ONE],
    ]);
    expect(mine[0]?.criteria).toEqual({ project: PROJECT_1 });
  });

  it('refuses a second view of the same name on the same list', async () => {
    await expect(
      asTenant(TENANT_A, () =>
        createSavedView(tx, A_ONE, { listKey: 'orders', name: 'waiting on me', shared: false, criteria: {}, columns: null }),
      ),
    ).rejects.toThrow(SavedViewNameTaken);
  });

  it('a person deletes their own view and not the firm’s without the permission', async () => {
    const views = await asTenant(TENANT_A, () => listSavedViews(tx, A_ONE, 'orders'));
    const own = views.find((v) => v.ownerId === A_ONE);
    const firm = views.find((v) => v.ownerId === null);
    if (own === undefined || firm === undefined) throw new Error('fixture');
    await expect(asTenant(TENANT_A, () => deleteSavedView(tx, A_ONE, firm.id, false))).rejects.toThrow(SavedViewNotFound);
    await asTenant(TENANT_A, () => deleteSavedView(tx, A_ONE, own.id, false));
    await asTenant(TENANT_A, () => deleteSavedView(tx, A_ONE, firm.id, true));
    expect(await asTenant(TENANT_A, () => listSavedViews(tx, A_ONE, 'orders'))).toHaveLength(0);
  });

  it('another tenant sees no view and cannot plant one', async () => {
    const seen = await asTenant(TENANT_B, () => tx.query('SELECT id FROM workflow.saved_views'));
    expect(seen).toHaveLength(0);
    await expect(
      asTenant(TENANT_A, () =>
        tx.query(
          `INSERT INTO workflow.saved_views (tenant_id, id, list_key, name, owner_id, created_by)
           VALUES ($1, $2, 'orders', 'planted', NULL, $3)`,
          [TENANT_B, randomUUID(), B_ONE],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});
