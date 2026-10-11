import { CheckIcon, ClockIcon } from 'lucide-react';
import type { GuardianLink, StudentRow } from '@eduvault/api-contract';
import { fmtDate, inactiveFrom, initials, logoSrc } from '@eduvault/shared';
import { API_URL } from '../env';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  avatarHueClass,
  cn,
} from '@eduvault/ui';

export const nameOf = (person: { firstName: string; lastName: string }) =>
  `${person.firstName} ${person.lastName}`;

export function PersonAvatar({
  name,
  photoUrl = null,
  className,
}: {
  name: string;
  photoUrl?: string | null;
  className?: string;
}) {
  return (
    <Avatar className={className}>
      {photoUrl === null ? null : (
        <AvatarImage src={logoSrc(API_URL, photoUrl)} alt="" />
      )}
      <AvatarFallback className={cn('text-xs', avatarHueClass(name))}>
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

export function StudentNameCell({ row }: { row: StudentRow }) {
  return (
    <div className="flex items-center gap-3">
      <PersonAvatar name={nameOf(row)} />
      <div className="flex flex-col">
        <span className="font-medium">{nameOf(row)}</span>
        <span className="font-mono text-xs text-muted-foreground">
          {row.admissionNumber}
        </span>
      </div>
    </div>
  );
}

const LIFE_BADGES = {
  active: { variant: 'success', label: 'Active' },
  inactive: { variant: 'warning', label: 'Inactive' },
  left: { variant: 'secondary', label: 'Left' },
  graduated: { variant: 'default', label: 'Graduated' },
} as const;

function NotSeenBadge({
  weeks,
  notSeenSince,
}: {
  weeks: number;
  notSeenSince: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="warning">
          <ClockIcon />
          Not seen {weeks} wk
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        Not seen since {fmtDate(notSeenSince)}. Inactive from{' '}
        {fmtDate(inactiveFrom(notSeenSince))} if the school hears nothing.
      </TooltipContent>
    </Tooltip>
  );
}

export function StatusBadges({ row }: { row: StudentRow }) {
  if (row.dueLeft) {
    return <Badge variant="destructive">Due to be marked Left</Badge>;
  }
  const badge = LIFE_BADGES[row.life];
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Badge variant={badge.variant}>{badge.label}</Badge>
      {row.life === 'active' &&
      row.notSeenSince !== null &&
      row.weeksAway !== null ? (
        <NotSeenBadge weeks={row.weeksAway} notSeenSince={row.notSeenSince} />
      ) : null}
    </div>
  );
}

export function PaysFeesBadge() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge>Pays fees</Badge>
      </TooltipTrigger>
      <TooltipContent>
        Pays the school fees and receives the charges
      </TooltipContent>
    </Tooltip>
  );
}

export function LoginBadge({
  link,
}: {
  link: Pick<GuardianLink, 'loginKind' | 'email' | 'username'>;
}) {
  const email = link.loginKind === 'email';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="success">
          <CheckIcon />
          {email ? 'Email login' : 'Username login'}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        {email ? `Signs in with ${link.email}` : `Username ${link.username}`}
      </TooltipContent>
    </Tooltip>
  );
}
