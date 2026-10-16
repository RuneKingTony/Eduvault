import { BookOpenIcon, CheckIcon, ChevronRightIcon, XIcon } from 'lucide-react';
import type { InvoiceJournal } from '@eduvault/api-contract';
import { money } from '@eduvault/shared';
import {
  Badge,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@eduvault/ui';

const SCHOOL_WIDE = 'School-wide';

function BalancedBadge({ balanced }: { balanced: boolean }) {
  return balanced ? (
    <Badge variant="success">
      <CheckIcon />
      Balanced
    </Badge>
  ) : (
    <Badge variant="destructive">
      <XIcon />
      Out of balance
    </Badge>
  );
}

function JournalTable({
  journal,
  currency,
}: {
  journal: InvoiceJournal;
  currency: string;
}) {
  const debits = journal.lines.reduce((sum, line) => sum + line.debitMinor, 0);
  const credits = journal.lines.reduce(
    (sum, line) => sum + line.creditMinor,
    0
  );
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Account</TableHead>
          <TableHead>Student</TableHead>
          <TableHead>Campus</TableHead>
          <TableHead className="text-right">Debit</TableHead>
          <TableHead className="text-right">Credit</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {journal.lines.map((line) => (
          <TableRow
            key={`${line.accountCode}-${line.debitMinor}-${line.creditMinor}-${line.studentName}`}
          >
            <TableCell>{`${line.accountCode} ${line.accountName}`}</TableCell>
            <TableCell>{line.studentName ?? '—'}</TableCell>
            <TableCell>{line.campusName ?? SCHOOL_WIDE}</TableCell>
            <TableCell className="text-right tabular-nums">
              {line.debitMinor === 0 ? '—' : money(line.debitMinor, currency)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {line.creditMinor === 0 ? '—' : money(line.creditMinor, currency)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={3}>
            <BalancedBadge balanced={journal.balanced} />
          </TableCell>
          <TableCell className="text-right font-medium tabular-nums">
            {money(debits, currency)}
          </TableCell>
          <TableCell className="text-right font-medium tabular-nums">
            {money(credits, currency)}
          </TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}

export function InvoiceJournalCard({
  journal,
  currency,
}: {
  journal: InvoiceJournal;
  currency: string;
}) {
  return (
    <Card>
      <Collapsible>
        <CardHeader>
          <CollapsibleTrigger className="group flex w-full items-start gap-2 text-left">
            <ChevronRightIcon
              aria-hidden="true"
              className="mt-1 size-4 shrink-0 transition-transform group-data-[state=open]:rotate-90"
            />
            <span className="flex flex-col gap-1">
              <CardTitle className="flex items-center gap-2">
                <BookOpenIcon className="size-4 text-muted-foreground" />
                For your accountant: {journal.reference}
              </CardTitle>
              <CardDescription>
                Each money movement and the category it belongs to.
              </CardDescription>
            </span>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <JournalTable journal={journal} currency={currency} />
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
