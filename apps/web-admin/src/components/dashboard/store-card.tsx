import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { StoreIcon } from 'lucide-react';
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ErrorMessage,
} from '@eduvault/ui';
import { useApi } from '../../api';
import { dashboardStoreQueryOptions } from '../../queries';
import { MaskedMoney } from '../store/masked-money';
import { useShowCosts } from '../store/use-show-costs';
import { CardSkeleton } from './card-states';

export function StoreCard() {
  const store = useQuery(dashboardStoreQueryOptions(useApi()));
  const [showCosts] = useShowCosts();
  if (store.isPending) {
    return <CardSkeleton rows={1} />;
  }
  if (store.data === undefined) {
    return <ErrorMessage error={store.error} />;
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <StoreIcon aria-hidden="true" />
          Store
        </CardTitle>
        <CardDescription>Books and uniforms in stock</CardDescription>
        <CardAction>
          <Button asChild variant="ghost" size="sm">
            <Link to="/finance/store">Store</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">Stock value</span>
        <span className="text-2xl font-semibold tabular-nums">
          <MaskedMoney minor={store.data.stockValueMinor} show={showCosts} />
        </span>
        <span className="text-sm text-muted-foreground">At cost</span>
      </CardContent>
    </Card>
  );
}
