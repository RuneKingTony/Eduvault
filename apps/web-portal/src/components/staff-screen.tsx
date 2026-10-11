import { useQueryClient } from '@tanstack/react-query';
import { LayoutDashboardIcon } from 'lucide-react';
import { AuthCard, SignOutButton, useAuthClient } from '@eduvault/auth-client';
import {
  Button,
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@eduvault/ui';
import { ADMIN_URL } from '../env';

export function StaffScreen() {
  const authClient = useAuthClient();
  const queryClient = useQueryClient();
  return (
    <AuthCard variant="portal">
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LayoutDashboardIcon />
          </EmptyMedia>
          <EmptyTitle>
            This portal is for students and guardians. Staff use web-admin.
          </EmptyTitle>
        </EmptyHeader>
        <EmptyContent className="flex-row justify-center">
          <Button asChild>
            <a href={ADMIN_URL}>Go to web-admin</a>
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
