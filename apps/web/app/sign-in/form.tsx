'use client';

import { useActionState } from 'react';
import type { ReactNode } from 'react';
import { signIn, type SignInState } from '../actions/session';

const INITIAL: SignInState = { error: null };

export function SignInForm({ next }: { next: string }): ReactNode {
  const [state, action, pending] = useActionState(signIn, INITIAL);

  return (
    <form action={action} className="stack">
      <input type="hidden" name="next" value={next} />
      <div className="field">
        <label htmlFor="credential">Credential</label>
        <input
          id="credential"
          name="credential"
          autoComplete="username"
          defaultValue="superadmin@constructogenie.in"
          placeholder="superadmin@constructogenie.in"
          required
        />
        <span className="hint">
          Sign in with superadmin@constructogenie.in or any company email address.
        </span>
      </div>
      {state.error === null ? null : (
        <div className="notice refused">
          <p>{state.error}</p>
        </div>
      )}
      <div className="actions">
        <button type="submit" className="btn primary" disabled={pending}>
          {pending ? 'Checking…' : 'Sign in'}
        </button>
      </div>
    </form>
  );
}
