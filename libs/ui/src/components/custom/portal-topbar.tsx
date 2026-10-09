import type { ReactNode } from 'react';
import { SchoolCrest } from './school-crest';

export interface PortalTopbarProps {
  schoolName: string;
  schoolInitials: string;
  logoUrl?: string;
  children?: ReactNode;
}

export function PortalTopbar({
  schoolName,
  schoolInitials,
  logoUrl,
  children,
}: PortalTopbarProps) {
  return (
    <header className="bg-brand-deep text-sidebar-foreground">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <SchoolCrest
            name={schoolName}
            initials={schoolInitials}
            logoUrl={logoUrl}
          />
          <span className="truncate font-display text-base font-semibold">
            {schoolName}
          </span>
        </div>
        {children}
      </div>
      <div className="gold-rule" />
    </header>
  );
}
