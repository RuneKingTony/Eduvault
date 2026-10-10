import type { Campus } from '@eduvault/api-contract';
import { Checkbox, Label, Switch } from '@eduvault/ui';

interface CampusToggleListProps {
  campuses: readonly Campus[];
  picked: readonly string[];
  onToggle: (campusId: string, on: boolean) => void;
  control: 'checkbox' | 'switch';
  idPrefix: string;
  showAddress?: boolean;
  isDisabled?: (campusId: string) => boolean;
}

export function CampusToggleList({
  campuses,
  picked,
  onToggle,
  control,
  idPrefix,
  showAddress = false,
  isDisabled = () => false,
}: CampusToggleListProps) {
  return (
    <ul className="divide-y">
      {campuses.map((campus) => {
        const id = `${idPrefix}-${campus.id}`;
        const checked = picked.includes(campus.id);
        const disabled = isDisabled(campus.id);
        return (
          <li key={campus.id} className="flex items-start gap-3 py-2">
            {control === 'checkbox' ? (
              <Checkbox
                id={id}
                checked={checked}
                disabled={disabled}
                onCheckedChange={(on) => {
                  onToggle(campus.id, on === true);
                }}
              />
            ) : (
              <Switch
                id={id}
                checked={checked}
                disabled={disabled}
                onCheckedChange={(on) => {
                  onToggle(campus.id, on);
                }}
              />
            )}
            <Label htmlFor={id} className="flex flex-col items-start gap-0">
              {campus.name}
              {showAddress && campus.address !== null ? (
                <span className="text-xs font-normal text-muted-foreground">
                  {campus.address}
                </span>
              ) : null}
            </Label>
          </li>
        );
      })}
    </ul>
  );
}
