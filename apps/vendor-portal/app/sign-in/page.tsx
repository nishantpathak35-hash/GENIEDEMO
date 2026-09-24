import type { ReactNode } from 'react';
import { SignInForm } from './form';

export const metadata = { title: 'Sign in · Vendor portal' };

export default function SignInPage(): ReactNode {
  return (
    <main className="signin">
      <section className="panel">
        <div className="card-b">
          <h1>Vendor portal</h1>
          <p className="subtitle u-mb-9">
            Sign in to see the orders issued to you.
          </p>
          <SignInForm />
        </div>
      </section>
    </main>
  );
}
