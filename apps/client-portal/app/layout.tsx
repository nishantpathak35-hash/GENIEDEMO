import type { ReactNode } from 'react';
import '@cog/design-system/styles.css';
import { Sprite } from '@cog/design-system';

export const metadata = {
  title: 'Client portal',
  description: 'Your project, its progress, and the variations awaiting your signature.',
};

/**
 * The document, and nothing else. The chrome is in the signed-in layout, so the
 * sign-in page does not render inside navigation for an account that is not
 * signed in.
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
