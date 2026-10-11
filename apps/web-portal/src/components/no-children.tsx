import { UsersRoundIcon } from 'lucide-react';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@eduvault/ui';

export function NoChildren() {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <UsersRoundIcon />
        </EmptyMedia>
        <EmptyTitle>No children linked</EmptyTitle>
        <EmptyDescription>
          Your login still works. Ask the school office to link your children.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
