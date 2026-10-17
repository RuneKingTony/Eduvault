import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeftIcon, PrinterIcon, UsersIcon } from 'lucide-react';
import { Button } from '@eduvault/ui';
import { searchFor } from '../../route-search-defaults';

export function PaymentsLink({ children }: { children: ReactNode }) {
  return (
    <Link to="/finance/payments" search={searchFor('/finance/payments')}>
      {children}
    </Link>
  );
}

export function AccountsLink({ children }: { children: ReactNode }) {
  return (
    <Link to="/finance/accounts" search={searchFor('/finance/accounts')}>
      {children}
    </Link>
  );
}

export function PrintReceiptButton({ paymentId }: { paymentId: string }) {
  return (
    <Button asChild variant="outline">
      <Link to="/finance/payments/$paymentId/print" params={{ paymentId }}>
        <PrinterIcon />
        Print receipt
      </Link>
    </Button>
  );
}

export function BackToReceiptButton({ paymentId }: { paymentId: string }) {
  return (
    <Button asChild variant="outline">
      <Link
        to="/finance/payments/$paymentId"
        params={{ paymentId }}
        search={{ recorded: undefined }}
      >
        <ArrowLeftIcon />
        Back to receipt
      </Link>
    </Button>
  );
}

export function FamilyViewButton({
  studentId,
  familyView,
  childCount,
}: {
  studentId: string;
  familyView: boolean;
  childCount: number;
}) {
  return (
    <Button asChild variant="secondary">
      <Link
        to="/finance/accounts/$studentId"
        params={{ studentId }}
        search={{ view: familyView ? undefined : 'family', page: undefined }}
      >
        <UsersIcon />
        {familyView ? 'One child' : `Family view (${childCount})`}
      </Link>
    </Button>
  );
}
