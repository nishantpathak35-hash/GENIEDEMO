import type { ReactNode } from 'react';
import { SignInForm } from './form';

export const metadata = { title: 'Sign in · Construct-O-Genie' };

/**
 * The one screen outside the shell.
 *
 * What it asks for depends on how the API is configured, and the app does not
 * know: with `AUTH_PROVIDER=local` the credential is the seeded address, with
 * WorkOS it will be an SSO redirect. Neither is decided here — the app posts
 * whatever was typed and the server says whether it resolves.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<ReactNode> {
  // the address to go back to afterwards (`proxy.ts`); the action checks it is a path here
  const next = (await searchParams)['next'] ?? '/';
  return (
    <main className="signin">
      <section className="panel">
        <div className="card-b">
          <h1>Construct-O-Genie</h1>
          <p className="subtitle u-mb-9">
            Sign in to your organisation.
          </p>
          <SignInForm next={next} />
        </div>
      </section>
    </main>
  );
}
