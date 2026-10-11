import { useQueryClient } from '@tanstack/react-query';
import { UsersRoundIcon } from 'lucide-react';
import { AuthCard, SignOutButton, useAuthClient } from '@eduvault/auth-client';
import {
  Button,
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@eduvault/ui';
import { PORTAL_URL } from '../env';

export function PortalOnlyScreen() {
  const authClient = useAuthClient();
  const queryClient = useQueryClient();
  return (
    <AuthCard variant="staff">
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <UsersRoundIcon />
          </EmptyMedia>
          <EmptyTitle>Students and guardians use the portal.</EmptyTitle>
        </EmptyHeader>
        <EmptyContent className="flex-row justify-center">
          <Button asChild>
            <a href={PORTAL_URL}>Go to web-portal</a>
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
