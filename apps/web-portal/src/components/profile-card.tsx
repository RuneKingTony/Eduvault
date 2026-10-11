import { ChevronDownIcon, UserIcon } from 'lucide-react';
import type { PortalMe, PortalStudent } from '@eduvault/api-contract';
import { fmtDate } from '@eduvault/shared';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@eduvault/ui';

function Row({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? 'font-mono' : undefined}>{value}</dd>
    </div>
  );
}

export function ProfileCard({
  me,
  student,
}: {
  me: PortalMe;
  student: PortalStudent;
}) {
  return (
    <Card>
      <Collapsible>
        <CardHeader>
          <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 text-left">
            <CardTitle className="flex items-center gap-2">
              <UserIcon aria-hidden="true" />
              Profile
            </CardTitle>
            <ChevronDownIcon aria-hidden="true" className="size-4" />
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent>
            <dl className="divide-y">
              <Row mono label="Admission no." value={student.admissionNumber} />
              <Row
                label="Class teacher"
                value={student.classTeacherName ?? '—'}
              />
              <Row label="Date of birth" value={fmtDate(student.dateOfBirth)} />
              {me.kind === 'student' ? (
                <Row mono label="Username" value={student.username ?? '—'} />
              ) : (
                <Row
                  label="Signed in with"
                  value={me.login.email ?? me.login.username ?? '—'}
                />
              )}
            </dl>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
