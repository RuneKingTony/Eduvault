import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SidebarProvider, TooltipProvider } from '@eduvault/ui';
import type { EduvaultAuthClient } from './auth-client';

export const fakeClient = (parts: Record<string, unknown>) =>
  parts as unknown as EduvaultAuthClient;

export function renderInSidebar(ui: ReactNode) {
  return render(
    <TooltipProvider>
      <SidebarProvider>{ui}</SidebarProvider>
    </TooltipProvider>
  );
}

export async function openMenu(name: string | RegExp) {
  await userEvent.setup().click(screen.getByRole('button', { name }));
}
