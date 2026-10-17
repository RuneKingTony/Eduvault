import { Link } from '@tanstack/react-router';
import { InfoIcon, WalletIcon } from 'lucide-react';
import type { Invoice } from '@eduvault/api-contract';
import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@eduvault/ui';
import { searchFor } from '../../route-search-defaults';
import { KIND_LABELS } from '../billing/billing-text';
import { StatusBadge } from '../billing/status-badge';

export function InvoiceHeader({ invoice }: { invoice: Invoice }) {
  const { student } = invoice;
  return (
    <header className="flex flex-wrap items-start justify-between gap-2">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2">
          {invoice.number ?? 'Prepared charge'}
          <StatusBadge status={invoice.status} />
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="About this charge"
                className="text-muted-foreground"
              >
                <InfoIcon className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              A charge that has been sent never changes. A mistake is fixed with
              an approved fee reduction.
            </TooltipContent>
          </Tooltip>
        </h1>
        <p className="text-sm text-muted-foreground">
          {KIND_LABELS[invoice.kind]} ·{' '}
          <Link
            to="/finance/accounts/$studentId"
            params={{ studentId: student.id }}
            search={searchFor('/finance/accounts/$studentId')}
            className="hover:underline"
          >
            {student.name}
          </Link>
          {student.armName === null ? null : ` · ${student.armName}`}
        </p>
      </div>
      <Button asChild variant="outline">
        <Link
          to="/finance/accounts/$studentId"
          params={{ studentId: student.id }}
          search={searchFor('/finance/accounts/$studentId')}
        >
          <WalletIcon />
          Student statement
        </Link>
      </Button>
    </header>
  );
}
