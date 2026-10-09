import type { ReactNode } from 'react';
import { LogOutIcon, PauseCircleIcon, RefreshCwIcon } from 'lucide-react';
import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@eduvault/ui';
import { AuthCard, type AuthVariant } from './auth-card';

export function SuspendedScreen({
  schoolName,
  variant,
  onSignOut,
  onRetry,
  switcher,
}: {
  schoolName: string;
  variant: AuthVariant;
  onSignOut: () => void;
  onRetry: () => void;
  switcher?: ReactNode;
}) {
  return (
    <AuthCard variant={variant}>
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <PauseCircleIcon />
          </EmptyMedia>
          <EmptyTitle>{schoolName} is paused on Eduvault</EmptyTitle>
          <EmptyDescription>Contact the school for details.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          {switcher}
          <Button type="button" onClick={onRetry}>
            <RefreshCwIcon />
            Check again
          </Button>
          <Button type="button" variant="outline" onClick={onSignOut}>
            <LogOutIcon />
            Sign out
          </Button>
        </EmptyContent>
      </Empty>
    </AuthCard>
  );
}
