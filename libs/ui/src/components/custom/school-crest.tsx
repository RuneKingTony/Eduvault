import { cn } from '../../lib/utils';

export interface SchoolCrestProps {
  name: string;
  initials: string;
  logoUrl?: string;
  className?: string;
}

const crestClass =
  'flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-linear-to-br from-brand-gold to-brand-gold/70 font-display text-xs font-bold text-brand-deep';

export function SchoolCrest({
  name,
  initials,
  logoUrl,
  className,
}: SchoolCrestProps) {
  if (logoUrl !== undefined) {
    return (
      <img
        src={logoUrl}
        alt={`${name} logo`}
        className={cn('size-8 shrink-0 rounded-lg object-cover', className)}
      />
    );
  }
  return (
    <div
      role="img"
      aria-label={`${name} crest`}
      className={cn(crestClass, className)}
    >
      {initials}
    </div>
  );
}
