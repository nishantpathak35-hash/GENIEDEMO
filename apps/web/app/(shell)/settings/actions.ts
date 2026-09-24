'use server';

import { revalidatePath } from 'next/cache';
import {
  ACTION_KEYS,
  API_ROUTES,
  FY_FORMAT_KEYS,
  MODULE_KEYS,
  invitableKind,
  TERM_KEYS,
  type SaveTerminologyInput,
} from '@cog/contracts';
import { apiAsCaller } from '../../../lib/api';
import { load } from '@cog/design-system';
import {
  checked,
  failed,
  messageFor,
  succeeded,
  text,
  type ActionState,
} from '@cog/design-system';
import { parsePercentToBasisPoints, parseRupeesToWire, parseWholeNumber } from '@cog/money';

/**
 * Mint an invitation.
 *
 * **The URL is returned once and never again**, so it is shown once, here, and
 * the caller has to copy it. The token's hash is what is stored; no endpoint
 * returns the token or its hash afterwards, which is why the invite list has no
 * "resend" — resending means minting a new one.
 */
export async function createInvite(_previous: ActionState, form: FormData): Promise<ActionState> {
  const email = text(form, 'email');
  if (email.length === 0) return failed('An email address is required.');

  // Read from the form, sent to the server, and NOT trusted on the way back:
  // the server stores it on the invitation and reads it from that row at
  // redemption. Whoever accepts the link does not get to say what they are
  // becoming — that is the whole point of the column.
  // Narrowed through the contract's own enum rather than cast. A select can be
  // edited before it is submitted, so this is validation, not tidying — and the
  // server refuses an unknown kind regardless.
  const kind = invitableKind.safeParse(text(form, 'kind'));
  const displayName = text(form, 'displayName');

  const result = await load(await apiAsCaller(), API_ROUTES.createInvite, {
    body: {
      email,
      ...(kind.success ? { kind: kind.data } : {}),
      ...(displayName.length === 0 ? {} : { displayName }),
    },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath('/settings');
  return succeeded(
    `${result.data.kind} invitation for ${result.data.email}, valid until ` +
      `${result.data.expiresAt}. Copy this link now — it is not retrievable ` +
      `afterwards: ${result.data.url}`,
  );
}

/**
 * Save one role's permissions.
 *
 * **Saving CONFIRMS the answer.** Every seeded grant arrives `provisional`,
 * because PO-13 was answered by reading a legacy tree rather than by anybody
 * deciding. A person opening this screen, looking at the boxes and pressing save
 * is the moment that stops being true, and the server records who and when.
 *
 * The whole set is sent, not a delta. A permission screen shows everything, so
 * what it sends back IS everything — a merge would make un-ticking a box do
 * nothing, which is the worst possible behaviour for a permission control.
 */
export async function saveRoleGrants(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const roleKey = text(form, 'roleKey');
  if (roleKey.length === 0) return failed('A role is required.');

  // `getAll` returns only the ticked boxes. An unticked one is absent, which is
  // exactly the semantics wanted: absent means not granted.
  const modules = form.getAll('module').map(String).filter((m) => MODULE_KEYS.includes(m));
  const actions = form.getAll('action').map(String).filter((a) => ACTION_KEYS.includes(a));

  const result = await load(await apiAsCaller(), API_ROUTES.setRoleGrants, {
    params: { roleKey },
    body: { modules, actions },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath('/settings/roles');
  return succeeded(`Saved. ${roleKey} now has ${modules.length} modules and ${actions.length} named permissions, and is recorded as confirmed.`);
}

/** Add a role the ten defaults do not carry. */
export async function addRole(_previous: ActionState, form: FormData): Promise<ActionState> {
  const key = text(form, 'key');
  const label = text(form, 'label');
  if (key.length === 0 || label.length === 0) return failed('A key and a label are required.');

  const result = await load(await apiAsCaller(), API_ROUTES.addRole, {
    body: { key, label },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath('/settings/roles');
  return succeeded(`Added ${label}. It starts with no permissions at all — grant them below.`);
}

/**
 * Replace an approval chain.
 *
 * The stages arrive as parallel arrays from a repeating fieldset. A stage with
 * an empty name is dropped rather than rejected: the form ships spare rows so
 * somebody can add a stage without a button, and an untouched spare row is not
 * an error.
 *
 * Nothing is validated here beyond that. Whether a chain can be honoured —
 * duplicate sequences, a quorum naming no role — is `validateChain` in
 * `services/workflow`, and duplicating those rules in a form handler is how two
 * implementations start to disagree.
 */
export async function saveChain(_previous: ActionState, form: FormData): Promise<ActionState> {
  const entityType = text(form, 'entityType');
  const name = text(form, 'name');
  if (entityType.length === 0 || name.length === 0) {
    return failed('A chain needs a name.');
  }

  const names = form.getAll('stageName').map(String);
  const roles = form.getAll('stageRole').map(String);
  const quorums = form.getAll('stageQuorum').map(String);
  const ceilings = form.getAll('stageCeiling').map(String);

  const stages: Array<{
    name: string;
    sequence: number;
    approverRole: string;
    minApprovals: number;
    approvalCeilingPaise: string | null;
  }> = [];
  for (let index = 0; index < names.length; index += 1) {
    const stageName = (names[index] ?? '').trim();
    if (stageName === '') continue;
    let minApprovals: number;
    try {
      minApprovals = parseWholeNumber(quorums[index] ?? '1', 'approvers');
    } catch {
      return failed(`Stage "${stageName}" needs a whole number of approvers.`);
    }
    // Blank is UNSET, which means no limit. It is not zero — zero is a real
    // setting meaning "always escalates" — so an empty box must never become a
    // number here (PO-13d).
    const ceilingText = (ceilings[index] ?? '').trim();
    let approvalCeilingPaise: string | null = null;
    if (ceilingText !== '') {
      try {
        // Rupees in the box, paise on the wire. `parseRupeesToWire` is the only
        // thing allowed to make that conversion — an app does no arithmetic on
        // money, and `Number(text) * 100` is exactly the defect the rule exists
        // to stop.
        approvalCeilingPaise = parseRupeesToWire(ceilingText, 'ceiling');
      } catch {
        return failed(`Stage "${stageName}" needs a rupee amount, or blank for no limit.`);
      }
    }

    stages.push({
      name: stageName,
      sequence: stages.length + 1,
      approverRole: (roles[index] ?? '').trim(),
      minApprovals: minApprovals < 1 ? 1 : minApprovals,
      approvalCeilingPaise,
    });
  }

  if (stages.length === 0) return failed('A chain needs at least one stage.');

  const result = await load(await apiAsCaller(), API_ROUTES.configureChain, {
    params: { entityType },
    body: { name, stages },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath('/settings/approvals');
  return succeeded(
    `Saved. ${name} now has ${stages.length} stage${stages.length === 1 ? '' : 's'}, and it applies to requests from now on.`,
  );
}

/**
 * Record a tax rate.
 *
 * **Provisional, always.** There is no route that writes a verified rate and
 * this form could not reach one if there were. Nothing in the product computes
 * with what is stored here — payments, reports and client billing are all
 * CA-gated and unbuilt — so this records an intention, dated, in a table that
 * already knows the difference between an intention and a verified figure.
 */
export async function recordTaxRate(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const key = text(form, 'key');
  const effectiveFrom = text(form, 'effectiveFrom');
  if (key.length === 0) return failed('A key such as "tds_194c" is required.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
    return failed('An effective date is required, as YYYY-MM-DD.');
  }

  // Basis points, entered as basis points. NOT a percentage the browser
  // multiplies — 18% is 1800 and the arithmetic that turns one into the other
  // does not happen in an app.
  let rateBp: number;
  try {
    rateBp = parseWholeNumber(text(form, 'rateBp'), 'rate');
  } catch {
    return failed('A rate is a whole number of basis points. 0.1% is 10; 18% is 1800.');
  }

  const payeeClass = text(form, 'payeeClass');
  const result = await load(await apiAsCaller(), API_ROUTES.recordTaxRate, {
    body: {
      key,
      rateBp,
      effectiveFrom,
      ...(payeeClass.length === 0 ? {} : { payeeClass }),
      questionRef: 'CA-05',
    },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath('/settings/tax');
  return succeeded(
    'Recorded as PROVISIONAL. Nothing computes with it. It becomes usable when a chartered ' +
      'accountant verifies it against a statute, which is not something this screen can do.',
  );
}

/**
 * Switch one optional module on or off.
 *
 * The form sends the state it wants, not a toggle instruction. Two people on
 * the same screen pressing "Turn on" both get it on; a toggle would have the
 * second one turn it back off against a stale render.
 */
export async function setModule(_previous: ActionState, form: FormData): Promise<ActionState> {
  const key = text(form, 'key');
  if (key.length === 0) return failed('A module is required.');
  const enabled = text(form, 'enabled') === 'true';

  const result = await load(await apiAsCaller(), API_ROUTES.setModule, {
    params: { key },
    body: { enabled },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  // The navigation reads the same list, so the whole shell revalidates rather
  // than this one screen — a module switched on that does not appear until the
  // next hard refresh reads as the switch not having worked.
  revalidatePath('/', 'layout');
  return succeeded(
    result.data.enabled
      ? 'That module is on. It is in the navigation now.'
      : 'That module is off. Nothing was deleted — turning it back on returns the work.',
  );
}

/**
 * Save one document-numbering format.
 *
 * Saving CONFIRMS it. Migration 0021 ships every series `provisional` because
 * its prefix was read off legacy documents rather than chosen by anybody, and
 * a person opening this screen and pressing save is the moment that stops
 * being true.
 *
 * The counter is not in this form and is not in the request. A field that
 * could set it back would re-issue numbers already printed on orders.
 */
export async function saveNumberSeries(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const moduleType = text(form, 'moduleType');
  if (moduleType.length === 0) return failed('A document type is required.');

  const padding = parseWholeNumber(text(form, 'padding'));
  if (padding === null) return failed('The number of digits has to be a whole number.');
  const startingNumber = parseWholeNumber(text(form, 'startingNumber'));
  if (startingNumber === null) return failed('Restart-from has to be a whole number.');

  const fyFormat = text(form, 'fyFormat');
  if (!FY_FORMAT_KEYS.includes(fyFormat as (typeof FY_FORMAT_KEYS)[number])) {
    return failed('Choose how the financial year should be written.');
  }

  const result = await load(await apiAsCaller(), API_ROUTES.saveNumberSeries, {
    params: { moduleType },
    body: {
      prefix: text(form, 'prefix'),
      separator: text(form, 'separator'),
      padding,
      includeFy: checked(form, 'includeFy'),
      fyFormat: fyFormat as (typeof FY_FORMAT_KEYS)[number],
      resetEachFy: checked(form, 'resetEachFy'),
      startingNumber,
    },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath('/settings/number-series');
  return succeeded(
    'Saved, and confirmed. Documents already issued keep the names they were given.',
  );
}

/**
 * A margin typed as a percentage, kept as basis points.
 *
 * **Through `parsePercentToBasisPoints`, not `Math.round(Number(x) * 100)`.**
 * The first version of this did the arithmetic here and eslint refused it,
 * correctly: `22.5 * 100` is 2250.0000000000002 before the rounding, the app
 * is banned from `Number` outright for that reason, and the ban has an
 * alternative precisely so nobody reaches around it. The parser reads the
 * digits and never forms a float at all.
 *
 * Empty means the organisation has not said, and that is stored as NULL rather
 * than as zero — zero is a margin of nothing, which is a different statement
 * from having no view.
 */
function marginBpFrom(raw: string): number | null | 'bad' {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  try {
    const bp = parsePercentToBasisPoints(trimmed, 'margin');
    // 10000 bp is 100%, at which the cost basis is zero. Not a margin.
    return bp < 10000 ? bp : 'bad';
  } catch {
    return 'bad';
  }
}

export async function addTradePackage(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const marginBp = marginBpFrom(text(form, 'marginPct'));
  if (marginBp === 'bad') return failed('A margin is a percentage between 0 and 100.');
  const sortOrder = parseWholeNumber(text(form, 'sortOrder') || '0');
  if (sortOrder === null) return failed('The order has to be a whole number.');

  const result = await load(await apiAsCaller(), API_ROUTES.addTradePackage, {
    body: {
      code: text(form, 'code'),
      name: text(form, 'name'),
      description: text(form, 'description'),
      defaultMarginBp: marginBp,
      sortOrder,
    },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  // The estimating screen offers this list, so it revalidates too.
  revalidatePath('/settings/trade-packages');
  revalidatePath('/estimation');
  return succeeded('Added. It is in the estimating and BOQ pickers now.');
}

export async function saveTradePackage(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const tradePackageId = text(form, 'tradePackageId');
  if (tradePackageId.length === 0) return failed('A trade is required.');

  const marginBp = marginBpFrom(text(form, 'marginPct'));
  if (marginBp === 'bad') return failed('A margin is a percentage between 0 and 100.');
  const sortOrder = parseWholeNumber(text(form, 'sortOrder') || '0');
  if (sortOrder === null) return failed('The order has to be a whole number.');

  const result = await load(await apiAsCaller(), API_ROUTES.updateTradePackage, {
    params: { tradePackageId },
    body: {
      code: text(form, 'code'),
      name: text(form, 'name'),
      description: text(form, 'description'),
      defaultMarginBp: marginBp,
      sortOrder,
      isActive: checked(form, 'isActive'),
    },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath('/settings/trade-packages');
  revalidatePath('/estimation');
  return succeeded(
    checked(form, 'isActive')
      ? 'Saved.'
      : 'Retired. It is out of the pickers and still on every line already costed under it.',
  );
}

/**
 * Save the organisation's registered details.
 *
 * The whole record goes, not a patch. An emptied GSTIN clears the value:
 * "we are not registered" has to be expressible, and a merge would make it
 * impossible to un-say something.
 */
export async function saveCompanyProfile(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const result = await load(await apiAsCaller(), API_ROUTES.saveCompanyProfile, {
    body: {
      gstin: text(form, 'gstin'),
      pan: text(form, 'pan'),
      cin: text(form, 'cin'),
      tan: text(form, 'tan'),
      address: text(form, 'address'),
      phone: text(form, 'phone'),
      email: text(form, 'email'),
      website: text(form, 'website'),
      bankName: text(form, 'bankName'),
      bankBranch: text(form, 'bankBranch'),
      bankIfsc: text(form, 'bankIfsc'),
      documentFooter: text(form, 'documentFooter'),
    },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath('/settings/company');
  return succeeded('Saved. These print on every document raised from now on.');
}

export async function saveOperationalDefaults(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const raw = text(form, 'crmStaleDays');
  let crmStaleDays: number | null = null;
  if (raw !== '') {
    const parsed = parseWholeNumber(raw);
    if (parsed === null) return failed('The stale rule has to be a whole number of days.');
    if (parsed < 1 || parsed > 365) return failed('A stale rule is between 1 and 365 days.');
    crmStaleDays = parsed;
  }

  const result = await load(await apiAsCaller(), API_ROUTES.saveOperationalDefaults, {
    body: { poTerms: text(form, 'poTerms'), crmStaleDays },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath('/settings/company');
  return succeeded(
    crmStaleDays === null
      ? 'Saved. No staleness rule — nothing is marked neglected.'
      : `Saved. An opportunity with no activity for ${String(crmStaleDays)} days is stale.`,
  );
}

/**
 * The two questions about the business. A yes or a no for each — a blank is
 * not sent, because "not answered" is the server's state and this form only
 * ever records an answer. Flags, never figures: nothing here is a rate.
 */
export async function saveTaxSetup(_previous: ActionState, form: FormData): Promise<ActionState> {
  const bundling = text(form, 'worksContractBundling');
  const transporter = text(form, 'transporterPanDeclared');
  const turnover = text(form, 'buyerTurnoverOver10Crore');
  if (!['yes', 'no'].includes(bundling) || !['yes', 'no'].includes(transporter)) {
    return failed('Answer both questions with a yes or a no.');
  }
  const result = await load(await apiAsCaller(), API_ROUTES.saveTaxSetup, {
    body: {
      worksContractBundling: bundling === 'yes',
      transporterPanDeclared: transporter === 'yes',
      ...(turnover === 'yes' || turnover === 'no'
        ? { buyerTurnoverOver10Crore: turnover === 'yes' }
        : {}),
    },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath('/settings/tax');
  revalidatePath('/');
  return succeeded('Recorded. The answers are kept with who gave them and when.');
}

/** Mark the tax review read. The server refuses while a question is unanswered. */
export async function completeTaxReview(_previous: ActionState, _form: FormData): Promise<ActionState> {
  const result = await load(await apiAsCaller(), API_ROUTES.completeTaxReview, {});
  if (result.kind !== 'ok') return failed(messageFor(result));
  revalidatePath('/settings/tax');
  revalidatePath('/');
  return succeeded('The review is marked complete. The rates stay provisional until a CA promotes them.');
}

/**
 * Load the provisional statutory values the organisation does not have yet.
 * The server writes them as provisional, with their sources; loading twice
 * adds nothing.
 */
export async function loadStatutoryValues(_previous: ActionState, _form: FormData): Promise<ActionState> {
  const result = await load(await apiAsCaller(), API_ROUTES.loadStatutoryCatalogue, {});
  if (result.kind !== 'ok') return failed(messageFor(result));
  revalidatePath('/settings/tax');
  const { ratesAdded, thresholdsAdded } = result.data;
  return succeeded(
    ratesAdded === 0 && thresholdsAdded === 0
      ? 'Nothing to add — every provisional value is already here.'
      : `Added ${String(ratesAdded)} rates and ${String(thresholdsAdded)} thresholds, all provisional.`,
  );
}

export async function grantClientProject(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const principalId = text(form, 'principalId');
  const projectId = text(form, 'projectId');
  if (principalId === '' || projectId === '') return failed('A client and a project are required.');

  const result = await load(await apiAsCaller(), API_ROUTES.grantClientProject, {
    params: { principalId },
    body: { projectId },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath('/settings/client-access');
  return succeeded('Done. They see it on their next request.');
}

/**
 * Take a project away from a client login.
 *
 * Bound arguments rather than form fields, so the ids cannot be edited in a
 * page somebody has open — and the server checks the entitlement regardless,
 * because a bound argument is still a request.
 */
export async function revokeClientProject(
  principalId: string,
  projectId: string,
): Promise<void> {
  await load(await apiAsCaller(), API_ROUTES.revokeClientProject, {
    params: { principalId, projectId },
  });
  revalidatePath('/settings/client-access');
}

/**
 * Let a vendor login see one more supplier's orders.
 *
 * The mirror of `grantClientProject`, on the same table. Before this action
 * existed there was no way to create a `subject_kind = 'vendor'` link except
 * `scripts/seed-demo.mjs` writing one by hand, which made vendor onboarding a
 * database task.
 */
export async function grantVendor(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const principalId = text(form, 'principalId');
  const vendorId = text(form, 'vendorId');
  if (principalId === '' || vendorId === '') return failed('A login and a vendor are required.');

  const result = await load(await apiAsCaller(), API_ROUTES.grantVendor, {
    params: { principalId },
    body: { vendorId },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath('/settings/vendor-access');
  return succeeded('Done. They see it on their next request.');
}

/** Bound arguments, for the reason `revokeClientProject` gives. */
export async function revokeVendor(principalId: string, vendorId: string): Promise<void> {
  await load(await apiAsCaller(), API_ROUTES.revokeVendor, {
    params: { principalId, vendorId },
  });
  revalidatePath('/settings/vendor-access');
}

/**
 * Settings › Terminology — one word per pair. The form posts every pair's
 * radio; the server refuses a word outside its pair (the contract's enum,
 * and the row's write path), so nothing here decides what a word may be.
 */
export async function saveTerminology(_previous: ActionState, form: FormData): Promise<ActionState> {
  const choice: Record<string, string> = {};
  for (const key of TERM_KEYS) {
    const word = text(form, key);
    if (word !== '') choice[key] = word;
  }
  const result = await load(await apiAsCaller(), API_ROUTES.saveTerminology, { body: choice as SaveTerminologyInput });
  if (result.kind !== 'ok') return failed(messageFor(result));
  // every label reads the words, so every page is stale: the layout's read is per request, the caches are not
  revalidatePath('/', 'layout');
  return succeeded('Saved. The sidebar, the lists and the documents now use these words.');
}
