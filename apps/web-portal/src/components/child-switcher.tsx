import type { PortalChild } from '@eduvault/api-contract';
import { UserAvatar } from '@eduvault/auth-client';
import { Button, cn } from '@eduvault/ui';

interface ChildSwitcherProps {
  linked: readonly PortalChild[];
  selectedId: string | undefined;
  onSelect: (childId: string) => void;
  className?: string;
}

export function ChildSwitcher({
  linked,
  selectedId,
  onSelect,
  className,
}: ChildSwitcherProps) {
  return (
    <div
      role="group"
      aria-label="Viewing child"
      className={cn('flex items-center gap-2 overflow-x-auto', className)}
    >
      {linked.map((child) => {
        const selected = child.id === selectedId;
        return (
          <Button
            key={child.id}
            type="button"
            size="sm"
            variant={selected ? 'default' : 'outline'}
            aria-pressed={selected}
            className="shrink-0"
            onClick={() => {
              onSelect(child.id);
            }}
          >
            <span aria-hidden="true" className="contents">
              <UserAvatar
                name={`${child.firstName} ${child.lastName}`}
                className="size-5"
              />
            </span>
            {child.firstName}
          </Button>
        );
      })}
    </div>
  );
}
