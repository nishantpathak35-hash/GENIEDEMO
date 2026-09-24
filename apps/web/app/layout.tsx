import type { ReactNode } from 'react';
import '@cog/design-system/styles.css';
import { Sprite } from '@cog/design-system';

export const metadata = {
  title: 'Construct-O-Genie',
  description: 'ERP for commercial interior design-build contractors',
};

/**
 * The document, and nothing else.
 *
 * The application chrome — sidebar, top bar, who is signed in — is in
 * `(shell)/layout.tsx`, so the sign-in page can render outside it. A sign-in
 * screen wrapped in navigation for an account that is not signed in is the
 * shape that makes a half-authenticated state look normal.
 */
export default function RootLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <html lang="en">
      <body>
        {/* The icon and illustration sprite, once. Every `<use>` on every screen resolves here. */}
        <Sprite />
        {children}
      </body>
    </html>
  );
}
