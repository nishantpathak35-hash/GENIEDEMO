'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import { Choice, Field, Form, Notes } from '@cog/design-system';
import { createDailyReport } from './actions';

export function NewDailyReportForm({
  projects,
}: {
  projects: ReadonlyArray<readonly [string, string]>;
}): ReactNode {
  const [rowCount, setRowCount] = useState(2);
  const rows = Array.from({ length: rowCount }, (_, index) => index);

  return (
    <Form action={createDailyReport} submitLabel="Record report" pendingLabel="Recording…">
      <div className="row">
        <Choice name="projectId" label="Project" required options={projects} />
        <Field name="reportDate" label="Date" type="date" required />
      </div>

      <h3>Manpower on site</h3>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Floor</th>
              <th>Trade</th>
              <th className="num">Head count</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((index) => (
              <tr key={index}>
                <td>
                  <input name="manpowerFloor" aria-label={`Row ${index + 1} floor`} />
                </td>
                <td>
                  <input name="manpowerTrade" aria-label={`Row ${index + 1} trade`} />
                </td>
                <td>
                  <input name="manpowerCount" size={6} aria-label={`Row ${index + 1} count`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="actions">
        <button type="button" className="btn" onClick={() => setRowCount(rowCount + 1)}>
          Add a row
        </button>
      </div>

      <Notes name="notes" label="Notes" rows={2} />
    </Form>
  );
}
