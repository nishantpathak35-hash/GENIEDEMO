import type { ReactNode } from 'react';
import { SignInForm } from './form';

export const metadata = { title: 'Sign in · Client portal' };

export default function SignInPage(): ReactNode {
  return (
    <main className="signin">
      <section className="panel">
        <div className="card-b">
          <h1>Client portal</h1>
          <p className="subtitle u-mb-9">
            Sign in to see your project.
          </p>
          <SignInForm />
        </div>
      </section>
    </main>
  );
}
