import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2Icon,
  MoreHorizontalIcon,
  SearchXIcon,
  Trash2Icon,
} from 'lucide-react';
import { ApiError, type MemberDetail } from '@eduvault/api-contract';
import { meQueryOptions, useCan } from '@eduvault/auth-client';
import {
  Alert,
  AlertDescription,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  ErrorMessage,
  PageSkeleton,
} from '@eduvault/ui';
import { useApi } from '../api';
import { MemberAccessCard } from '../components/member-access-card';
import { MemberCampusesCard } from '../components/member-campuses-card';
import { RemoveMemberDialog } from '../components/remove-member-dialog';
import { RoleWizard } from '../components/role-wizard';
import {
  campusesQueryOptions,
  memberQueryOptions,
  schoolRolesQueryOptions,
} from '../queries';

export interface NewAccountNotice {
  temporaryPassword: string | null;
}

interface MemberPageProps {
  memberId: string;
  schoolName: string;
  notice: NewAccountNotice | undefined;
  onBack: () => void;
  onRemoved: () => Promise<void>;
}

function MemberNotFound({ onBack }: { onBack: () => void }) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchXIcon />
        </EmptyMedia>
        <EmptyTitle>Member not found</EmptyTitle>
        <EmptyDescription>
          We couldn’t find that member. It may have been moved, or it may belong
          to a campus or class you don’t look after.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button type="button" onClick={onBack}>
          Go back
        </Button>
      </EmptyContent>
    </Empty>
  );
}

function AccountNotice({
  name,
  notice,
}: {
  name: string;
  notice: NewAccountNotice;
}) {
  return (
    <Alert>
      <CheckCircle2Icon className="text-success" />
      <AlertDescription>
        {notice.temporaryPassword === null ? (
          `${name} already has an Eduvault account. They sign in with their existing password.`
        ) : (
          <>
            Account created. Temporary password{' '}
            <code className="font-mono">{notice.temporaryPassword}</code>. They
            change it at first sign-in. Next, give them a role below.
          </>
        )}
      </AlertDescription>
    </Alert>
  );
}

function MemberMenu({ onRemove }: { onRemove: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="More actions"
        >
          <MoreHorizontalIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem variant="destructive" onSelect={onRemove}>
          <Trash2Icon />
          Remove from school…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function useMemberPageData(memberId: string) {
  const api = useApi();
  const member = useQuery(memberQueryOptions(api, memberId));
  const roles = useQuery(schoolRolesQueryOptions(api));
  const campuses = useQuery(campusesQueryOptions(api));
  const me = useQuery(meQueryOptions(api));
  return { member, roles, campuses, me };
}

function MemberHeader({
  detail,
  showRemove,
  onRemove,
}: {
  detail: MemberDetail;
  showRemove: boolean;
  onRemove: () => void;
}) {
  return (
    <header className="flex items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1>{detail.name}</h1>
        <p className="text-sm text-muted-foreground">
          {detail.title} · {detail.email ?? detail.username}
        </p>
      </div>
      {showRemove ? <MemberMenu onRemove={onRemove} /> : null}
    </header>
  );
}

function MemberCrumbs({ name, onBack }: { name: string; onBack: () => void }) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>People</BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <button type="button" onClick={onBack}>
              Staff and members
            </button>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>{name}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function useMemberFlags(
  detail: MemberDetail,
  data: ReturnType<typeof useMemberPageData>
) {
  const canEdit = useCan('member', 'update');
  const canDelete = useCan('member', 'delete');
  return {
    canEdit,
    showRemove: canDelete && !detail.lastOwner,
    isSelf: data.me.data?.user.id === detail.userId,
  };
}

function MemberView({
  detail,
  data,
  props,
}: {
  detail: MemberDetail;
  data: ReturnType<typeof useMemberPageData>;
  props: MemberPageProps;
}) {
  const [removing, setRemoving] = useState(false);
  const { canEdit, showRemove, isSelf } = useMemberFlags(detail, data);
  const campuses = data.campuses.data ?? [];

  return (
    <section className="flex flex-col gap-4">
      <MemberCrumbs name={detail.name} onBack={props.onBack} />
      <MemberHeader
        detail={detail}
        showRemove={showRemove}
        onRemove={() => {
          setRemoving(true);
        }}
      />
      {props.notice === undefined ? null : (
        <AccountNotice name={detail.name} notice={props.notice} />
      )}
      <ErrorMessage error={data.roles.error ?? data.campuses.error} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <RoleWizard
            member={detail}
            roles={data.roles.data ?? []}
            campuses={campuses}
            canEdit={canEdit}
            isSelf={isSelf}
          />
          <MemberCampusesCard
            member={detail}
            campuses={campuses}
            canEdit={canEdit}
            isSelf={isSelf}
          />
        </div>
        <MemberAccessCard member={detail} campuses={campuses} />
      </div>
      <RemoveMemberDialog
        member={detail}
        schoolName={props.schoolName}
        open={removing}
        onOpenChange={setRemoving}
        onRemoved={props.onRemoved}
      />
    </section>
  );
}

export function MemberPage(props: MemberPageProps) {
  const data = useMemberPageData(props.memberId);
  const { member } = data;
  if (member.error instanceof ApiError && member.error.status === 404) {
    return <MemberNotFound onBack={props.onBack} />;
  }
  if (member.data === undefined) {
    return member.error === null ? (
      <PageSkeleton rows={3} />
    ) : (
      <ErrorMessage error={member.error} />
    );
  }
  return <MemberView detail={member.data} data={data} props={props} />;
}
