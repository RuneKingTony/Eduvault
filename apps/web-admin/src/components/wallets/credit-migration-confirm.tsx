import { useMutation, useQueryClient } from '@tanstack/react-query';
import { WalletIcon } from 'lucide-react';
import {
  ApiError,
  creditMigrationReportSchema,
  type CreditMigrationReport,
  type CreditMigrationResult,
} from '@eduvault/api-contract';
import { countOf, walletMoney } from '@eduvault/shared';
import { ConfirmDialog, toast } from '@eduvault/ui';
import { useApi } from '../../api';
import {
  creditMigrationQueryOptions,
  invalidateCreditMigration,
} from '../../queries';

const isChanged = (error: Error): boolean =>
  error instanceof ApiError &&
  error.status === 409 &&
  error.body.code === 'CreditMigrationChanged';

function announce(result: CreditMigrationResult): void {
  if (result.replayed) {
    toast.warning('There was no credit left to move.');
    return;
  }
  toast.success(
    `${walletMoney(result.movedMinor, result.currency)} moved into ${countOf(result.familyCount, 'family wallet', 'family wallets')}.`
  );
}

interface MoveHandlers {
  onClose: () => void;
  onChanged: () => void;
}

function useMoveCredit(
  { totals }: CreditMigrationReport,
  { onClose, onChanged }: MoveHandlers
) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.wallets.migrateCredit({
        body: {
          expectedFamilies: totals.familyCount,
          expectedTotalMinor: totals.movableMinor,
        },
      }),
    onSuccess: async (result) => {
      await invalidateCreditMigration(queryClient);
      onClose();
      announce(result);
    },
    onError: async (error) => {
      if (!isChanged(error)) {
        return;
      }
      const fresh = creditMigrationReportSchema.safeParse(
        error instanceof ApiError ? error.body.report : undefined
      );
      if (fresh.success) {
        queryClient.setQueryData(
          creditMigrationQueryOptions(api).queryKey,
          fresh.data
        );
      } else {
        await invalidateCreditMigration(queryClient);
      }
      onClose();
      onChanged();
    },
  });
}

export function ConfirmMove({
  report,
  onClose,
  onChanged,
}: { report: CreditMigrationReport } & MoveHandlers) {
  const move = useMoveCredit(report, { onClose, onChanged });
  const { totals, currency } = report;
  return (
    <ConfirmDialog
      open
      title="Move this credit to family wallets?"
      description="One entry is added for each family. The children’s fees owed and their history stay as they are."
      details={[
        {
          label: 'Families',
          value: countOf(totals.familyCount, 'family', 'families'),
        },
        {
          label: 'Children',
          value: countOf(totals.childCount, 'child', 'children'),
        },
        {
          label: 'Total to move',
          value: walletMoney(totals.movableMinor, currency),
        },
      ]}
      note="A family’s credit is moved once. Credit that appears later stays on the child’s account."
      icon={<WalletIcon />}
      confirmLabel="Move credit"
      pending={move.isPending}
      error={move.error !== null && isChanged(move.error) ? null : move.error}
      onConfirm={() => {
        move.mutate();
      }}
      onCancel={() => {
        move.reset();
        onClose();
      }}
    />
  );
}
