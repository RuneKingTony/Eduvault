import { PencilIcon } from 'lucide-react';
import { ROLE_DESCRIPTION_MAX, ROLE_LABEL_MAX } from '@eduvault/policy';
import { ROLE_NAME_REQUIRED } from '@eduvault/api-contract';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  FieldError,
  Input,
  Label,
  Textarea,
} from '@eduvault/ui';

interface RoleDetailsProps {
  label: string;
  description: string;
  readOnly: boolean;
  nameTouched: boolean;
  nameError: string | undefined;
  onLabelChange: (label: string) => void;
  onLabelBlur: () => void;
  onDescriptionChange: (description: string) => void;
}

export function RoleDetails({
  label,
  description,
  readOnly,
  nameTouched,
  nameError,
  onLabelChange,
  onLabelBlur,
  onDescriptionChange,
}: RoleDetailsProps) {
  const error =
    nameError ??
    (nameTouched && label.trim() === '' ? ROLE_NAME_REQUIRED : undefined);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PencilIcon className="size-4" />
          Details
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="role-name">Name</Label>
          <Input
            id="role-name"
            value={label}
            placeholder="Fees approver"
            maxLength={ROLE_LABEL_MAX}
            disabled={readOnly}
            aria-invalid={error !== undefined}
            onBlur={onLabelBlur}
            onChange={(event) => {
              onLabelChange(event.target.value);
            }}
          />
          <p className="text-xs text-muted-foreground">
            Shown next to people’s names. You can rename it any time.
          </p>
          <FieldError message={error} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="role-description">Description</Label>
          <Textarea
            id="role-description"
            value={description}
            maxLength={ROLE_DESCRIPTION_MAX}
            disabled={readOnly}
            onChange={(event) => {
              onDescriptionChange(event.target.value);
            }}
          />
          <p className="text-right text-xs text-muted-foreground">
            {description.length}/{ROLE_DESCRIPTION_MAX}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
