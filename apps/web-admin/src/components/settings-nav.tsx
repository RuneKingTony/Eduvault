import type { ReactNode } from 'react';
import { Link, useRouter, useRouterState } from '@tanstack/react-router';
import { usePermissions } from '@eduvault/auth-client';
import { cn } from '@eduvault/ui';
import {
  SETTINGS_SECTIONS,
  visibleSettings,
  type SettingsSection,
} from '../nav';

function groupSections(
  sections: readonly SettingsSection[]
): { group: string; sections: SettingsSection[] }[] {
  const groups: { group: string; sections: SettingsSection[] }[] = [];
  for (const section of sections) {
    const found = groups.find((entry) => entry.group === section.group);
    if (found === undefined) {
      groups.push({ group: section.group, sections: [section] });
    } else {
      found.sections.push(section);
    }
  }
  return groups;
}

function SettingsNav() {
  const router = useRouter();
  const { permissions } = usePermissions();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const built = new Set(Object.keys(router.routesByPath));
  const groups = groupSections(
    visibleSettings(SETTINGS_SECTIONS, built, permissions)
  );
  return (
    <nav aria-label="Settings sections" className="flex flex-col gap-4">
      {groups.map(({ group, sections }) => (
        <div key={group} className="flex flex-col gap-1">
          <p className="px-2 text-xs font-medium text-muted-foreground">
            {group}
          </p>
          <ul className="flex flex-col gap-0.5">
            {sections.map((section) => {
              const current =
                pathname === section.route ||
                pathname.startsWith(`${section.route}/`);
              return (
                <li key={section.id}>
                  <Link
                    to={section.route}
                    aria-current={current ? 'page' : undefined}
                    className={cn(
                      'block rounded-md px-2 py-1.5 text-sm hover:bg-muted',
                      current && 'bg-muted font-medium'
                    )}
                  >
                    {section.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <SettingsNav />
      <div className="flex min-w-0 flex-col gap-4">{children}</div>
    </div>
  );
}
