import type { ReactNode } from 'react';
import {
  KeyRoundIcon,
  LogOutIcon,
  SearchIcon,
  SunMoonIcon,
} from 'lucide-react';
import { initials } from '@eduvault/shared';
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
import { roleLabels } from './role-labels';

export interface UserMenuUser {
  name: string;
  email: string;
  image: string | null;
  roles: string;
}

export interface UserMenuProps {
  authClient: EduvaultAuthClient;
  renderTrigger: (user: UserMenuUser) => ReactNode;
  side?: 'top' | 'bottom';
  /** Shows "Command menu" when given; the portal has none. */
  onOpenCommandMenu?: () => void;
  showMyAccess?: boolean;
  onSignedOut?: () => void;
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
        <span className="truncate text-xs font-normal">{user.email}</span>
      </span>
    </DropdownMenuLabel>
  );
}

export function UserMenu({
  authClient,
  renderTrigger,
  side = 'bottom',
  onOpenCommandMenu,
  showMyAccess = false,
  onSignedOut,
}: UserMenuProps) {
  const session = authClient.useSession();
  const member = authClient.useActiveMember();
  const sessionUser = session.data?.user;
  if (sessionUser === undefined) {
    return null;
  }
  const user: UserMenuUser = {
    name: sessionUser.name,
    email: sessionUser.email,
    image: sessionUser.image ?? null,
    roles: roleLabels(member.data?.role),
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{renderTrigger(user)}</DropdownMenuTrigger>
      <DropdownMenuContent side={side} align="end" className="min-w-60">
        <UserMenuHeader user={user} />
        <DropdownMenuSeparator />
        {showMyAccess ? (
          <DropdownMenuItem disabled>
            <KeyRoundIcon />
            My access
          </DropdownMenuItem>
        ) : null}
        {onOpenCommandMenu === undefined ? null : (
          <DropdownMenuItem onSelect={onOpenCommandMenu}>
            <SearchIcon />
            Command menu
            <DropdownMenuShortcut>⌘K</DropdownMenuShortcut>
          </DropdownMenuItem>
        )}
        <ThemeItem />
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
