import { CheckIcon, XIcon } from 'lucide-react';
import {
  SELF_APPROVAL_MESSAGE,
  type ApprovalItem,
} from '@eduvault/api-contract';
import {
  Badge,
  Button,
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
import { PersonAvatar } from '../person-avatar';
import { APPROVAL_KIND_UI, amountOf, otherTip, ownTip } from './approval-copy';

interface ActionsProps {
  item: ApprovalItem;
  canAct: boolean;
  onApprove: (item: ApprovalItem) => void;
  onDecline: (item: ApprovalItem) => void;
}

function Cell({
  label,
  variant,
  tip,
}: {
  label: string;
  variant: 'warning' | 'outline';
  tip: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant={variant}>{label}</Badge>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  );
}

function Actions({ item, canAct, onApprove, onDecline }: ActionsProps) {
  if (item.decide === 'own') {
    return (
      <Cell
        label="Your own"
        variant="warning"
        tip={ownTip(item.kind, SELF_APPROVAL_MESSAGE)}
      />
    );
  }
  if (item.decide === 'other') {
    return (
      <Cell label="Someone else" variant="outline" tip={otherTip(item.kind)} />
    );
  }
  if (!canAct) {
    return null;
  }
  return (
    <span className="flex justify-end gap-1">
      <Button
        type="button"
        size="sm"
        aria-label={`Approve: ${item.label}, ${item.details}`}
        onClick={() => {
          onApprove(item);
        }}
      >
        <CheckIcon />
        Approve
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        aria-label={`Decline: ${item.label}, ${item.details}`}
        onClick={() => {
          onDecline(item);
        }}
      >
        <XIcon />
        Decline
      </Button>
    </span>
  );
}

function QueueRow({
  item,
  currency,
  ...actions
}: ActionsProps & { currency: string }) {
  const Icon = APPROVAL_KIND_UI[item.kind].icon;
  return (
    <TableRow>
      <TableCell>
        <span className="flex items-center gap-2 font-semibold">
          <Icon className="size-4 text-muted-foreground" />
          {item.label}
        </span>
      </TableCell>
      <TableCell className="max-w-72 whitespace-normal">
        {item.details}
      </TableCell>
      <TableCell className="font-medium tabular-nums">
        {amountOf(item, currency)}
      </TableCell>
      <TableCell>
        <span className="flex items-center gap-2">
          <PersonAvatar name={item.createdBy.name} />
          {item.createdBy.name}
        </span>
      </TableCell>
      <TableCell className="text-right">
        <Actions item={item} {...actions} />
      </TableCell>
    </TableRow>
  );
}

export function ApprovalsTable({
  items,
  currency,
  ...actions
}: Omit<ActionsProps, 'item'> & {
  items: readonly ApprovalItem[];
  currency: string;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Request</TableHead>
          <TableHead>Details</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Asked by</TableHead>
          <TableHead className="text-right">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <QueueRow
            key={`${item.kind}-${item.id}`}
            item={item}
            currency={currency}
            {...actions}
          />
        ))}
      </TableBody>
    </Table>
  );
}
