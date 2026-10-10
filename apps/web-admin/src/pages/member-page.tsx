import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2Icon,
  KeyRoundIcon,
  MoreHorizontalIcon,
  PencilIcon,
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
import { EditTitleDialog } from '../components/edit-title-dialog';
import { MemberCampusesCard } from '../components/member-campuses-card';
import { RemoveMemberDialog } from '../components/remove-member-dialog';
import { ResetPasswordDialog } from '../components/reset-password-dialog';
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

function MemberMenu({
  onReset,
  onRemove,
}: {
  onReset: (() => void) | undefined;
  onRemove: (() => void) | undefined;
}) {
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
        {onReset === undefined ? null : (
          <DropdownMenuItem onSelect={onReset}>
            <KeyRoundIcon />
            Reset password…
          </DropdownMenuItem>
        )}
        {onRemove === undefined ? null : (
          <DropdownMenuItem variant="destructive" onSelect={onRemove}>
            <Trash2Icon />
            Remove from school…
          </DropdownMenuItem>
        )}
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
  canEditTitle,
  onReset,
  onRemove,
}: {
  detail: MemberDetail;
  canEditTitle: boolean;
  onReset: (() => void) | undefined;
  onRemove: (() => void) | undefined;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <header className="flex items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1>{detail.name}</h1>
        <p className="flex items-center gap-1 text-sm text-muted-foreground">
          {detail.title} · {detail.email ?? detail.username}
          {canEditTitle ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Edit job title"
              onClick={() => {
                setEditing(true);
              }}
            >
              <PencilIcon />
            </Button>
          ) : null}
        </p>
      </div>
      {onReset === undefined && onRemove === undefined ? null : (
        <MemberMenu onReset={onReset} onRemove={onRemove} />
      )}
      <EditTitleDialog
        member={detail}
        open={editing}
        onOpenChange={setEditing}
      />
    </header>
  );
}

function MemberTop({
  detail,
  schoolName,
  canEditTitle,
  showReset,
  showRemove,
  onRemoved,
}: {
  detail: MemberDetail;
  schoolName: string;
  canEditTitle: boolean;
  showReset: boolean;
  showRemove: boolean;
  onRemoved: () => Promise<void>;
}) {
  const [removing, setRemoving] = useState(false);
  const [resetting, setResetting] = useState(false);
  return (
    <>
      <MemberHeader
        detail={detail}
        canEditTitle={canEditTitle}
        onReset={
          showReset
            ? () => {
                setResetting(true);
              }
            : undefined
        }
        onRemove={
          showRemove
            ? () => {
                setRemoving(true);
              }
            : undefined
        }
      />
      <ResetPasswordDialog
        member={detail}
        open={resetting}
        onOpenChange={setResetting}
      />
      <RemoveMemberDialog
        member={detail}
        schoolName={schoolName}
        open={removing}
        onOpenChange={setRemoving}
        onRemoved={onRemoved}
      />
    </>
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
    showReset: canEdit && data.me.data?.user.id !== detail.userId,
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
  const { canEdit, showRemove, showReset, isSelf } = useMemberFlags(
    detail,
    data
  );
  const campuses = data.campuses.data ?? [];

  return (
    <section className="flex flex-col gap-4">
      <MemberCrumbs name={detail.name} onBack={props.onBack} />
      <MemberTop
        detail={detail}
        schoolName={props.schoolName}
        canEditTitle={canEdit}
        showReset={showReset}
        showRemove={showRemove}
        onRemoved={props.onRemoved}
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
