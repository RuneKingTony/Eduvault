import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { oneOf } from '@eduvault/shared';
import {
  EllipsisIcon,
  InfoIcon,
  PackageCheckIcon,
  PlusIcon,
  TruckIcon,
} from 'lucide-react';
import type { Item } from '@eduvault/api-contract';
import { useCan, usePermissions } from '@eduvault/auth-client';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  NativeSelect,
  NativeSelectOption,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@eduvault/ui';
import { useApi } from '../api';
import { QueryState } from '../components/money/query-state';
import { DeliveriesTable } from '../components/store/deliveries-table';
import { DeliverySheet } from '../components/store/delivery-sheet';
import { ItemDialog } from '../components/store/item-dialog';
import { ItemsSoldTable } from '../components/store/items-sold-table';
import { ItemsTable } from '../components/store/items-table';
import { RetireItemDialog } from '../components/store/retire-item-dialog';
import { SaleDetailSheet } from '../components/store/sale-detail-sheet';
import { SaleSheet } from '../components/store/sale-sheet';
import { StoreTiles } from '../components/store/store-tiles';
import { SwitchField } from '../components/store/switch-field';
import { storeDescription } from '../components/store/store-text';
import { useShowCosts } from '../components/store/use-show-costs';
import {
  campusesQueryOptions,
  storeDeliveriesQueryOptions,
  storeItemsQueryOptions,
  storeSalesQueryOptions,
  storeSummaryQueryOptions,
} from '../queries';
import type { StoreSearch } from '../store-search';

interface PageProps {
  search: StoreSearch;
  onSearchChange: (next: StoreSearch) => void;
}

interface StorePageProps extends PageProps {
  onStatement: (studentId: string) => void;
}

function InfoPopover() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="About the store"
          className="text-muted-foreground"
        >
          <InfoIcon className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="text-sm">
        Everything handed out is sold and paid for at the store (cash, POS or
        transfer). It is never added to school fees. Stock is kept per campus.
      </PopoverContent>
    </Popover>
  );
}

function CampusSelect({
  search,
  campuses,
  onSearchChange,
}: PageProps & { campuses: readonly { id: string; name: string }[] }) {
  if (campuses.length <= 1) {
    return null;
  }
  return (
    <NativeSelect
      aria-label="Campus"
      value={search.campus ?? ''}
      onChange={(event) => {
        onSearchChange({
          ...search,
          campus: event.target.value === '' ? undefined : event.target.value,
          page: undefined,
        });
      }}
    >
      <NativeSelectOption value="">All campuses</NativeSelectOption>
      {campuses.map((campus) => (
        <NativeSelectOption key={campus.id} value={campus.id}>
          {campus.name}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

function Actions({
  canIssue,
  canReceive,
  onSell,
  onDeliver,
  onAdd,
}: {
  canIssue: boolean;
  canReceive: boolean;
  onSell: () => void;
  onDeliver: () => void;
  onAdd: () => void;
}) {
  return (
    <>
      {canIssue ? (
        <Button type="button" onClick={onSell}>
          <PackageCheckIcon />
          Record student purchase
        </Button>
      ) : null}
      {canReceive ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="More actions"
            >
              <EllipsisIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onDeliver}>
              <TruckIcon />
              Record a delivery
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onAdd}>
              <PlusIcon />
              Add an item
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </>
  );
}

function Header({
  search,
  onSearchChange,
  showCosts,
  onShowCosts,
}: PageProps & { showCosts: boolean; onShowCosts: (on: boolean) => void }) {
  const api = useApi();
  const canReceive = useCan('store', 'receive');
  const canIssue = useCan('store', 'issue');
  const { campusScope } = usePermissions();
  const campuses = useQuery(campusesQueryOptions(api)).data ?? [];
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2">
          Store
          <InfoPopover />
        </h1>
        <p className="text-sm text-muted-foreground">
          {storeDescription({
            campuses,
            allCampuses: campusScope === 'all',
            selectedId: search.campus,
          })}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SwitchField
          label="Show costs"
          checked={showCosts}
          onCheckedChange={onShowCosts}
        />
        <CampusSelect
          search={search}
          campuses={campuses}
          onSearchChange={onSearchChange}
        />
        <Actions
          canIssue={canIssue}
          canReceive={canReceive}
          onSell={() => {
            onSearchChange({ ...search, sell: 1 });
          }}
          onDeliver={() => {
            onSearchChange({ ...search, deliver: 1 });
          }}
          onAdd={() => {
            onSearchChange({ ...search, add: 1 });
          }}
        />
      </div>
    </header>
  );
}

function ItemsPanel({
  search,
  onSearchChange,
  showCosts,
  onEdit,
  onRetire,
}: PageProps & {
  showCosts: boolean;
  onEdit: (item: Item) => void;
  onRetire: (item: Item) => void;
}) {
  const api = useApi();
  const canReceive = useCan('store', 'receive');
  const campuses = useQuery(campusesQueryOptions(api)).data ?? [];
  const summary = useQuery(storeSummaryQueryOptions(api, search.campus));
  const items = useQuery(
    storeItemsQueryOptions(api, {
      campusId: search.campus,
      kind: search.kind,
      q: search.q,
      lowOnly: search.low === 1,
      includeRetired: search.retired === 1,
      page: search.page,
    })
  );
  return (
    <QueryState query={items} skeletonClassName="h-48">
      {(data) => (
        <ItemsTable
          data={data}
          search={search}
          campuses={campuses}
          showCosts={showCosts}
          lowCount={summary.data?.lowCount ?? 0}
          canReceive={canReceive}
          onSearchChange={onSearchChange}
          onEdit={onEdit}
          onRetire={onRetire}
        />
      )}
    </QueryState>
  );
}

function DeliveriesPanel({
  search,
  onSearchChange,
  showCosts,
}: PageProps & { showCosts: boolean }) {
  const api = useApi();
  const campuses = useQuery(campusesQueryOptions(api)).data ?? [];
  const deliveries = useQuery(
    storeDeliveriesQueryOptions(api, {
      campusId: search.campus,
      page: search.page,
    })
  );
  return (
    <QueryState query={deliveries} skeletonClassName="h-48">
      {(data) => (
        <DeliveriesTable
          data={data}
          campuses={campuses}
          showCampus={search.campus === undefined && campuses.length > 1}
          showCosts={showCosts}
          page={search.page ?? 1}
          onPage={(next) => {
            onSearchChange({ ...search, page: next > 1 ? next : undefined });
          }}
        />
      )}
    </QueryState>
  );
}

function SoldPanel({
  search,
  onSearchChange,
  onOpen,
}: PageProps & { onOpen: (saleId: string) => void }) {
  const api = useApi();
  const campuses = useQuery(campusesQueryOptions(api)).data ?? [];
  const sales = useQuery(
    storeSalesQueryOptions(api, { campusId: search.campus, page: search.page })
  );
  return (
    <QueryState query={sales} skeletonClassName="h-48">
      {(data) => (
        <ItemsSoldTable
          data={data}
          campuses={campuses}
          showCampus={search.campus === undefined && campuses.length > 1}
          page={search.page ?? 1}
          onPage={(next) => {
            onSearchChange({ ...search, page: next > 1 ? next : undefined });
          }}
          onOpen={onOpen}
        />
      )}
    </QueryState>
  );
}

const tabCount = (total: number | undefined) =>
  total === undefined ? '' : ` ${total}`;

function StoreTabs({ search, onSearchChange }: PageProps) {
  const api = useApi();
  const items = useQuery(
    storeItemsQueryOptions(api, { campusId: search.campus })
  );
  const sales = useQuery(
    storeSalesQueryOptions(api, { campusId: search.campus })
  );
  const deliveries = useQuery(
    storeDeliveriesQueryOptions(api, { campusId: search.campus })
  );
  return (
    <Tabs
      value={search.tab ?? 'items'}
      onValueChange={(value) => {
        onSearchChange({
          campus: search.campus,
          tab: oneOf(['deliveries', 'sold'] as const, value),
        });
      }}
    >
      <TabsList>
        <TabsTrigger value="items">
          Items{tabCount(items.data?.total)}
        </TabsTrigger>
        <TabsTrigger value="sold">
          Items sold{tabCount(sales.data?.total)}
        </TabsTrigger>
        <TabsTrigger value="deliveries">
          Deliveries{tabCount(deliveries.data?.total)}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

function WriteDialogs({
  search,
  onSearchChange,
  editing,
  retiring,
  onEditClose,
  onRetireClose,
}: PageProps & {
  editing: Item | null;
  retiring: Item | null;
  onEditClose: () => void;
  onRetireClose: () => void;
}) {
  return (
    <>
      <ItemDialog
        open={search.add === 1}
        onClose={() => {
          onSearchChange({ ...search, add: undefined });
        }}
        onAdded={() => {
          onSearchChange({ campus: search.campus });
        }}
        onRecordDelivery={() => {
          onSearchChange({ campus: search.campus, deliver: 1 });
        }}
      />
      {editing === null ? null : (
        <ItemDialog
          open
          item={editing}
          onClose={onEditClose}
          onAdded={onEditClose}
          onRecordDelivery={onEditClose}
        />
      )}
      <RetireItemDialog item={retiring} onClose={onRetireClose} />
      <DeliverySheet
        open={search.deliver === 1}
        campusId={search.campus}
        onOpenChange={(open) => {
          onSearchChange({ ...search, deliver: open ? 1 : undefined });
        }}
        onRecorded={() => {
          onSearchChange({ campus: search.campus, tab: 'deliveries' });
        }}
      />
    </>
  );
}

function SaleSheets({ search, onSearchChange, onStatement }: StorePageProps) {
  const canIssue = useCan('store', 'issue');
  return (
    <>
      <SaleDetailSheet
        saleId={search.sale}
        onClose={() => {
          onSearchChange({ ...search, sale: undefined });
        }}
        onStatement={onStatement}
      />
      {canIssue ? (
        <SaleSheet
          open={search.sell === 1}
          campusId={search.campus}
          onStatement={onStatement}
          onOpenChange={(open) => {
            onSearchChange({ ...search, sell: open ? 1 : undefined });
          }}
          onRecorded={() => {
            onSearchChange({ campus: search.campus, tab: 'sold' });
          }}
        />
      ) : null}
    </>
  );
}

export function StorePage(props: StorePageProps) {
  const { search, onSearchChange } = props;
  const canReceive = useCan('store', 'receive');
  const [showCosts, setShowCosts] = useShowCosts();
  const [editing, setEditing] = useState<Item | null>(null);
  const [retiring, setRetiring] = useState<Item | null>(null);
  const panel = { search, onSearchChange, showCosts };
  return (
    <section className="flex flex-col gap-4">
      <Header {...panel} onShowCosts={setShowCosts} />
      <StoreTiles {...panel} />
      <StoreTabs search={search} onSearchChange={onSearchChange} />
      <TabPanel
        {...panel}
        onEdit={setEditing}
        onRetire={setRetiring}
        onOpenSale={(saleId) => {
          onSearchChange({ ...search, sale: saleId });
        }}
      />
      <SaleSheets {...props} />
      {canReceive ? (
        <WriteDialogs
          search={search}
          onSearchChange={onSearchChange}
          editing={editing}
          retiring={retiring}
          onEditClose={() => {
            setEditing(null);
          }}
          onRetireClose={() => {
            setRetiring(null);
          }}
        />
      ) : null}
    </section>
  );
}

function TabPanel({
  search,
  onSearchChange,
  showCosts,
  onEdit,
  onRetire,
  onOpenSale,
}: PageProps & {
  showCosts: boolean;
  onEdit: (item: Item) => void;
  onRetire: (item: Item) => void;
  onOpenSale: (saleId: string) => void;
}) {
  if (search.tab === 'deliveries') {
    return (
      <DeliveriesPanel
        search={search}
        onSearchChange={onSearchChange}
        showCosts={showCosts}
      />
    );
  }
  if (search.tab === 'sold') {
    return (
      <SoldPanel
        search={search}
        onSearchChange={onSearchChange}
        onOpen={onOpenSale}
      />
    );
  }
  return (
    <ItemsPanel
      search={search}
      onSearchChange={onSearchChange}
      showCosts={showCosts}
      onEdit={onEdit}
      onRetire={onRetire}
    />
  );
}
