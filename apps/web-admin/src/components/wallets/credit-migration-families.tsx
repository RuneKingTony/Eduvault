import { ChevronRightIcon } from 'lucide-react';
import type {
  CreditMigrationChild,
  CreditMigrationFamily,
} from '@eduvault/api-contract';
import { countOf, walletMoney } from '@eduvault/shared';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@eduvault/ui';
import { PersonAvatar } from '../person-avatar';

const LEAVER_LABELS: Partial<Record<CreditMigrationChild['status'], string>> = {
  left: 'Left',
  graduated: 'Graduated',
};

function ChildRow({
  child,
  currency,
}: {
  child: CreditMigrationChild;
  currency: string;
}) {
  const tag = LEAVER_LABELS[child.status];
  return (
    <TableRow>
      <TableCell>
        <span className="flex items-center gap-2">
          <span className="font-medium">{child.name}</span>
          {tag === undefined ? null : <Badge variant="secondary">{tag}</Badge>}
        </span>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {child.admissionNumber}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {child.campusName}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {walletMoney(child.amountMinor, currency)}
      </TableCell>
    </TableRow>
  );
}

function ChildrenTable({
  family,
  currency,
}: {
  family: CreditMigrationFamily;
  currency: string;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Child</TableHead>
          <TableHead>Admission number</TableHead>
          <TableHead>Campus</TableHead>
          <TableHead className="text-right">Credit</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {family.children.map((child) => (
          <ChildRow key={child.studentId} child={child} currency={currency} />
        ))}
      </TableBody>
    </Table>
  );
}

function FamilyItem({
  family,
  currency,
}: {
  family: CreditMigrationFamily;
  currency: string;
}) {
  return (
    <Collapsible className="group border-b last:border-b-0">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50"
        >
          <ChevronRightIcon className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
          <PersonAvatar name={family.guardianName} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-medium">{family.guardianName}</span>
            <span className="text-xs text-muted-foreground">
              {family.phone}
            </span>
          </span>
          <span className="text-sm text-muted-foreground">
            {countOf(family.children.length, 'child', 'children')}
          </span>
          <span className="w-32 text-right font-semibold tabular-nums">
            {walletMoney(family.totalMinor, currency)}
          </span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pb-2">
        <ChildrenTable family={family} currency={currency} />
      </CollapsibleContent>
    </Collapsible>
  );
}

export function FamiliesCard({
  families,
  currency,
}: {
  families: readonly CreditMigrationFamily[];
  currency: string;
}) {
  return (
    <Card role="group" aria-label="Families to move">
      <CardHeader>
        <CardTitle>Families to move</CardTitle>
        <CardDescription>
          Each family’s credit becomes one wallet balance. Open a family to see
          the children it comes from.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        {families.map((family) => (
          <FamilyItem
            key={family.walletId}
            family={family}
            currency={currency}
          />
        ))}
      </CardContent>
    </Card>
  );
}
