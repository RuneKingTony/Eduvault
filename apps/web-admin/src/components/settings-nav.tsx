import type { ChangeEvent, ReactNode } from 'react';
import {
  Link,
  useNavigate,
  useRouter,
  useRouterState,
} from '@tanstack/react-router';
import { usePermissions } from '@eduvault/auth-client';
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
  cn,
} from '@eduvault/ui';
import {
  SETTINGS_SECTIONS,
  underRoute,
  visibleSettings,
  type SettingsSection,
} from '../nav';

interface SectionGroup {
  group: string;
  sections: SettingsSection[];
}

function groupSections(sections: readonly SettingsSection[]): SectionGroup[] {
  const groups: SectionGroup[] = [];
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

function useSettingsGroups() {
  const router = useRouter();
  const { permissions } = usePermissions();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const built = new Set(Object.keys(router.routesByPath));
  const groups = groupSections(
    visibleSettings(SETTINGS_SECTIONS, built, permissions)
  );
  return { groups, pathname };
}

function SectionSelect({
  groups,
  pathname,
}: {
  groups: readonly SectionGroup[];
  pathname: string;
}) {
  const navigate = useNavigate();
  const current = groups
    .flatMap((entry) => entry.sections)
    .find((section) => underRoute(section.route, pathname));
  function choose(event: ChangeEvent<HTMLSelectElement>) {
    const route = event.target.value;
    if (route !== '') {
      void navigate({ to: route });
    }
  }
  return (
    <NativeSelect
      className="w-full lg:hidden"
      aria-label="Settings section"
      value={current?.route ?? ''}
      onChange={choose}
    >
      {current === undefined ? (
        <NativeSelectOption value="">Choose a section</NativeSelectOption>
      ) : null}
      {groups.map(({ group, sections }) => (
        <NativeSelectOptGroup key={group} label={group}>
          {sections.map((section) => (
            <NativeSelectOption key={section.id} value={section.route}>
              {section.label}
            </NativeSelectOption>
          ))}
        </NativeSelectOptGroup>
      ))}
    </NativeSelect>
  );
}

function SectionList({
  groups,
  pathname,
}: {
  groups: readonly SectionGroup[];
  pathname: string;
}) {
  return (
    <nav
      aria-label="Settings sections"
      className="hidden flex-col gap-4 lg:flex"
    >
      {groups.map(({ group, sections }) => (
        <div key={group} className="flex flex-col gap-1">
          <p className="px-2 text-xs font-medium text-muted-foreground">
            {group}
          </p>
          <ul className="flex flex-col gap-0.5">
            {sections.map((section) => {
              const current = underRoute(section.route, pathname);
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
  const { groups, pathname } = useSettingsGroups();
  return (
    <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <SectionSelect groups={groups} pathname={pathname} />
      <SectionList groups={groups} pathname={pathname} />
      <div className="flex min-w-0 flex-col gap-4 lg:col-start-2 lg:row-start-1">
        {children}
      </div>
    </div>
  );
}
