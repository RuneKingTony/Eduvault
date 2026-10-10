import { useQuery } from '@tanstack/react-query';
import { InfoIcon, UserRoundPlusIcon, UsersIcon } from 'lucide-react';
import {
  MEMBER_PAGE_SIZE,
  type Campus,
  type CreateMemberResult,
  type MemberSummary,
  type SchoolRole,
} from '@eduvault/api-contract';
import { Can, useCan } from '@eduvault/auth-client';
import { MEMBER_ROLE } from '@eduvault/policy';
import { initials } from '@eduvault/shared';
import {
  Avatar,
  AvatarFallback,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  ErrorMessage,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  avatarHueClass,
  cn,
} from '@eduvault/ui';
import { useApi } from '../api';
import { AddMemberSheet } from '../components/add-member-sheet';
import { RoleBadges } from '../components/member-roles';
import type { MembersSearch } from '../members-search';
import {
  campusesQueryOptions,
  membersQueryOptions,
  schoolRolesQueryOptions,
} from '../queries';

const ANY_ROLE = 'any';
const INFO =
  'Nobody signs themselves up. The owner adds people; each starts as a plain member with no permissions until roles are added.';

interface MembersPageProps {
  search: MembersSearch;
  schoolName: string;
  onSearchChange: (next: MembersSearch) => void;
  onOpenMember: (id: string) => void;
  onMemberAdded: (result: CreateMemberResult) => void;
  onOpenCampuses: () => void;
}

function Header({
  total,
  schoolName,
  onAdd,
}: {
  total: number | undefined;
  schoolName: string;
  onAdd: () => void;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1>Staff and members</h1>
        <p className="flex items-center gap-1 text-sm text-muted-foreground">
          {total === undefined ? '' : `${total} people in ${schoolName}`}
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" aria-label="About staff and members">
                <InfoIcon className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{INFO}</TooltipContent>
          </Tooltip>
        </p>
      </div>
      <Can permission="member:create">
        <Button type="button" onClick={onAdd}>
          <UserRoundPlusIcon />
          Add member
        </Button>
      </Can>
    </header>
  );
}

function Toolbar({
  search,
  roles,
  onChange,
}: {
  search: MembersSearch;
  roles: readonly SchoolRole[];
  onChange: (next: MembersSearch) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Input
        type="search"
        aria-label="Search"
        placeholder="Search name, title or role"
        defaultValue={search.q ?? ''}
        className="max-w-xs"
        onChange={(event) => {
          const q = event.target.value.trim();
          onChange({ ...search, q: q === '' ? undefined : q, page: undefined });
        }}
      />
      <Select
        value={search.role ?? ANY_ROLE}
        onValueChange={(value) => {
          onChange({
            ...search,
            role: value === ANY_ROLE ? undefined : value,
            page: undefined,
          });
        }}
      >
        <SelectTrigger aria-label="Role">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY_ROLE}>Any role</SelectItem>
          {roles
            .filter((role) => role.slug !== MEMBER_ROLE)
            .map((role) => (
              <SelectItem key={role.slug} value={role.slug}>
                {role.label}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function MemberRow({
  member,
  roles,
  campuses,
  onOpen,
}: {
  member: MemberSummary;
  roles: readonly SchoolRole[];
  campuses: readonly Campus[];
  onOpen: (id: string) => void;
}) {
  const campusNames = campuses
    .filter((campus) => member.campusIds.includes(campus.id))
    .map((campus) => campus.name);
  return (
    <TableRow
      className="cursor-pointer"
      onClick={() => {
        onOpen(member.id);
      }}
    >
      <TableCell>
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarFallback
              className={cn('text-xs', avatarHueClass(member.name))}
            >
              {initials(member.name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <button
              type="button"
              className="text-left font-medium hover:underline"
              onClick={(event) => {
                event.stopPropagation();
                onOpen(member.id);
              }}
            >
              {member.name}
            </button>
            <span className="text-xs text-muted-foreground">
              {member.title}
            </span>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <RoleBadges roles={member.roles} catalogue={roles} />
      </TableCell>
      <TableCell>
        {campusNames.length === 0 ? '—' : campusNames.join(', ')}
      </TableCell>
    </TableRow>
  );
}

function EmptyMembers() {
  return (
    <Empty className="border-0">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <UsersIcon />
        </EmptyMedia>
        <EmptyTitle>No one matches</EmptyTitle>
        <EmptyDescription>
          Try a different name, title or role.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function SkeletonRows() {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-2 p-3">
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className="h-10 w-full" />
      ))}
    </div>
  );
}

function Pager({
  page,
  total,
  onPage,
}: {
  page: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const from = (page - 1) * MEMBER_PAGE_SIZE + 1;
  const to = Math.min(page * MEMBER_PAGE_SIZE, total);
  return (
    <div className="flex items-center justify-between gap-3 p-3 text-sm">
      <span className="text-muted-foreground">
        Showing {from} to {to} of {total}
      </span>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => {
            onPage(page - 1);
          }}
        >
          Previous
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={to >= total}
          onClick={() => {
            onPage(page + 1);
          }}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

function MembersTable({
  items,
  roles,
  campuses,
  onOpen,
}: {
  items: readonly MemberSummary[];
  roles: readonly SchoolRole[];
  campuses: readonly Campus[];
  onOpen: (id: string) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Roles</TableHead>
          <TableHead>Campuses</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((member) => (
          <MemberRow
            key={member.id}
            member={member}
            roles={roles}
            campuses={campuses}
            onOpen={onOpen}
          />
        ))}
      </TableBody>
    </Table>
  );
}

function MembersBody({
  state,
  roles,
  campuses,
  page,
  onOpen,
  onPage,
}: {
  state: {
    isPending: boolean;
    items?: readonly MemberSummary[];
    total: number;
  };
  roles: readonly SchoolRole[];
  campuses: readonly Campus[];
  page: number;
  onOpen: (id: string) => void;
  onPage: (page: number) => void;
}) {
  if (state.isPending) {
    return <SkeletonRows />;
  }
  if (state.items === undefined || state.items.length === 0) {
    return state.items === undefined ? null : <EmptyMembers />;
  }
  return (
    <>
      <MembersTable
        items={state.items}
        roles={roles}
        campuses={campuses}
        onOpen={onOpen}
      />
      <Pager page={page} total={state.total} onPage={onPage} />
    </>
  );
}

function MembersCard({
  props,
  onPage,
}: {
  props: MembersPageProps;
  onPage: (page: number) => void;
}) {
  const api = useApi();
  const { search } = props;
  const members = useQuery(membersQueryOptions(api, search));
  const roles = useQuery(schoolRolesQueryOptions(api));
  const campuses = useQuery(campusesQueryOptions(api));

  return (
    <div className="rounded-xl border">
      <div className="border-b p-3">
        <Toolbar
          search={search}
          roles={roles.data ?? []}
          onChange={props.onSearchChange}
        />
      </div>
      <ErrorMessage error={members.error ?? roles.error ?? campuses.error} />
      <MembersBody
        state={{
          isPending: members.isPending,
          items: members.data?.items,
          total: members.data?.total ?? 0,
        }}
        roles={roles.data ?? []}
        campuses={campuses.data ?? []}
        page={search.page ?? 1}
        onOpen={props.onOpenMember}
        onPage={onPage}
      />
    </div>
  );
}

export function MembersPage(props: MembersPageProps) {
  const api = useApi();
  const { search, onSearchChange } = props;
  const everyone = useQuery(membersQueryOptions(api, {}));
  const canAdd = useCan('member', 'create');

  return (
    <section className="flex flex-col gap-4">
      <Header
        total={everyone.data?.total}
        schoolName={props.schoolName}
        onAdd={() => {
          onSearchChange({ ...search, add: 1 });
        }}
      />
      <MembersCard
        props={props}
        onPage={(next) => {
          onSearchChange({ ...search, page: next > 1 ? next : undefined });
        }}
      />
      {canAdd ? (
        <AddMemberSheet
          open={search.add === 1}
          onOpenChange={(open) => {
            onSearchChange({ ...search, add: open ? 1 : undefined });
          }}
          onAdded={props.onMemberAdded}
          onOpenCampuses={props.onOpenCampuses}
        />
      ) : null}
    </section>
  );
}
