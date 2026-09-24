'use client';

import { useActionState } from 'react';
import type { ReactNode } from 'react';
import { signIn, type SignInState } from '../actions/session';

const INITIAL: SignInState = { error: null };

export function SignInForm(): ReactNode {
  const [state, action, pending] = useActionState(signIn, INITIAL);

  return (
    <form action={action} className="stack">
      <div className="field">
        <label htmlFor="credential">Credential</label>
        <input id="credential" name="credential" autoComplete="username" required />
        <span className="hint">
          Whatever the identity provider issued you. It is stored in an httpOnly cookie and
          forwarded; this app never inspects it.
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
