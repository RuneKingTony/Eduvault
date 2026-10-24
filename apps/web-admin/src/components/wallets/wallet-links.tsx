import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { searchFor } from '../../route-search-defaults';

export function WalletsLink({ children }: { children: ReactNode }) {
  return (
    <Link to="/finance/wallets" search={searchFor('/finance/wallets')}>
      {children}
    </Link>
  );
}
