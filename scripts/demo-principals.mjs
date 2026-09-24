// The demo principals — THE ONE PLACE THEY ARE WRITTEN DOWN.
//
// `seed-demo.mjs` creates these people and `e2e/*.spec.ts` signs in as them,
// and until this file existed each spec carried its own copy of the addresses.
// A rename of a demo tenant then broke every spec at once, in the same run
// that was meant to prove the rename. Both read this file now.
//
// EVERY PERSON HERE IS INVENTED. The names are ordinary Indian names from
// different regions; none is meant to be anybody, no public figure among them,
// and nobody holds two roles. The addresses end in `.example`, a reserved
// top-level domain that cannot resolve (RFC 2606), so no message can ever
// reach anybody — until the owner names a demo domain (HUMAN(DEMO-DOMAIN)),
// which is a change to this file and nothing else. Nothing comes from the live
// customer data directory.
//
// The two organisations replace a Microsoft sample name the demo used to
// carry. Each company name was searched for before use; what the search turned
// up close to one is in the run report, for veto (HUMAN(DEMO-NAMES)).
//
// No passwords, anywhere. Development sign-in is email-only: with
// `AUTH_PROVIDER=local` the bearer token IS the address, and
// `assertNotProduction` (`services/identity/src/adapters/local.ts`) throws at
// boot if that provider is configured in production, so these logins exist
// only where the stack is local.
//
// Portal principals hold NO role: what a vendor or a client login may see
// comes from `identity.principal_links`, granted by the seed — the
// `vendorPortal` login to the tenant's first vendor by code, the `clientPortal`
// login to its first project by code, and each vendor desk to the vendor it
// names. A desk is the person at a supplier who sends that supplier's bills;
// the seed files every demo bill through one, because a portal bill is always
// the linked vendor's own.

/**
 * @typedef {{ email: string, name: string, roles: readonly string[],
 *             sees: string, refused: string }} Person
 * @typedef {Person & { vendorKey: string }} VendorDesk
 * @typedef {{ slug: string, legalName: string, appOrigin: string,
 *             admin: Person, finance: Person, proc: Person,
 *             vendorPortal: Person, clientPortal: Person,
 *             vendorDesks: readonly VendorDesk[] }} DemoTenant
 */

/** The platform operator — signs in to the admin console, not to a tenant. */
export const PLATFORM_OPERATOR = Object.freeze({
  email: 'ops@construct-o-genie.example',
  name: 'Platform operations',
  roles: Object.freeze(['platform']),
  sees: 'The admin console (:3001): every tenant, provisioning events, the health of each organisation.',
  refused: "Any tenant's own data — the console reads the directory projection, never a tenant's tables.",
});

/** @type {readonly DemoTenant[]} */
export const DEMO_TENANTS = Object.freeze([
  {
    slug: 'bhitarang-interiors',
    legalName: 'Bhitarang Interiors Private Limited',
    appOrigin: 'http://localhost:3000',
    admin: {
      email: 'shalini.kamath@bhitarang-interiors.example',
      name: 'Shalini Kamath',
      roles: ['admin'],
      sees: 'Everything in the web app (:3000): Today, Projects, Buying, Site, Approvals, Money, Settings — invites people, edits roles, switches modules.',
      refused: 'Approving an order this login raised (separation of duties — the server refuses, whatever the roles).',
    },
    finance: {
      email: 'farhan.qadri@bhitarang-interiors.example',
      name: 'Farhan Qadri',
      roles: ['finance'],
      sees: 'The approvals queue at the Finance stage; Money — bills to acknowledge and pay, payment vouchers, tax deducted, client billing, retention.',
      refused: 'Settings › Organisation and Roles (administrator only); approving an order this login submitted.',
    },
    proc: {
      email: 'manjit.bains@bhitarang-interiors.example',
      name: 'Manjit Bains',
      roles: ['proc'],
      sees: 'Raises purchase orders, submits them for approval, registers vendors, agrees rate contracts, receives stock.',
      refused: 'Approving any order and paying any bill (no Finance role); the administrator-only settings.',
    },
    vendorPortal: {
      email: 'bidisha.sen@prakashvahini-electrical.example',
      name: 'Bidisha Sen',
      roles: [],
      sees: 'The vendor portal (:3002) for Prakashvahini Electrical Contracts only: its orders, the bills it sent, and the payments against them with what was deducted.',
      refused: "Every other vendor's orders, bills and payments (not-found, never forbidden); the web app entirely.",
    },
    clientPortal: {
      email: 'elizabeth.kuriakose@anuvanshik-lifesciences.example',
      name: 'Elizabeth Kuriakose',
      roles: [],
      sees: 'The client portal (:3003) for the ANU-01 laboratory only: progress, variations, documents, and billing — the invoices, what was paid and what is due.',
      refused: 'Any other project (not-found); the web app entirely.',
    },
    vendorDesks: [
      {
        vendorKey: 'lepankar',
        email: 'venkatesh.bhat@lepankar-paints.example',
        name: 'Venkatesh Bhat',
        roles: [],
        sees: "The vendor portal for Lepankar Paint Works: its bills, and payments deducted at the higher rate because no PAN is on record.",
        refused: "Any other vendor's records; the web app.",
      },
      {
        vendorKey: 'pathvahak',
        email: 'rajbir.dhillon@pathvahak-roadlines.example',
        name: 'Rajbir Dhillon',
        roles: [],
        sees: 'The vendor portal for Pathvahak Roadlines: a transport bill paid with nothing deducted, on its 194C(6) declaration.',
        refused: "Any other vendor's records; the web app.",
      },
      {
        vendorKey: 'sthambhika',
        email: 'aparna.iyengar@sthambhika-structural.example',
        name: 'Aparna Iyengar',
        roles: [],
        sees: 'The vendor portal for Sthambhika Structural Consultants: fees deducted under 194J, and a bill still waiting to be acknowledged.',
        refused: "Any other vendor's records; the web app.",
      },
      {
        vendorKey: 'machaan',
        email: 'kishore.naidu@machaan-scaffolding.example',
        name: 'Kishore Naidu',
        roles: [],
        sees: 'The vendor portal for Machaan Scaffolding Hire: hire charges deducted under 194I, and a bill past its due date.',
        refused: "Any other vendor's records; the web app.",
      },
    ],
  },
  {
    slug: 'samarachana-fitouts',
    legalName: 'Samarachana Fitouts LLP',
    appOrigin: 'http://localhost:3000',
    admin: {
      email: 'aditi.gokhale@samarachana-fitouts.example',
      name: 'Aditi Gokhale',
      roles: ['admin'],
      sees: 'Everything in the web app for Samarachana — and nothing of Bhitarang: the same screens, a different tenant.',
      refused: 'Approving an order this login raised.',
    },
    finance: {
      email: 'revathi.subramanian@samarachana-fitouts.example',
      name: 'Revathi Subramanian',
      roles: ['finance'],
      sees: "Samarachana's approvals queue and Money screens.",
      refused: 'Administrator-only settings; approving an order this login submitted.',
    },
    proc: {
      email: 'jignesh.parmar@samarachana-fitouts.example',
      name: 'Jignesh Parmar',
      roles: ['proc'],
      sees: 'Raises and submits Samarachana orders; vendors; stock.',
      refused: 'Approving any order or paying any bill; administrator-only settings.',
    },
    vendorPortal: {
      email: 'dorjee.bhutia@sahyadrikuta-buildcon.example',
      name: 'Dorjee Bhutia',
      roles: [],
      sees: 'The vendor portal for Sahyadrikuta Buildcon only: its orders, bills and payments.',
      refused: "Any other vendor's records; the web app.",
    },
    clientPortal: {
      email: 'nandini.rathore@sukshmajivika-labs.example',
      name: 'Nandini Rathore',
      roles: [],
      sees: 'The client portal for the SUK-01 cleanroom project only, billing included.',
      refused: 'Any other project; the web app.',
    },
    vendorDesks: [
      {
        vendorKey: 'sthambhika',
        email: 'imtiaz.lone@sthambhika-structural.example',
        name: 'Imtiaz Lone',
        roles: [],
        sees: "The vendor portal for Sthambhika Structural Consultants, as Samarachana's supplier: fees deducted under 194J.",
        refused: "Any other vendor's records, and Bhitarang's entirely; the web app.",
      },
      {
        vendorKey: 'lepankar',
        email: 'pallavi.mahato@lepankar-paints.example',
        name: 'Pallavi Mahato',
        roles: [],
        sees: "The vendor portal for Lepankar Paint Works, as Samarachana's supplier: a bill due next week.",
        refused: "Any other vendor's records, and Bhitarang's entirely; the web app.",
      },
    ],
  },
]);
