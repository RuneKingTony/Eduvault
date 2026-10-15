import { useState } from 'react';
import { LockIcon } from 'lucide-react';
import { FINANCE_PAGE_SIZE, type LedgerAccount } from '@eduvault/api-contract';
import { money } from '@eduvault/shared';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@eduvault/ui';
import { BUILT_IN_TIP, TYPE_WORDS } from './money-text';
import { FinancePager } from './query-state';

function NameCell({ account }: { account: LedgerAccount }) {
  return (
    <TableCell>
      <span
        className={`flex items-center gap-2 ${account.parentId === null ? 'font-medium' : 'pl-6'}`}
      >
        {account.parentId === null ? null : (
          <span aria-hidden="true" className="text-muted-foreground">
            └
          </span>
        )}
        {account.name}
        {account.systemKey === null ? null : (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Built in"
                className="text-muted-foreground"
              >
                <LockIcon aria-hidden="true" className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{BUILT_IN_TIP}</TooltipContent>
          </Tooltip>
        )}
      </span>
    </TableCell>
  );
}

export function ChartTable({
  accounts,
  currency,
  scoped,
}: {
  accounts: readonly LedgerAccount[];
  currency: string;
  scoped: boolean;
}) {
  const [page, setPage] = useState(1);
  const start = (page - 1) * FINANCE_PAGE_SIZE;
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">Code</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="text-right">
              {scoped ? 'Balance (your campuses)' : 'Balance'}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.slice(start, start + FINANCE_PAGE_SIZE).map((account) => (
            <TableRow key={account.id}>
              <TableCell className="text-muted-foreground tabular-nums">
                {account.code}
              </TableCell>
              <NameCell account={account} />
              <TableCell>{TYPE_WORDS[account.type]}</TableCell>
              <TableCell className="text-right tabular-nums">
                {money(account.balanceMinor, currency)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <FinancePager page={page} total={accounts.length} onPage={setPage} />
    </>
  );
}
