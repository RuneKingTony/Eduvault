import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@eduvault/ui';
import { AuthCard, type AuthVariant } from './auth-card';
import { useAuthClient } from './auth-client-context';
import { SignOutButton } from './sign-out-button';

export function WrongAppScreen({
  variant,
  icon,
  title,
  link,
}: {
  variant: AuthVariant;
  icon: ReactNode;
  title: string;
  link: { href: string; label: string };
}) {
  const authClient = useAuthClient();
  const queryClient = useQueryClient();
  return (
    <AuthCard variant={variant}>
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">{icon}</EmptyMedia>
          <EmptyTitle>{title}</EmptyTitle>
        </EmptyHeader>
        <EmptyContent className="flex-row justify-center">
          <Button asChild>
            <a href={link.href}>{link.label}</a>
          </Button>
          <SignOutButton
            authClient={authClient}
            onSignedOut={() => {
              queryClient.clear();
            }}
          />
        </EmptyContent>
      </Empty>
    </AuthCard>
  );
}
