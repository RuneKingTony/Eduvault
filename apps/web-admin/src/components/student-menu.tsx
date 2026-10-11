import { Fragment } from 'react';
import { EllipsisIcon } from 'lucide-react';
import type { StudentDetail } from '@eduvault/api-contract';
import { useCan } from '@eduvault/auth-client';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@eduvault/ui';
import {
  menuItems,
  type MenuItem,
  type StudentAction,
} from './student-lifecycle-model';

export function useMenuItems(student: StudentDetail): MenuItem[] {
  const place = useCan('enrollment', 'place');
  const markAway = useCan('student', 'markAway');
  const archive = useCan('student', 'archive');
  return menuItems(student, { place, markAway, archive });
}

export function StudentMenu({
  items,
  onAction,
}: {
  items: readonly MenuItem[];
  onAction: (action: StudentAction) => void;
}) {
  if (items.length === 0) {
    return null;
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="More actions"
        >
          <EllipsisIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items.map((item) => (
          <Fragment key={item.action}>
            {item.destructive === true ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem
              variant={item.destructive === true ? 'destructive' : 'default'}
              onSelect={() => {
                onAction(item.action);
              }}
            >
              {item.label}
            </DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
