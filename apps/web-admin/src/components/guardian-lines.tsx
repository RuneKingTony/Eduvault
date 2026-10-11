import { EllipsisIcon, PlusIcon } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import {
  GUARDIAN_RELATIONSHIP_LABELS,
  maxGuardiansMessage,
  type GuardianLink,
} from '@eduvault/api-contract';
import { Can } from '@eduvault/auth-client';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  ErrorMessage,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@eduvault/ui';
import { useAdmissionRules } from '../admission-rules';
import { useApi } from '../api';
import { studentGuardiansQueryOptions } from '../queries';
import type { GuardianAction, StudentRef } from './guardian-actions';
import { LoginBadge, PaysFeesBadge, PersonAvatar } from './student-bits';

type OnAction = (action: GuardianAction) => void;

function LineMenu({
  student,
  link,
  onAction,
}: {
  student: StudentRef;
  link: GuardianLink;
  onAction: OnAction;
}) {
  return (
    <Can permission="guardian:link">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Actions for ${link.fullName}`}
          >
            <EllipsisIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => {
              onAction({ kind: 'edit-link', student, link });
            }}
          >
            Edit link…
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              onAction({ kind: 'remove-link', student, link });
            }}
          >
            Remove from {student.firstName}…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </Can>
  );
}

function GuardianLine({
  student,
  link,
  withMenu,
  onAction,
}: {
  student: StudentRef;
  link: GuardianLink;
  withMenu: boolean;
  onAction: OnAction;
}) {
  const open = () => {
    onAction({ kind: 'profile', guardianId: link.guardianId });
  };
  return (
    <li className="flex items-center gap-3 py-2">
      <button
        type="button"
        aria-label={`About ${link.fullName}`}
        onClick={open}
      >
        <PersonAvatar name={link.fullName} photoUrl={link.photoUrl} />
      </button>
      <div className="flex min-w-0 flex-1 flex-col">
        <button
          type="button"
          className="w-fit text-left font-medium hover:underline"
          onClick={open}
        >
          {link.fullName}
        </button>
        <span className="text-xs text-muted-foreground">
          {GUARDIAN_RELATIONSHIP_LABELS[link.relationship]} · {link.phone}
        </span>
      </div>
      {link.paysFees ? <PaysFeesBadge /> : null}
      <LoginBadge link={link} />
      {withMenu ? (
        <LineMenu student={student} link={link} onAction={onAction} />
      ) : null}
    </li>
  );
}

export function GuardianLines({
  student,
  withMenu = false,
  onAction,
}: {
  student: StudentRef;
  withMenu?: boolean;
  onAction: OnAction;
}) {
  const api = useApi();
  const links = useQuery(studentGuardiansQueryOptions(api, student.id));
  if (links.isPending) {
    return <Skeleton className="h-10 w-full" />;
  }
  if (links.data === undefined) {
    return <ErrorMessage error={links.error} />;
  }
  if (links.data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No guardian linked yet.</p>
    );
  }
  return (
    <ul className="divide-y">
      {links.data.map((link) => (
        <GuardianLine
          key={link.guardianId}
          student={student}
          link={link}
          withMenu={withMenu}
          onAction={onAction}
        />
      ))}
    </ul>
  );
}

export function AddGuardianButton({
  student,
  onAction,
}: {
  student: StudentRef;
  onAction: OnAction;
}) {
  const api = useApi();
  const links = useQuery(studentGuardiansQueryOptions(api, student.id));
  const { maxGuardians } = useAdmissionRules();
  const atMax =
    maxGuardians !== undefined && (links.data?.length ?? 0) >= maxGuardians;
  const button = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={atMax}
      onClick={() => {
        onAction({ kind: 'add', student });
      }}
    >
      <PlusIcon />
      Add guardian
    </Button>
  );
  return (
    <Can permission="guardian:link">
      {atMax ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span>{button}</span>
          </TooltipTrigger>
          <TooltipContent>
            {maxGuardiansMessage(maxGuardians).replace(/\.$/, '')}
          </TooltipContent>
        </Tooltip>
      ) : (
        button
      )}
    </Can>
  );
}

export function GuardianPanel({
  student,
  onAction,
}: {
  student: StudentRef;
  onAction: OnAction;
}) {
  return (
    <div className="flex flex-col gap-2 bg-muted/30 p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">
          Guardians of {student.firstName}
        </h3>
        <AddGuardianButton student={student} onAction={onAction} />
      </div>
      <GuardianLines student={student} onAction={onAction} />
    </div>
  );
}
