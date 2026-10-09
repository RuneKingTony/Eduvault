import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
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

export function openMenu(name: string | RegExp) {
  fireEvent.keyDown(screen.getByRole('button', { name }), { key: 'Enter' });
}
