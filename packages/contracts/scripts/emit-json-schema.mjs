#!/usr/bin/env node
// Emit the /connector/v1 contract as JSON Schema.
//
// This is the artifact session B diffs its dated CONTRACT.md snapshot against.
// The connector deliberately does not import this package (ADR-0015), so a
// machine-readable export is the only way for the two halves to detect drift
// without coupling their release cycles.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import * as contracts from '../dist/index.js';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../dist/connector-v1.schema.json');

const document = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'construct-o-genie /connector/v1',
  description:
    'Cloud side of the Tally connector contract. The connector keeps its own dated ' +
    'snapshot and does not import this package; diff against this file to detect drift.',
  basePath: contracts.CONNECTOR_BASE_PATH,
  headers: contracts.CONNECTOR_HEADERS,
  knownVoucherKinds: contracts.VOUCHER_KINDS,
  notes: {
    kind:
      'OPEN on the wire. The connector MUST type this as string and MUST NOT reject an ' +
      'unrecognised value — the cloud may add kinds and old connectors must keep forwarding.',
    xmlEscaping: 'Performed by the cloud. The connector forwards the bytes unchanged.',
    openQuestions: 'See docs/connector/OPEN-QUESTIONS.md — CONNECTOR-01 to CONNECTOR-04.',
  },
  $defs: {
    Voucher: z.toJSONSchema(contracts.voucher, { io: 'output' }),
    VouchersResponse: z.toJSONSchema(contracts.vouchersResponse, { io: 'output' }),
    VoucherResultRequest: z.toJSONSchema(contracts.voucherResultRequest, { io: 'input' }),
    VoucherResultResponse: z.toJSONSchema(contracts.voucherResultResponse, { io: 'output' }),
    HealthResponse: z.toJSONSchema(contracts.healthResponse, { io: 'output' }),
  },
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(document, null, 2)}\n`);
console.log(`wrote ${OUT}`);
