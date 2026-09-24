#!/usr/bin/env node
// Seed two synthetic tenants for local development — THROUGH THE PRODUCT.
//
// EVERY FIXTURE IS SYNTHETIC. Nothing here comes from `_private/`, which holds a
// live customer database — real bank accounts, IFSC codes, GSTINs and PANs. The
// names below are invented and the tax identifiers are structurally valid but
// deliberately fake.
//
// Two tenants rather than one, because one tenant cannot demonstrate isolation:
// a bug that ignores the tenant filter looks identical to correct behaviour
// when there is only one tenant's data to return.
//
// ---------------------------------------------------------------------------
// WHAT THIS SCRIPT NO LONGER DOES
// ---------------------------------------------------------------------------
//
// It used to insert a `tenancy.tenants` row inside a hand-set tenant context,
// an `identity.principals` row, and call `identity.register_principal` — as the
// MIGRATION role, with the whole of provisioning written out by hand. M6's
// done-when is that onboarding is self-service with no SQL run by hand, and its
// second clause says why this file had to change rather than merely be joined:
//
//   > If a development script and the product do provisioning differently, the
//   > one that is exercised daily is the one that stays correct, and it is not
//   > the product's.
//
// So the only SQL left here is the one thing the product cannot do for itself —
// creating the PLATFORM account that is allowed to provision. That is a
// deployment act, not a product operation: the first platform account has the
// same chicken-and-egg shape as the first tenant, one level up.
//
// Everything after that is an HTTP call to `/platform/v1/tenants`, exactly as
// the admin console makes it.

import pg from 'pg';

const url = process.env['MIGRATION_DATABASE_URL'] ?? process.env['DATABASE_URL'];
if (!url) {
  console.error('MIGRATION_DATABASE_URL is not set. Refusing to guess.');
  process.exit(1);
}

const apiUrl = process.env['API_URL'] ?? 'http://localhost:4000';
const platformEmail = process.env['SEED_PLATFORM_EMAIL'] ?? 'ops@construct-o-genie.example';

const TENANTS = [
  {
    slug: 'bhitarang-interiors',
    legalName: 'Bhitarang Interiors Private Limited',
    appOrigin: 'http://localhost:3000',
    adminEmail: 'shalini.kamath@bhitarang-interiors.example',
  },
  {
    slug: 'samarachana-fitouts',
    legalName: 'Samarachana Fitouts LLP',
    appOrigin: 'http://localhost:3000',
    adminEmail: 'aditi.gokhale@samarachana-fitouts.example',
  },
];

const client = new pg.Client({ connectionString: url });
await client.connect();

try {
  // The one hand-written act, and the reason is stated rather than assumed: a
  // platform account cannot be created through the platform console, because
  // reaching the console requires being one. Provisioning the first one is a
  // deployment step — the same shape as minting the runtime role's login, which
  // is Terraform's job and not this script's either.
  const { rows } = await client.query(
    `INSERT INTO tenancy.platform_principals (external_id, email)
     VALUES ($1, $1)
     ON CONFLICT (external_id) DO UPDATE SET email = EXCLUDED.email
     RETURNING id`,
    [platformEmail],
  );
  console.log(`platform account ready: ${platformEmail} (${rows[0].id})`);
} finally {
  await client.end();
}

// --- everything else goes through the product -------------------------------

let created = 0;
let alreadyThere = 0;

for (const tenant of TENANTS) {
  const response = await fetch(`${apiUrl}/platform/v1/tenants`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      // The local development provider takes the address as the credential.
      // With a real provider this is an access token; the script does not know
      // or care which, because it is calling the product's own endpoint.
      authorization: `Bearer ${platformEmail}`,
    },
    body: JSON.stringify({
      slug: tenant.slug,
      legalName: tenant.legalName,
      appOrigin: tenant.appOrigin,
      adminEmail: tenant.adminEmail,
      adminExternalId: tenant.adminEmail,
    }),
  }).catch((error) => {
    console.error(
      `\nCould not reach ${apiUrl}. Start the API first — this script now calls ` +
        `the product rather than writing to the database.\n${String(error)}`,
    );
    process.exit(1);
  });

  if (response.status === 201) {
    const body = /** @type {{ tenantId: string }} */ (await response.json());
    console.log(`created ${tenant.slug} — first administrator ${tenant.adminEmail}`);
    console.log(`  tenant ${body.tenantId}`);
    created += 1;
    continue;
  }

  if (response.status === 409) {
    // Idempotent by outcome rather than by an upsert: re-running the seed on a
    // database that already has these tenants is the normal case, and a refusal
    // that says so is more useful than a silent no-op.
    console.log(`${tenant.slug} already exists — left alone`);
    alreadyThere += 1;
    continue;
  }

  if (response.status === 403) {
    console.error(
      `\nThe API refused ${platformEmail} as a platform account. ` +
        'Is PLATFORM_CONSOLE=on set on the API?',
    );
    process.exit(1);
  }

  console.error(`\nProvisioning ${tenant.slug} failed: ${response.status}`);
  console.error(await response.text());
  process.exit(1);
}

console.log(
  `\n${String(created)} created, ${String(alreadyThere)} already there. ` +
    'Sign in to the web app as one of the administrators above.',
);
