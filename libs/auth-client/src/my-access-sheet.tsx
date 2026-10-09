import type { ReactNode } from 'react';
import {
  Badge,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@eduvault/ui';
import { capSummary } from '@eduvault/policy';
import { usePermissions } from './permissions';
import { listedRoles, roleLabel } from './role-labels';
import { UserAvatar } from './user-menu';

export interface MyAccessSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: { name: string; email: string; image: string | null };
  schoolName: string;
  campusNames: readonly string[];
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function RolesSection({ roles }: { roles: readonly string[] }) {
  return (
    <Section title="Roles">
      {roles.length === 0 ? (
        <span>—</span>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {roles.map((role) => (
            <Badge key={role} variant="secondary">
              {roleLabel(role)}
            </Badge>
          ))}
        </div>
      )}
    </Section>
  );
}

function CanDoSection({ lines }: { lines: readonly string[] }) {
  return (
    <Section title="What you can do">
      {lines.length === 0 ? (
        <p className="text-muted-foreground">
          Nothing yet. Ask the owner to give you a role.
        </p>
      ) : (
        <ul className="flex list-disc flex-col gap-1 pl-4">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export function MyAccessSheet({
  open,
  onOpenChange,
  user,
  schoolName,
  campusNames,
}: MyAccessSheetProps) {
  const access = usePermissions();
  const classPermissions = (
    access.permissions as Record<string, readonly string[] | undefined>
  )['class'];
  const campuses =
    access.campusScope === 'all' ? 'Every campus' : campusNames.join(', ');

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="gap-0 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>My access</SheetTitle>
          <SheetDescription>
            What you can do in {schoolName}, and why.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-5 px-4 pb-4">
          <div className="flex items-center gap-2">
            <UserAvatar name={user.name} image={user.image} />
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-medium">{user.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {user.email}
              </span>
            </span>
          </div>
          <RolesSection roles={listedRoles(access.roles)} />
          <Section title="Campuses">
            <span>{campuses === '' ? '—' : campuses}</span>
          </Section>
          {classPermissions?.includes('readAll') === true ? (
            <Section title="Classes">
              <span>Every class</span>
            </Section>
          ) : null}
          <CanDoSection lines={capSummary(access.permissions)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
