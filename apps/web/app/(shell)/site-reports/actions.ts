'use server';

import { revalidatePath } from 'next/cache';
import { API_ROUTES, siteIssueSeverity } from '@cog/contracts';
import { MoneyInputError, parseWholeNumber } from '@cog/money';
import { apiAsCaller } from '../../../lib/api';
import { load } from '@cog/design-system';
import {
  failed,
  messageFor,
  optionalText,
  succeeded,
  text,
  type ActionState,
} from '@cog/design-system';

/**
 * A daily progress report and its manpower.
 *
 * Manpower is a set of floor/trade/head-count rows submitted with the report,
 * so a report and its counts land in one transaction rather than a report
 * existing with counts still to arrive.
 */
/** Raise a site issue. The project is the submitted field; the server checks it is this tenant's. */
export async function raiseSiteIssue(_previous: ActionState, form: FormData): Promise<ActionState> {
  const projectId = text(form, 'projectId');
  const title = text(form, 'title');
  if (projectId.length === 0 || title.length === 0) return failed('Say what is wrong.');
  const severity = siteIssueSeverity.safeParse(text(form, 'severity'));
  const result = await load(await apiAsCaller(), API_ROUTES.raiseSiteIssue, {
    body: { projectId, title, ...(severity.success ? { severity: severity.data } : {}) },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));
  revalidatePath(`/projects/${projectId}/site`);
  revalidatePath('/site-reports');
  return succeeded('Issue raised.');
}

export async function resolveSiteIssue(
  issueId: string,
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const result = await load(await apiAsCaller(), API_ROUTES.resolveSiteIssue, {
    params: { issueId },
    body: { resolution: text(form, 'resolution') },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));
  revalidatePath('/site-reports', 'layout');
  return succeeded('Resolved.');
}

export async function createDailyReport(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const projectId = text(form, 'projectId');
  const reportDate = text(form, 'reportDate');
  if (projectId.length === 0 || reportDate.length === 0) {
    return failed('A project and a date are both required.');
  }

  const floors = form.getAll('manpowerFloor').map((v) => String(v).trim());
  const trades = form.getAll('manpowerTrade').map((v) => String(v).trim());
  const counts = form.getAll('manpowerCount').map((v) => String(v).trim());

  const manpower: Array<{ floor: string; trade: string; headCount: number }> = [];
  try {
    for (let index = 0; index < floors.length; index += 1) {
      const floor = floors[index] ?? '';
      const trade = trades[index] ?? '';
      const count = counts[index] ?? '';
      if (floor.length === 0 && trade.length === 0 && count.length === 0) continue;
      if (floor.length === 0 || trade.length === 0) {
        return failed(`Manpower row ${String(index + 1)} needs both a floor and a trade.`);
      }
      manpower.push({
        floor,
        trade,
        headCount: parseWholeNumber(count, `Manpower row ${String(index + 1)}`),
      });
    }
  } catch (error) {
    if (error instanceof MoneyInputError) return failed(error.message);
    throw error;
  }

  const result = await load(await apiAsCaller(), API_ROUTES.createDailyReport, {
    body: {
      projectId,
      reportDate,
      ...(optionalText(form, 'notes') === undefined ? {} : { notes: text(form, 'notes') }),
      ...(manpower.length === 0 ? {} : { manpower }),
    },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath('/site-reports');
  revalidatePath(`/projects/${projectId}/site`);
  return succeeded(`Recorded for ${result.data.reportDate}.`);
}
