import { LogOutIcon, SchoolIcon } from 'lucide-react';
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

const COPY: Record<
  AuthVariant,
  { title: string; description: string; footer?: string }
> = {
  staff: {
    title: 'You’re not in a school yet',
    description:
      'Your account exists but no school has added you. Ask the school owner to add you as a member.',
    footer: 'Users can’t create schools themselves',
  },
  portal: {
    title: 'You’re not linked to a school yet',
    description: 'Ask the school to add you as a student or guardian.',
  },
};

export function NoSchoolScreen({
  variant,
  onSignOut,
}: {
  variant: AuthVariant;
  onSignOut: () => void;
}) {
  const { title, description, footer } = COPY[variant];
  return (
    <AuthCard variant={variant}>
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SchoolIcon />
          </EmptyMedia>
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription>{description}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button type="button" variant="outline" onClick={onSignOut}>
            <LogOutIcon />
            Sign out
          </Button>
        </EmptyContent>
      </Empty>
      {footer === undefined ? null : (
        <p className="text-center text-xs text-muted-foreground">{footer}</p>
      )}
    </AuthCard>
  );
}
