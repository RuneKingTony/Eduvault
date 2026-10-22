import type { ReactNode } from 'react';
import {
  KeyRoundIcon,
  LogOutIcon,
  SearchIcon,
  SunMoonIcon,
} from 'lucide-react';
import { splitRoles } from '@eduvault/policy';
import { initials, isPlaceholderEmail } from '@eduvault/shared';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
  avatarHueClass,
  cn,
  setThemeChoice,
  useThemeChoice,
} from '@eduvault/ui';
import type { EduvaultAuthClient } from './auth-client';
import { useOptionalPermissions } from './permissions';
import { rolesLabel } from './role-labels';
import { SchoolMenuItems } from './school-menu-items';

export interface UserMenuUser {
  name: string;
  /** What identifies the login: the email, or the username when the email is a placeholder. */
  login: string;
  image: string | null;
  roles: string;
}

export interface UserMenuProps {
  authClient: EduvaultAuthClient;
  renderTrigger: (user: UserMenuUser) => ReactNode;
  side?: 'top' | 'bottom';
  /** Shows "Command menu" when given; the portal has none. */
  onOpenCommandMenu?: () => void;
  onOpenMyAccess?: () => void;
  onSignedOut?: () => void;
  onSchoolChanged?: () => void;
}

export function UserAvatar({
  name,
  image,
  className,
}: {
  name: string;
  image?: string | null;
  className?: string;
}) {
  return (
    <Avatar className={className}>
      {image !== null && image !== undefined ? (
        <AvatarImage src={image} alt="" />
      ) : null}
      <AvatarFallback className={cn('text-xs', avatarHueClass(name))}>
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

function ThemeItem() {
  const { resolved } = useThemeChoice();
  return (
    <DropdownMenuItem
      onSelect={() => {
        setThemeChoice(resolved === 'dark' ? 'light' : 'dark');
      }}
    >
      <SunMoonIcon />
      Light or dark
    </DropdownMenuItem>
  );
}

function UserMenuHeader({ user }: { user: UserMenuUser }) {
  return (
    <DropdownMenuLabel className="flex items-center gap-2">
      <UserAvatar name={user.name} image={user.image} />
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium text-foreground">
          {user.name}
        </span>
        <span className="truncate text-xs font-normal">{user.login}</span>
      </span>
    </DropdownMenuLabel>
  );
}

function SchoolSection({
  authClient,
  onChanged,
}: {
  authClient: EduvaultAuthClient;
  onChanged: () => void;
}) {
  const schools = authClient.useListOrganizations();
  if ((schools.data?.length ?? 0) < 2) {
    return null;
  }
  return (
    <>
      <SchoolMenuItems authClient={authClient} onSwitched={onChanged} />
      <DropdownMenuSeparator />
    </>
  );
}

function loginOf(user: {
  email: string;
  username?: string | null;
  displayUsername?: string | null;
}): string {
  const username = user.displayUsername ?? user.username ?? null;
  return isPlaceholderEmail(user.email) && username !== null
    ? username
    : user.email;
}

function MenuActions({
  onOpenMyAccess,
  onOpenCommandMenu,
}: Pick<UserMenuProps, 'onOpenCommandMenu' | 'onOpenMyAccess'>) {
  return (
    <>
      {onOpenMyAccess === undefined ? null : (
        <DropdownMenuItem onSelect={onOpenMyAccess}>
          <KeyRoundIcon />
          My access
        </DropdownMenuItem>
      )}
      {onOpenCommandMenu === undefined ? null : (
        <DropdownMenuItem onSelect={onOpenCommandMenu}>
          <SearchIcon />
          Command menu
          <DropdownMenuShortcut>⌘K</DropdownMenuShortcut>
        </DropdownMenuItem>
      )}
      <ThemeItem />
    </>
  );
}

type UserMenuViewProps = UserMenuProps & { roleNames: readonly string[] };

export function UserMenu(props: UserMenuProps) {
  const access = useOptionalPermissions();
  return access === null ? (
    <UserMenuFromMember {...props} />
  ) : (
    <UserMenuView {...props} roleNames={access.roles} />
  );
}

function UserMenuFromMember(props: UserMenuProps) {
  const member = props.authClient.useActiveMember();
  return <UserMenuView {...props} roleNames={splitRoles(member.data?.role)} />;
}

function UserMenuView({
  authClient,
  roleNames,
  renderTrigger,
  side = 'bottom',
  onOpenCommandMenu,
  onOpenMyAccess,
  onSignedOut,
  onSchoolChanged,
}: UserMenuViewProps) {
  const session = authClient.useSession();
  const sessionUser = session.data?.user;
  if (sessionUser === undefined) {
    return null;
  }
  const user: UserMenuUser = {
    name: sessionUser.name,
    image: sessionUser.image ?? null,
    login: loginOf(sessionUser),
    roles: rolesLabel(roleNames),
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{renderTrigger(user)}</DropdownMenuTrigger>
      <DropdownMenuContent side={side} align="end" className="min-w-60">
        <UserMenuHeader user={user} />
        <DropdownMenuSeparator />
        {onSchoolChanged === undefined ? null : (
          <SchoolSection authClient={authClient} onChanged={onSchoolChanged} />
        )}
        <MenuActions
          onOpenMyAccess={onOpenMyAccess}
          onOpenCommandMenu={onOpenCommandMenu}
        />
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            void authClient.signOut().then((result) => {
              if (result.error === null) {
                onSignedOut?.();
              }
            });
          }}
        >
          <LogOutIcon />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
