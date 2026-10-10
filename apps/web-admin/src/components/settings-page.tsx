import type { ReactNode } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  cn,
} from '@eduvault/ui';

export function SettingsHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <header className="flex flex-col gap-1">
      <h1>{title}</h1>
      <p className="text-sm text-muted-foreground">{description}</p>
    </header>
  );
}

export function SettingsSection({
  title,
  description,
  danger = false,
  footer,
  children,
}: {
  title: string;
  description?: string;
  danger?: boolean;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className={cn(danger && 'border-destructive/40')}>
      <CardHeader>
        <CardTitle className={cn(danger && 'text-destructive')}>
          {title}
        </CardTitle>
        {description === undefined ? null : (
          <CardDescription>{description}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
      {footer === undefined ? null : (
        <CardFooter className="justify-end gap-2">{footer}</CardFooter>
      )}
    </Card>
  );
}

export function SettingsRow({
  label,
  description,
  children,
  leading,
}: {
  label: string;
  description: string;
  children?: ReactNode;
  leading?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {leading}
        <div className="flex min-w-0 flex-col">
          <span className="font-medium">{label}</span>
          <span className="text-sm text-muted-foreground">{description}</span>
        </div>
      </div>
      {children === undefined ? null : (
        <div className="flex items-center gap-2">{children}</div>
      )}
    </div>
  );
}
