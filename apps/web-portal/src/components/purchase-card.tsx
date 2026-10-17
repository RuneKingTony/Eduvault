import { CheckIcon, ShoppingCartIcon } from 'lucide-react';
import type { PortalPurchase } from '@eduvault/api-contract';
import { fmtDate, naira } from '@eduvault/shared';
import {
  Badge,
  Card,
  CardAction,
  CardContent,
  CardDescription,
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
import { paidByLabel } from './purchase-text';

export function PurchaseCard({ sale }: { sale: PortalPurchase }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShoppingCartIcon aria-hidden="true" className="size-4" />
          {fmtDate(sale.date)}
        </CardTitle>
        <CardDescription>
          {sale.campusName} campus store · receipt {sale.receiptNumber}
        </CardDescription>
        <CardAction>
          <Badge variant="success">
            <CheckIcon aria-hidden="true" />
            {paidByLabel(sale.method)}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead>Price</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sale.lines.map((line) => (
              <TableRow key={line.itemName}>
                <TableCell>{line.itemName}</TableCell>
                <TableCell className="tabular-nums">{line.quantity}</TableCell>
                <TableCell className="tabular-nums">
                  {naira(line.unitPriceMinor)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {naira(line.amountMinor)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={3}>Total</TableCell>
              <TableCell className="text-right font-semibold tabular-nums">
                {naira(sale.totalMinor)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </CardContent>
    </Card>
  );
}
