import { describe, expect, it } from 'vitest';
import { HISTORY_KEEP, recentHistory, recentProjects, recordOpened } from '../../src/application/recent-history.js';
import { A_ONE, A_TWO, PROJECT_1, PROJECT_2, TENANT_A, TENANT_B, asTenant, tx, withPersonFixture } from './person-fixture.js';

/**
 * `workflow.recent_history`: the trail is the person's own, newest first, short, and tenant-scoped — a trail
 * that leaked would hand one colleague a record of what another looked at.
 */

withPersonFixture();

describe('recent history — the trail is the person’s own, newest first, and short', () => {
  it('moves a record up when it is opened again, never listing it twice', async () => {
    await asTenant(TENANT_A, async () => {
      await recordOpened(tx, A_ONE, { kind: 'order', id: 'po-1', title: 'PO-0001', subtitle: 'a vendor', href: '/purchase-orders/po-1', projectId: PROJECT_1 });
      await recordOpened(tx, A_ONE, { kind: 'vendor', id: 'v-1', title: 'A vendor', subtitle: '', href: '/vendors/v-1', projectId: null });
      await recordOpened(tx, A_ONE, { kind: 'order', id: 'po-1', title: 'PO-0001', subtitle: 'a vendor', href: '/purchase-orders/po-1', projectId: PROJECT_1 });
    });
    const trail = await asTenant(TENANT_A, () => recentHistory(tx, A_ONE));
    expect(trail.map((t) => t.id)).toEqual(['po-1', 'v-1']);
  });

  it('names the projects opened last, a record on a project counting as the project', async () => {
    await asTenant(TENANT_A, async () => {
      await recordOpened(tx, A_ONE, { kind: 'project', id: PROJECT_2, title: 'ANU-02', subtitle: '', href: `/projects/${PROJECT_2}`, projectId: null });
    });
    const recent = await asTenant(TENANT_A, () => recentProjects(tx, A_ONE));
    expect(recent).toEqual([PROJECT_2, PROJECT_1]);
  });

  it('keeps the trail to HISTORY_KEEP entries', async () => {
    await asTenant(TENANT_A, async () => {
      for (let i = 0; i < HISTORY_KEEP + 5; i += 1) {
        await recordOpened(tx, A_TWO, { kind: 'task', id: `t-${String(i)}`, title: `Task ${String(i)}`, subtitle: '', href: `/tasks?task=t-${String(i)}`, projectId: null });
      }
    });
    const rows = await asTenant(TENANT_A, () => tx.query<{ n: number }>('SELECT count(*)::int AS n FROM workflow.recent_history WHERE principal_id = $1', [A_TWO]));
    expect(rows[0]?.n).toBe(HISTORY_KEEP);
  });

  it('a colleague’s trail is not this person’s', async () => {
    const other = await asTenant(TENANT_A, () => recentHistory(tx, A_TWO));
    expect(other.some((t) => t.id === 'po-1')).toBe(false);
  });

  it('another tenant sees none of it', async () => {
    const seen = await asTenant(TENANT_B, () => tx.query('SELECT id FROM workflow.recent_history'));
    expect(seen).toHaveLength(0);
  });

  it('refuses an href that is not a path on this product', async () => {
    await expect(
      asTenant(TENANT_A, () =>
        recordOpened(tx, A_ONE, { kind: 'page', id: 'x', title: 'Elsewhere', subtitle: '', href: 'https://elsewhere.example/', projectId: null }),
      ),
    ).rejects.toThrow(/recent_history_href_check/);
  });
});
