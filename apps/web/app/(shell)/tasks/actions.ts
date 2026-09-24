'use server';

import { revalidatePath } from 'next/cache';
import { API_ROUTES } from '@cog/contracts';
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

const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
const STATUSES = ['pending', 'in_progress', 'completed', 'cancelled'] as const;

type Priority = (typeof PRIORITIES)[number];
type Status = (typeof STATUSES)[number];

function priorityOf(value: string): Priority | null {
  return (PRIORITIES as readonly string[]).includes(value) ? (value as Priority) : null;
}

function statusOf(value: string): Status | null {
  return (STATUSES as readonly string[]).includes(value) ? (value as Status) : null;
}

export async function createTask(_previous: ActionState, form: FormData): Promise<ActionState> {
  const title = text(form, 'title');
  const assignedTo = text(form, 'assignedTo');
  if (title.length === 0 || assignedTo.length === 0) {
    return failed('A title and an assignee are both required.');
  }
  const priority = priorityOf(text(form, 'priority'));

  const result = await load(await apiAsCaller(), API_ROUTES.createTask, {
    body: {
      title,
      assignedTo,
      ...(optionalText(form, 'description') === undefined
        ? {}
        : { description: text(form, 'description') }),
      ...(optionalText(form, 'projectId') === undefined
        ? {}
        : { projectId: text(form, 'projectId') }),
      ...(optionalText(form, 'dueDate') === undefined ? {} : { dueDate: text(form, 'dueDate') }),
      ...(priority === null ? {} : { priority }),
    },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath('/tasks');
  return succeeded('Task raised.');
}

/**
 * Edit a task.
 *
 * **Completing one is a state change, not a field edit**, and the table has a
 * CHECK making the alternative unrepresentable: completed means `completed_at`
 * and `completed_by` are both set. TASK-02 is what that prevents —
 * `updateTask` in the legacy writes both columns with no COALESCE, so any later
 * edit of a completed task erases who completed it and when.
 */
export async function updateTask(
  taskId: string,
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const title = text(form, 'title');
  const assignedTo = text(form, 'assignedTo');
  const priority = priorityOf(text(form, 'priority'));
  const status = statusOf(text(form, 'status'));
  if (priority === null || status === null) return failed('Priority and status must be set.');

  let expectedVersion: number;
  try {
    expectedVersion = parseWholeNumber(text(form, 'expectedVersion'), 'Version');
  } catch (error) {
    if (error instanceof MoneyInputError) return failed(error.message);
    throw error;
  }

  const result = await load(await apiAsCaller(), API_ROUTES.updateTask, {
    params: { taskId },
    body: {
      title,
      assignedTo,
      priority,
      status,
      expectedVersion,
      ...(optionalText(form, 'description') === undefined
        ? {}
        : { description: text(form, 'description') }),
      ...(optionalText(form, 'dueDate') === undefined ? {} : { dueDate: text(form, 'dueDate') }),
      ...(optionalText(form, 'notes') === undefined ? {} : { notes: text(form, 'notes') }),
    },
  });
  if (result.kind !== 'ok') return failed(messageFor(result));

  revalidatePath('/tasks');
  return succeeded('Saved.');
}

export async function deleteTask(taskId: string): Promise<void> {
  await load(await apiAsCaller(), API_ROUTES.deleteTask, { params: { taskId } });
  revalidatePath('/tasks');
}
