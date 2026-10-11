import { CheckIcon, KeyRoundIcon } from 'lucide-react';
import type { Campus, MemberDetail } from '@eduvault/api-contract';
import { can, capSummary } from '@eduvault/policy';
import { Card, CardContent, CardHeader, CardTitle } from '@eduvault/ui';

function campusLine(member: MemberDetail, campuses: readonly Campus[]): string {
  if (member.campusScope === 'all') {
    return 'Every campus';
  }
  const names = campuses
    .filter((campus) => member.campusIds.includes(campus.id))
    .map((campus) => campus.name);
  return names.length === 0 ? 'No campuses' : names.join(', ');
}

function classLine(member: MemberDetail): string | undefined {
  if (can(member.permissions, 'class', 'readAll')) {
    return 'Every class';
  }
  if (!can(member.permissions, 'class', 'read')) {
    return undefined;
  }
  return member.classes.length === 0
    ? 'No classes assigned yet'
    : `${member.classes.map((taught) => taught.displayName).join(', ')} (classes they teach)`;
}

export function MemberAccessCard({
  member,
  campuses,
}: {
  member: MemberDetail;
  campuses: readonly Campus[];
}) {
  const lines = capSummary(member.permissions);
  const classes = classLine(member);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRoundIcon className="size-4" />
          What they can do
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing yet. Give them a role to get started.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {lines.map((line) => (
              <li key={line} className="flex items-start gap-2 text-sm">
                <CheckIcon className="mt-0.5 size-4 text-success" />
                {line}
              </li>
            ))}
          </ul>
        )}
        <dl className="flex flex-col gap-2 border-t pt-3 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Campuses</dt>
            <dd className="text-right">{campusLine(member, campuses)}</dd>
          </div>
          {classes === undefined ? null : (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Classes</dt>
              <dd className="text-right">{classes}</dd>
            </div>
          )}
        </dl>
      </CardContent>
    </Card>
  );
}
