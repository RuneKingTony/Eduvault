import { useEffect, useState } from 'react';
import type { EduvaultAuthClient } from './auth-client';
import { ContextSwitcher, type SwitcherOption } from '@eduvault/ui';

export interface ContextSwitchersProps {
  authClient: EduvaultAuthClient;
  /** Called after the active school or campus changed, so data can refetch. */
  onChanged: () => void;
}

/**
 * School switcher always (a user may belong to several schools); campus
 * switcher only when the active school has more than one campus the user
 * works at, since Better Auth only activates campuses the user belongs to.
 */
export function ContextSwitchers({
  authClient,
  onChanged,
}: ContextSwitchersProps) {
  const session = authClient.useSession();
  const schools = authClient.useListOrganizations();
  const activeSchoolId = session.data?.session.activeOrganizationId ?? null;
  const activeCampusId = session.data?.session.activeTeamId ?? null;
  const [campuses, setCampuses] = useState<{
    schoolId: string;
    options: SwitcherOption[];
  } | null>(null);

  useEffect(() => {
    if (!activeSchoolId) return;
    let cancelled = false;
    void authClient.organization.listUserTeams().then((result) => {
      if (cancelled) return;
      setCampuses({
        schoolId: activeSchoolId,
        options: (result.data ?? [])
          .filter((team) => team.organizationId === activeSchoolId)
          .map((team) => ({ id: team.id, name: team.name })),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [authClient, activeSchoolId]);

  const schoolCampuses =
    campuses?.schoolId === activeSchoolId ? campuses.options : [];

  return (
    <div className="flex items-center gap-4">
      <ContextSwitcher
        label="School"
        options={schools.data ?? []}
        value={activeSchoolId}
        onChange={(organizationId) => {
          void authClient.organization
            .setActive({ organizationId })
            .then(onChanged);
        }}
      />
      {schoolCampuses.length > 1 ? (
        <ContextSwitcher
          label="Campus"
          options={schoolCampuses}
          value={activeCampusId}
          onChange={(teamId) => {
            void authClient.organization
              .setActiveTeam({ teamId })
              .then(onChanged);
          }}
        />
      ) : null}
    </div>
  );
}
