import { ReceiptTextIcon } from 'lucide-react';
import type { Invoice } from '@eduvault/api-contract';
import { money } from '@eduvault/shared';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@eduvault/ui';

export function InvoiceLinesCard({ invoice }: { invoice: Invoice }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ReceiptTextIcon className="size-4 text-muted-foreground" />
          Lines
        </CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoice.lines.map((line) => (
              <TableRow
                key={line.id}
                className={line.amountMinor < 0 ? 'bg-muted/40' : undefined}
              >
                <TableCell
                  className={
                    line.amountMinor < 0 ? 'text-muted-foreground' : undefined
                  }
                >
                  {line.description}
                </TableCell>
                <TableCell
                  className={`text-right tabular-nums ${line.amountMinor < 0 ? 'text-muted-foreground' : ''}`}
                >
                  {money(line.amountMinor, invoice.currency)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className="font-medium">Total</TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {money(invoice.totalMinor, invoice.currency)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </CardContent>
    </Card>
  );
}
