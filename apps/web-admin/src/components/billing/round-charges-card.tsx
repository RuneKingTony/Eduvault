import { Link } from '@tanstack/react-router';
import {
  FINANCE_PAGE_SIZE,
  type BillingRun,
  type InvoiceSummary,
} from '@eduvault/api-contract';
import { countOf, money } from '@eduvault/shared';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  NumberedPager,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@eduvault/ui';
import { PersonAvatar } from '../person-avatar';
import { NOT_NUMBERED } from './billing-text';
import { StatusBadge } from './status-badge';

function ChargeRow({
  charge,
  currency,
}: {
  charge: InvoiceSummary;
  currency: string;
}) {
  return (
    <TableRow>
      <TableCell>
        <Link
          to="/finance/invoices/$invoiceId"
          params={{ invoiceId: charge.id }}
          className="flex items-center gap-2"
        >
          <PersonAvatar name={charge.studentName} />
          <span className="flex flex-col">
            <span className="font-medium">{charge.studentName}</span>
            <span className="text-xs text-muted-foreground">
              {[charge.admissionNumber, charge.armName]
                .filter((part): part is string => part !== null)
                .join(' · ')}
            </span>
          </span>
        </Link>
      </TableCell>
      <TableCell>
        {charge.number === null ? (
          <span className="text-muted-foreground">{NOT_NUMBERED}</span>
        ) : (
          <span className="font-mono text-sm">{charge.number}</span>
        )}
      </TableCell>
      <TableCell>{countOf(charge.feeCount, 'fee', 'fees')}</TableCell>
      <TableCell className="tabular-nums">
        {money(charge.totalMinor, currency)}
      </TableCell>
      <TableCell>
        <StatusBadge status={charge.status} />
      </TableCell>
    </TableRow>
  );
}

export function RoundChargesCard({
  run,
  page,
  onPage,
}: {
  run: BillingRun;
  page: number;
  onPage: (page: number) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {run.status === 'draft' ? 'Check these charges' : 'Charges'}
          <Badge variant="secondary">{run.chargeCount}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Fees</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {run.charges.map((charge) => (
              <ChargeRow
                key={charge.id}
                charge={charge}
                currency={run.currency}
              />
            ))}
          </TableBody>
        </Table>
        {run.chargeCount > FINANCE_PAGE_SIZE ? (
          <NumberedPager
            page={page}
            total={run.chargeCount}
            pageSize={FINANCE_PAGE_SIZE}
            onPage={onPage}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
