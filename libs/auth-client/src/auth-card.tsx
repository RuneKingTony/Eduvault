import type { ReactNode } from 'react';
import { Card, CardContent } from '@eduvault/ui';

export type AuthVariant = 'staff' | 'portal';

const EYEBROW: Record<AuthVariant, string> = {
  staff: 'Staff sign-in',
  portal: 'Students and guardians',
};

export function AuthCard({
  variant,
  children,
}: {
  variant: AuthVariant;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col gap-5">
          <header className="flex flex-col">
            <span className="text-lg font-semibold">Eduvault</span>
            <span className="text-sm text-muted-foreground">
              {EYEBROW[variant]}
            </span>
          </header>
          {children}
        </CardContent>
      </Card>
    </main>
  );
}
