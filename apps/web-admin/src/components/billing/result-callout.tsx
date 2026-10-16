import { Link } from '@tanstack/react-router';
import { ArrowRightIcon, CheckCircle2Icon, InfoIcon } from 'lucide-react';
import { Alert, AlertDescription, Button } from '@eduvault/ui';
import { chargesCount } from './billing-text';
import type { Prepared } from './prepare-sheet';

function nothingNewBody(
  { skipped, none }: Prepared['result'],
  term: string
): string {
  if (none === 0 && skipped > 0) {
    return `Every student you can see already has a ${term} charge. Trying again never charges twice.`;
  }
  return none > 0
    ? `${none} had no fees that apply.`
    : `Nobody you can see needs a ${term} charge.`;
}

export function ResultCallout({ prepared }: { prepared: Prepared }) {
  const { result, termLabel } = prepared;
  const { runId } = result;
  if (runId === null) {
    return (
      <Alert>
        <InfoIcon />
        <AlertDescription>
          <strong>Nothing new: {result.skipped} already charged.</strong>{' '}
          {nothingNewBody(result, termLabel)}
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert>
      <CheckCircle2Icon className="text-success" />
      <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
        <span>
          <strong>{chargesCount(result.created)} ready to check</strong>.{' '}
          {result.skipped} already charged for {termLabel} were skipped
          {result.none > 0 ? `, ${result.none} had no fees that apply` : ''}.
        </span>
        <Button asChild size="sm">
          <Link
            to="/finance/billing/$runId"
            params={{ runId }}
            search={{ page: undefined }}
          >
            Check and send
            <ArrowRightIcon />
          </Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}
