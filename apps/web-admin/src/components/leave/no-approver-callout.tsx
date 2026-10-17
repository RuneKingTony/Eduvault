import { InfoIcon } from 'lucide-react';
import { Alert, AlertDescription } from '@eduvault/ui';

const NO_APPROVER_MESSAGE =
  'Nobody else can approve leave yet. Ask the owner to give someone leave approval.';

export function NoApproverCallout() {
  return (
    <Alert>
      <InfoIcon />
      <AlertDescription>{NO_APPROVER_MESSAGE}</AlertDescription>
    </Alert>
  );
}
