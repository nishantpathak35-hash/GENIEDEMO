'use client';

import type { ReactNode } from 'react';
import { Choice, Field, Form, Notes } from '@cog/design-system';
import { TASK_PRIORITIES, TASK_STATUSES } from '@cog/design-system';
import { createTask, deleteTask, updateTask } from './actions';

export function NewTaskForm({
  people,
  projects,
}: {
  people: ReadonlyArray<readonly [string, string]>;
  projects: ReadonlyArray<readonly [string, string]>;
}): ReactNode {
  return (
    <Form action={createTask} submitLabel="Raise task" pendingLabel="Raising…">
      <Field name="title" label="Title" required />
      <div className="row">
        <Choice name="assignedTo" label="Assign to" required options={people} />
        <Choice name="projectId" label="Project (optional)" options={projects} />
        <Field name="dueDate" label="Due date" type="date" />
        <Choice name="priority" label="Priority" options={TASK_PRIORITIES} defaultValue="medium" />
      </div>
      <Notes name="description" label="Description" rows={2} />
    </Form>
  );
}

export interface TaskDefaults {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly assignedTo: string;
  readonly dueDate: string;
  readonly priority: string;
  readonly status: string;
  readonly notes: string;
  readonly version: string;
}

export function EditTaskForm({
  task,
  people,
}: {
  task: TaskDefaults;
  people: ReadonlyArray<readonly [string, string]>;
}): ReactNode {
  return (
    <Form action={updateTask.bind(null, task.id)} submitLabel="Save task" pendingLabel="Saving…">
      <input type="hidden" name="expectedVersion" defaultValue={task.version} />
      <Field name="title" label="Title" required defaultValue={task.title} />
      <div className="row">
        <Choice
          name="assignedTo"
          label="Assign to"
          required
          options={people}
          defaultValue={task.assignedTo}
        />
        <Field name="dueDate" label="Due date" type="date" defaultValue={task.dueDate} />
        <Choice
          name="priority"
          label="Priority"
          required
          options={TASK_PRIORITIES}
          defaultValue={task.priority}
        />
        <Choice
          name="status"
          label="Status"
          required
          options={TASK_STATUSES}
          defaultValue={task.status}
          hint="Completing a task records who and when, as one state change — a later edit cannot erase it."
        />
      </div>
      <Notes name="description" label="Description" rows={2} defaultValue={task.description} />
      <Notes name="notes" label="Notes" rows={2} defaultValue={task.notes} />
    </Form>
  );
}

export function DeleteTaskButton({ taskId }: { taskId: string }): ReactNode {
  return (
    <form action={deleteTask.bind(null, taskId)} className="inline">
      <button type="submit" className="btn danger sm">
        Delete
      </button>
    </form>
  );
}
