import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Drawer } from '../src/drawer.js';

/**
 * A dialog, not a panel that merely looks like one: `role="dialog"`,
 * `aria-modal`, a name from the rendered title, focus that moves in on open
 * and returns to whatever asked for it on close, and Esc as a second way to
 * close it beside the button. `aria-labelledby` rather than a duplicated
 * `aria-label` is the property worth testing — the accessible name has to
 * come from the heading actually on screen, not a copy of it.
 */

function DrawerHarness({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <Drawer
        title="Raise an order"
        open={open}
        onClose={() => {
          setOpen(false);
          onClose?.();
        }}
      >
        <p>Lines 2.1 and 2.3.</p>
      </Drawer>
    </>
  );
}

describe('Drawer', () => {
  it('renders nothing when closed', () => {
    render(
      <Drawer title="Raise an order" open={false} onClose={vi.fn()}>
        <p>Body</p>
      </Drawer>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is a modal dialog named by its own rendered title', () => {
    render(
      <Drawer title="Raise an order" open onClose={vi.fn()}>
        <p>Body</p>
      </Drawer>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Raise an order' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('renders a subtitle and a footer when given them, and neither when not', () => {
    const { rerender } = render(
      <Drawer title="Raise an order" sub="step 2 of 3" open onClose={vi.fn()} footer={<button type="button">Raise</button>}>
        <p>Body</p>
      </Drawer>,
    );
    expect(screen.getByText('step 2 of 3')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Raise' })).toBeDefined();

    rerender(
      <Drawer title="Raise an order" open onClose={vi.fn()}>
        <p>Body</p>
      </Drawer>,
    );
    expect(screen.queryByText('step 2 of 3')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Raise' })).toBeNull();
  });

  it('moves focus into the panel on open, and back to the opener on close', async () => {
    render(<DrawerHarness />);
    const opener = screen.getByRole('button', { name: 'Open' });

    await userEvent.click(opener);
    const dialog = screen.getByRole('dialog');
    expect(document.activeElement).toBe(dialog);

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('Esc calls onClose', async () => {
    const onClose = vi.fn();
    render(<DrawerHarness onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));

    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('the close button calls onClose', async () => {
    const onClose = vi.fn();
    render(
      <Drawer title="Raise an order" open onClose={onClose}>
        <p>Body</p>
      </Drawer>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a click on the scrim closes it', async () => {
    const onClose = vi.fn();
    const { container } = render(
      <Drawer title="Raise an order" open onClose={onClose}>
        <p>Body</p>
      </Drawer>,
    );
    // The scrim is decorative (`aria-hidden`) and has no role of its own, so
    // it is found the same way `input[type="hidden"]` is found elsewhere in
    // this package's tests — by what it IS, not by a class name.
    const scrim = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    await userEvent.click(scrim);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
