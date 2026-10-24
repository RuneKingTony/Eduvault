import { walletMoney } from '@eduvault/shared';
import {
  FieldError,
  Input,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@eduvault/ui';
import type { PayModel, PayRow } from './pay-model';

function PayRowView({
  row,
  currency,
  onText,
}: {
  row: PayRow;
  currency: string;
  onText: (studentId: string, text: string) => void;
}) {
  return (
    <TableRow>
      <TableCell className="font-medium">{row.name}</TableCell>
      <TableCell className="text-right tabular-nums">
        {walletMoney(row.owedMinor, currency)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {walletMoney(row.capMinor, currency)}
      </TableCell>
      <TableCell className="w-40">
        <Input
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          aria-label={`Amount for ${row.name}`}
          aria-invalid={row.issue !== null}
          disabled={row.capMinor === 0 && row.text === ''}
          className="text-right tabular-nums"
          value={row.text}
          onChange={(event) => {
            onText(row.studentId, event.target.value);
          }}
        />
      </TableCell>
    </TableRow>
  );
}

export function PayTable({
  model,
  currency,
  onText,
}: {
  model: PayModel;
  currency: string;
  onText: (studentId: string, text: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Child</TableHead>
            <TableHead className="text-right">Owes</TableHead>
            <TableHead className="text-right">Can use</TableHead>
            <TableHead className="text-right">Pay now (₦)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {model.rows.map((row) => (
            <PayRowView
              key={row.studentId}
              row={row}
              currency={currency}
              onText={onText}
            />
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={3}>Total from the wallet</TableCell>
            <TableCell className="text-right font-semibold tabular-nums">
              {walletMoney(model.totalMinor, currency)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
      <FieldError message={model.issue} />
    </div>
  );
}
