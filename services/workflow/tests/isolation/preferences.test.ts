import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES, readPreferences, updatePreferences } from '../../src/application/preferences.js';
import { A_ONE, A_TWO, B_ONE, TENANT_A, TENANT_B, asTenant, tx, withPersonFixture } from './person-fixture.js';

/**
 * `workflow.person_preferences`: one document per person, merged on write, tenant-scoped and the person's own.
 */

withPersonFixture();

describe('preferences — one document per person, merged on write', () => {
  it('reads the defaults before anything is written', async () => {
    const prefs = await asTenant(TENANT_A, () => readPreferences(tx, A_ONE));
    expect(prefs).toEqual(DEFAULT_PREFERENCES);
  });

  it('merges a change and keeps the rest', async () => {
    await asTenant(TENANT_A, () => updatePreferences(tx, A_ONE, { singleKeyShortcuts: false }));
    const after = await asTenant(TENANT_A, () =>
      updatePreferences(tx, A_ONE, { sidebar: { collapsed: true, open: ['money'] } }),
    );
    expect(after.singleKeyShortcuts).toBe(false);
    expect(after.sidebar).toEqual({ collapsed: true, open: ['money'] });
    expect(after.columns).toEqual({});
  });

  it('is the person’s: a colleague in the same tenant reads their own defaults', async () => {
    const other = await asTenant(TENANT_A, () => readPreferences(tx, A_TWO));
    expect(other.singleKeyShortcuts).toBe(true);
    expect(other.sidebar.collapsed).toBe(false);
  });

  it('another tenant sees no row at all', async () => {
    const seen = await asTenant(TENANT_B, () => tx.query('SELECT id FROM workflow.person_preferences'));
    expect(seen).toHaveLength(0);
  });

  it('cannot plant a document in another tenant', async () => {
    await expect(
      asTenant(TENANT_A, () =>
        tx.query(
          `INSERT INTO workflow.person_preferences (tenant_id, principal_id, preferences) VALUES ($1, $2, '{}'::jsonb)`,
          [TENANT_B, B_ONE],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('refuses a document that is not an object', async () => {
    await expect(
      asTenant(TENANT_A, () =>
        tx.query(
          `INSERT INTO workflow.person_preferences (tenant_id, principal_id, preferences)
           VALUES (tenancy.current_tenant_id(), $1, '[]'::jsonb)`,
          [A_TWO],
        ),
      ),
    ).rejects.toThrow(/person_preferences_shape_check/);
  });
});
