import { CheckIcon } from 'lucide-react';
import { Button, SheetFooter } from '@eduvault/ui';

export function SaveFooter({
  label,
  pending,
  onCancel,
  onSave,
}: {
  label: string;
  pending: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <SheetFooter>
      <Button type="button" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="button" disabled={pending} onClick={onSave}>
        <CheckIcon />
        {label}
      </Button>
    </SheetFooter>
  );
}
