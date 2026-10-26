import {
  CREDIT_MIGRATION_REASON_LABELS,
  type CreditMigrationNotMoved,
} from '@eduvault/api-contract';
import { walletMoney } from '@eduvault/shared';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@eduvault/ui';

export function NotMovedCard({
  students,
  currency,
}: {
  students: readonly CreditMigrationNotMoved[];
  currency: string;
}) {
  return (
    <Card role="group" aria-label="Can’t be moved">
      <CardHeader>
        <CardTitle>Can’t be moved</CardTitle>
        <CardDescription>
          This credit stays on the child’s fee account.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Child</TableHead>
              <TableHead>Why</TableHead>
              <TableHead className="text-right">Credit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {students.map((student) => (
              <TableRow key={student.studentId}>
                <TableCell>
                  <span className="flex flex-col">
                    <span className="font-medium">{student.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {student.admissionNumber}
                    </span>
                  </span>
                </TableCell>
                <TableCell>
                  {CREDIT_MIGRATION_REASON_LABELS[student.reason]}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {walletMoney(student.amountMinor, currency)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
