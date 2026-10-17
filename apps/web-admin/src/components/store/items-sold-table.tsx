import { FileCheckIcon, PackageIcon } from 'lucide-react';
import type { Campus, Sale, SaleList } from '@eduvault/api-contract';
import { fmtDate, naira } from '@eduvault/shared';
import {
  Badge,
  Card,
  CardContent,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
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
import { FinancePager } from '../money/query-state';
import { PersonAvatar } from '../person-avatar';
import { RowButton } from './row-button';

type CampusRef = Pick<Campus, 'id' | 'name'>;

interface ItemsSoldTableProps {
  data: SaleList;
  campuses: readonly CampusRef[];
  showCampus: boolean;
  page: number;
  onPage: (page: number) => void;
  onOpen: (saleId: string) => void;
}

export const itemsText = (sale: Pick<Sale, 'lines'>): string =>
  sale.lines.map((line) => `${line.displayName} × ${line.quantity}`).join(', ');

function NothingSold() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <PackageIcon />
        </EmptyMedia>
        <EmptyTitle>Nothing sold yet</EmptyTitle>
        <EmptyDescription>
          Books and uniforms sold to students are recorded here.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function PaymentCell({ sale }: { sale: Sale }) {
  return (
    <span className="flex items-center gap-2">
      <Badge variant="success">Paid · {sale.receiptNumber}</Badge>
      {sale.proof === null ? null : (
        <Tooltip>
          <TooltipTrigger asChild>
            <span role="img" aria-label="Receipt uploaded">
              <FileCheckIcon className="size-4 text-muted-foreground" />
            </span>
          </TooltipTrigger>
          <TooltipContent>
            Receipt uploaded: {sale.proof.fileName}
          </TooltipContent>
        </Tooltip>
      )}
    </span>
  );
}

function SaleRow({
  sale,
  campusName,
  onOpen,
}: {
  sale: Sale;
  campusName: string | undefined;
  onOpen: (saleId: string) => void;
}) {
  const open = () => {
    onOpen(sale.id);
  };
  return (
    <TableRow>
      <TableCell className="font-mono text-xs">
        <RowButton first onOpen={open}>
          {sale.number}
        </RowButton>
      </TableCell>
      <TableCell>
        <RowButton onOpen={open}>{fmtDate(sale.soldOn)}</RowButton>
      </TableCell>
      <TableCell>
        <RowButton onOpen={open}>
          <span className="flex items-center gap-2">
            <PersonAvatar name={sale.student.name} />
            <span className="flex flex-col">
              <span className="font-medium">{sale.student.name}</span>
              {sale.student.className === null ? null : (
                <span className="text-xs text-muted-foreground">
                  {sale.student.className}
                </span>
              )}
            </span>
          </span>
        </RowButton>
      </TableCell>
      {campusName === undefined ? null : (
        <TableCell>
          <RowButton onOpen={open}>{campusName}</RowButton>
        </TableCell>
      )}
      <TableCell>
        <RowButton onOpen={open}>{itemsText(sale)}</RowButton>
      </TableCell>
      <TableCell className="font-semibold tabular-nums">
        <RowButton onOpen={open}>{naira(sale.totalMinor)}</RowButton>
      </TableCell>
      <TableCell>
        <PaymentCell sale={sale} />
      </TableCell>
    </TableRow>
  );
}

export function ItemsSoldTable({
  data,
  campuses,
  showCampus,
  page,
  onPage,
  onOpen,
}: ItemsSoldTableProps) {
  const campusName = (id: string) =>
    showCampus
      ? (campuses.find((campus) => campus.id === id)?.name ?? '')
      : undefined;
  return (
    <Card>
      <CardContent className="px-0">
        {data.items.length === 0 ? (
          <NothingSold />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ref</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Student</TableHead>
                {showCampus ? <TableHead>Campus</TableHead> : null}
                <TableHead>Items</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Payment</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((sale) => (
                <SaleRow
                  key={sale.id}
                  sale={sale}
                  campusName={campusName(sale.campusId)}
                  onOpen={onOpen}
                />
              ))}
            </TableBody>
          </Table>
        )}
        <FinancePager page={page} total={data.total} onPage={onPage} />
      </CardContent>
    </Card>
  );
}
