import type { ReactNode } from 'react';
import { SignInForm } from './form';

export const metadata = { title: 'Sign in · Platform administration' };

export default function SignInPage(): ReactNode {
  return (
    <main className="signin">
      <section className="panel">
        <div className="card-b">
          <h1>Platform administration</h1>
          <p className="subtitle u-mb-9">
            Sign in with a platform account.
          </p>
          <SignInForm />
        </div>
      </section>
    </main>
  );
}
