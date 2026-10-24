import { useState } from 'react';
import { MapPinIcon, PinIcon, UsersIcon } from 'lucide-react';
import type { Announcement } from '@eduvault/api-contract';
import { useCan } from '@eduvault/auth-client';
import {
  ConfirmDialog,
  AnnouncementTagBadge,
  Badge,
  Button,
} from '@eduvault/ui';
import { audienceLabel, footerLine } from './announcement-text';
import type { RowAction } from './use-announcement-actions';

interface RowProps {
  row: Announcement;
  busy: boolean;
  onEdit: (row: Announcement) => void;
  onAct: (row: Announcement, action: RowAction) => void;
}

function ActionButton({
  label,
  busy,
  variant = 'ghost',
  onClick,
}: {
  label: string;
  busy: boolean;
  variant?: 'ghost' | 'default' | 'outline';
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={variant}
      disabled={busy}
      onClick={onClick}
    >
      {label}
    </Button>
  );
}

function StatusActions({ row, busy, onAct }: Omit<RowProps, 'onEdit'>) {
  const act = (action: RowAction) => () => {
    onAct(row, action);
  };
  if (row.status === 'published') {
    return (
      <>
        <ActionButton
          label={row.pinned ? 'Unpin' : 'Pin to top'}
          busy={busy}
          onClick={act(row.pinned ? 'unpin' : 'pin')}
        />
        <ActionButton label="Withdraw" busy={busy} onClick={act('withdraw')} />
      </>
    );
  }
  return (
    <ActionButton
      label={row.status === 'draft' ? 'Publish' : 'Publish again'}
      busy={busy}
      variant={row.status === 'draft' ? 'default' : 'outline'}
      onClick={act('publish')}
    />
  );
}

function RowActions({ row, busy, onEdit, onAct }: RowProps) {
  const canUpdate = useCan('announcement', 'update');
  const canReachAll = useCan('campus', 'readAll');
  if (!canUpdate || (row.campusId === null && !canReachAll)) {
    return null;
  }
  return (
    <div className="flex shrink-0 items-start gap-1">
      <ActionButton
        label="Edit"
        busy={busy}
        onClick={() => {
          onEdit(row);
        }}
      />
      <StatusActions row={row} busy={busy} onAct={onAct} />
    </div>
  );
}

export function AnnouncementRow(props: RowProps) {
  const { row } = props;
  const [withdrawing, setWithdrawing] = useState(false);
  const AudienceIcon = row.campusId === null ? UsersIcon : MapPinIcon;
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 p-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <AnnouncementTagBadge tag={row.tag} />
          {row.pinned ? (
            <Badge variant="outline">
              <PinIcon aria-hidden="true" />
              Pinned
            </Badge>
          ) : null}
          <Badge variant="outline">
            <AudienceIcon aria-hidden="true" />
            {audienceLabel(row)}
          </Badge>
        </div>
        <h3 className="font-medium">{row.title}</h3>
        <p className="max-w-prose text-sm whitespace-pre-line text-muted-foreground">
          {row.body}
        </p>
        <p className="text-xs text-muted-foreground">{footerLine(row)}</p>
      </div>
      <RowActions
        {...props}
        onAct={(target, action) => {
          if (action === 'withdraw') {
            setWithdrawing(true);
          } else {
            props.onAct(target, action);
          }
        }}
      />
      <ConfirmDialog
        open={withdrawing}
        title={`Withdraw “${row.title}”?`}
        description="It stops showing on the portal. You can publish it again later."
        tone="destructive"
        confirmLabel="Withdraw"
        pending={props.busy}
        onConfirm={() => {
          props.onAct(row, 'withdraw');
          setWithdrawing(false);
        }}
        onCancel={() => {
          setWithdrawing(false);
        }}
      />
    </li>
  );
}
