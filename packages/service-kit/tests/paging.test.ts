import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor, finishPage, keyset, readPage, type PageQuery } from '../src/paging.js';

const row = (n: number) => ({ id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, at: `2026-09-${String(n).padStart(2, '0')}` });
const keyOf = (r: { id: string; at: string }) => ({ key: r.at, id: r.id });

describe('cursor', () => {
  it('round-trips and rejects anything it did not write', () => {
    const c = { key: '2026-09-13 10:00:00+00', id: row(1).id };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
    expect(decodeCursor('not-a-cursor')).toBeNull();
    expect(decodeCursor(Buffer.from('["a","b"]').toString('base64url'))).toBeNull();
    expect(decodeCursor(Buffer.from('[1,2]').toString('base64url'))).toBeNull();
  });
});

describe('readPage', () => {
  const ctx = (q: Record<string, string>) => ({ req: { query: (k: string) => q[k] } }) as never;
  it('clamps the limit and defaults it', () => {
    expect(readPage(ctx({}))).toEqual({ limit: 50, cursor: null, before: false });
    expect(readPage(ctx({ limit: '10000' }))).toEqual({ limit: 200, cursor: null, before: false });
    expect(readPage(ctx({ limit: '0' }))).toEqual({ limit: 1, cursor: null, before: false });
    expect(readPage(ctx({ limit: 'x' }), { defaultLimit: 25 })).toEqual({ limit: 25, cursor: null, before: false });
  });
  it('refuses a cursor it did not issue', () => {
    expect(readPage(ctx({ cursor: 'zzz' }))).toEqual({ error: 'cursor is not one this list issued' });
  });
  it('reads a direction', () => {
    const cursor = encodeCursor({ key: 'k', id: row(1).id });
    expect(readPage(ctx({ cursor, dir: 'before' }))).toEqual({ limit: 50, cursor: { key: 'k', id: row(1).id }, before: true });
  });
});

describe('keyset', () => {
  const cursor = { key: '2026-09-10', id: row(10).id };
  it('is TRUE on the first page and keeps the order', () => {
    expect(keyset({ limit: 5, cursor: null, before: false }, 'o.created_at', 'o.id', 'timestamptz', true, 3)).toEqual({
      where: 'TRUE',
      orderBy: 'o.created_at DESC, o.id DESC',
      params: [],
    });
  });
  it('compares below the cursor going forward on a descending list', () => {
    const k = keyset({ limit: 5, cursor, before: false }, 'o.created_at', 'o.id', 'timestamptz', true, 3);
    expect(k.where).toBe('(o.created_at, o.id) < ($3::timestamptz, $4::uuid)');
    expect(k.orderBy).toBe('o.created_at DESC, o.id DESC');
    expect(k.params).toEqual([cursor.key, cursor.id]);
  });
  it('flips both comparator and order walking backwards', () => {
    const k = keyset({ limit: 5, cursor, before: true }, 'o.created_at', 'o.id', 'timestamptz', true, 1);
    expect(k.where).toBe('(o.created_at, o.id) > ($1::timestamptz, $2::uuid)');
    expect(k.orderBy).toBe('o.created_at ASC, o.id ASC');
  });
  it('an ascending list compares above the cursor going forward', () => {
    const k = keyset({ limit: 5, cursor, before: false }, 'p.email', 'p.id', 'text', false, 1);
    expect(k.where).toBe('(p.email, p.id) > ($1::text, $2::uuid)');
    expect(k.orderBy).toBe('p.email ASC, p.id ASC');
  });
});

describe('finishPage', () => {
  const page = (cursor: PageQuery['cursor'], before = false): PageQuery => ({ limit: 3, cursor, before });
  it('trims the probe row and names the next edge', () => {
    const rows = [row(9), row(8), row(7), row(6)];
    const p = finishPage(rows, page(null), keyOf);
    expect(p.items).toEqual([row(9), row(8), row(7)]);
    expect(p.nextCursor).toBe(encodeCursor(keyOf(row(7))));
    expect(p.prevCursor).toBeNull();
  });
  it('ends with no next cursor when the fetch came up short', () => {
    const p = finishPage([row(3), row(2)], page(keyOf(row(4))), keyOf);
    expect(p.nextCursor).toBeNull();
    expect(p.prevCursor).toBe(encodeCursor(keyOf(row(3))));
  });
  it('restores list order walking backwards and names both edges', () => {
    // fetched ascending from the cursor: 4, 5, 6, (7 = the probe)
    const p = finishPage([row(4), row(5), row(6), row(7)], page(keyOf(row(3)), true), keyOf);
    expect(p.items).toEqual([row(6), row(5), row(4)]);
    expect(p.prevCursor).toBe(encodeCursor(keyOf(row(6))));
    expect(p.nextCursor).toBe(encodeCursor(keyOf(row(4))));
  });
  it('walking backwards to the very start has no previous', () => {
    const p = finishPage([row(4), row(5)], page(keyOf(row(3)), true), keyOf);
    expect(p.items).toEqual([row(5), row(4)]);
    expect(p.prevCursor).toBeNull();
  });
  it('an empty window has no edges', () => {
    expect(finishPage([], page(keyOf(row(1))), keyOf)).toEqual({ items: [], nextCursor: null, prevCursor: null });
  });
});
