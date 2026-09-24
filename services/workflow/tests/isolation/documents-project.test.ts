import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { TenantContext } from '@cog/contracts';
import { documentSummary, listDocuments, registerDocument } from '../../src/application/documents.js';
import { A_ONE, B_ONE, PROJECT_1, PROJECT_2, TENANT_A, TENANT_B, asTenant, tx, withPersonFixture } from './person-fixture.js';

withPersonFixture();

const ctx = (tenantId: string, principalId: string): TenantContext =>
  ({ tenantId, principal: { id: principalId, kind: 'user' }, requestId: 'test' }) as unknown as TenantContext;

const sha = 'a'.repeat(64);
const file = (fileName: string) => ({ fileName, contentType: 'application/pdf', sizeBytes: 1024, checksum: sha });

describe('a document knows its project (0105)', () => {
  it('stamps the project from the record when the record is a project, from the caller otherwise, and null for a vendor’s', async () => {
    await asTenant(TENANT_A, async () => {
      await registerDocument(tx, ctx(TENANT_A, A_ONE), { entityType: 'project', entityId: PROJECT_1, ...file('brief.pdf') });
      await registerDocument(tx, ctx(TENANT_A, A_ONE), { entityType: 'purchase_order', entityId: randomUUID(), projectId: PROJECT_1, ...file('po-signed.pdf') });
      await registerDocument(tx, ctx(TENANT_A, A_ONE), { entityType: 'purchase_order', entityId: randomUUID(), projectId: PROJECT_2, ...file('po-other.pdf') });
      await registerDocument(tx, ctx(TENANT_A, A_ONE), { entityType: 'vendor', entityId: randomUUID(), ...file('194c.pdf') });
    });
    const p1 = await asTenant(TENANT_A, () => listDocuments(tx, { limit: 50, cursor: null, before: false }, { projectId: PROJECT_1 }));
    expect(p1.items.map((d) => d.fileName).sort()).toEqual(['brief.pdf', 'po-signed.pdf']);
    expect(p1.items.every((d) => d.projectId === PROJECT_1)).toBe(true);
    const all = await asTenant(TENANT_A, () => listDocuments(tx, { limit: 50, cursor: null, before: false }, {}));
    expect(all.items.find((d) => d.fileName === '194c.pdf')?.projectId).toBeNull();
    // the twin's folder stats are the project's, the firm's are the firm's
    const twin = await asTenant(TENANT_A, () => documentSummary(tx, PROJECT_1));
    expect(twin.total).toBe(2);
    expect((await asTenant(TENANT_A, () => documentSummary(tx))).total).toBe(4);
  });

  it('another tenant reads none of them by project, and cannot plant one on this tenant', async () => {
    const theirs = await asTenant(TENANT_B, () => listDocuments(tx, { limit: 50, cursor: null, before: false }, { projectId: PROJECT_1 }));
    expect(theirs.items).toHaveLength(0);
    expect((await asTenant(TENANT_B, () => documentSummary(tx, PROJECT_1))).total).toBe(0);
    await expect(
      asTenant(TENANT_B, () =>
        tx.query(
          `INSERT INTO workflow.documents (tenant_id, id, entity_type, entity_id, file_name, content_type, size_bytes, checksum, object_key, uploaded_by, project_id)
           VALUES ($1, $2, 'project', $3::text, 'planted.pdf', 'application/pdf', 1, $4, 'k', $5, $6::uuid)`,
          [TENANT_A, randomUUID(), PROJECT_1, sha, B_ONE, PROJECT_1],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});
