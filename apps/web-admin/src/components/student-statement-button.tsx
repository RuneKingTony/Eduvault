import { Link } from '@tanstack/react-router';
import { ReceiptTextIcon } from 'lucide-react';
import { useCanAny } from '@eduvault/auth-client';
import { FINANCE_READ_GATE } from '@eduvault/policy';
import { Button } from '@eduvault/ui';
import { searchFor } from '../route-search-defaults';

export function StatementButton({ studentId }: { studentId: string }) {
  const financeRead = useCanAny(FINANCE_READ_GATE);
  if (!financeRead) {
    return null;
  }
  return (
    <Button asChild variant="outline">
      <Link
        to="/finance/accounts/$studentId"
        params={{ studentId }}
        search={searchFor('/finance/accounts/$studentId')}
      >
        <ReceiptTextIcon />
        Statement
      </Link>
    </Button>
  );
}
