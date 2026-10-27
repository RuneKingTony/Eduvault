import { traceFacts, type WalletJournalMovement } from '@eduvault/api-contract';
import { TraceDialog } from '@eduvault/ui';

export function TraceButton({
  movement,
  currency,
}: {
  movement: WalletJournalMovement;
  currency: string;
}) {
  const { source } = movement;
  if (source?.type !== 'monnify') {
    return null;
  }
  return (
    <TraceDialog
      facts={traceFacts(source, { reference: movement.reference, currency })}
    />
  );
}
