import {
  ArchiveIcon,
  BookIcon,
  PencilIcon,
  SearchIcon,
  TagIcon,
} from 'lucide-react';
import {
  ITEM_KINDS,
  type Campus,
  type Item,
  type ItemList,
} from '@eduvault/api-contract';
import { naira } from '@eduvault/shared';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Input,
  NativeSelect,
  NativeSelectOption,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from '@eduvault/ui';
import { FinancePager } from '../money/query-state';
import type { StoreSearch } from '../../store-search';
import { MaskedMoney } from './masked-money';
import { SwitchField } from './switch-field';
import {
  COST_PRICE_TIP,
  KIND_LABELS,
  KIND_PLURALS,
  STOCK_STATE_LABELS,
  itemDetail,
  lowTip,
  stockTone,
} from './store-text';

type CampusRef = Pick<Campus, 'id' | 'name'>;

const TONE_CLASS = {
  out: 'font-semibold text-destructive',
  low: 'font-semibold',
  ok: '',
} as const;

interface ItemsTableProps {
  data: ItemList;
  search: StoreSearch;
  campuses: readonly CampusRef[];
  showCosts: boolean;
  lowCount: number;
  canReceive: boolean;
  onSearchChange: (next: StoreSearch) => void;
  onEdit: (item: Item) => void;
  onRetire: (item: Item) => void;
}

const stockOf = (item: Item, campusId: string) =>
  item.stock.find((row) => row.campusId === campusId);

function ItemCell({ item }: { item: Item }) {
  const Icon = item.kind === 'book' ? BookIcon : TagIcon;
  return (
    <div className="flex items-center gap-3">
      <Icon
        aria-hidden="true"
        className="size-4 shrink-0 text-muted-foreground"
      />
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{item.name}</span>
        <span className="text-xs text-muted-foreground">
          {itemDetail(item)}
        </span>
      </div>
    </div>
  );
}

function StatusBadge({ item }: { item: Item }) {
  if (item.retiredAt !== null) {
    return <Badge variant="outline">Retired</Badge>;
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant={item.state === 'in' ? 'secondary' : 'outline'}>
          <span className={item.state === 'out' ? 'text-destructive' : ''}>
            {STOCK_STATE_LABELS[item.state]}
          </span>
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{lowTip(item.lowStockLevel)}</TooltipContent>
    </Tooltip>
  );
}

function StockCell({ item, campusId }: { item: Item; campusId: string }) {
  const onHand = stockOf(item, campusId)?.onHand ?? 0;
  return (
    <TableCell
      className={cn(
        'tabular-nums',
        TONE_CLASS[stockTone(onHand, item.lowStockLevel)]
      )}
    >
      {onHand}
    </TableCell>
  );
}

function CostCell({
  item,
  campusId,
  showCosts,
}: {
  item: Item;
  campusId: string | undefined;
  showCosts: boolean;
}) {
  if (campusId === undefined) {
    return (
      <TableCell className="tabular-nums">
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <MaskedMoney minor={item.costPriceMinor} show={showCosts} />
            </span>
          </TooltipTrigger>
          <TooltipContent>{COST_PRICE_TIP}</TooltipContent>
        </Tooltip>
      </TableCell>
    );
  }
  return (
    <TableCell className="tabular-nums">
      <MaskedMoney
        minor={stockOf(item, campusId)?.averageCostMinor ?? 0}
        show={showCosts}
      />
    </TableCell>
  );
}

function RowActions({
  item,
  onEdit,
  onRetire,
}: Pick<ItemsTableProps, 'onEdit' | 'onRetire'> & { item: Item }) {
  if (item.retiredAt !== null) {
    return <TableCell />;
  }
  return (
    <TableCell className="text-right whitespace-nowrap">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Edit ${item.displayName}`}
        onClick={() => {
          onEdit(item);
        }}
      >
        <PencilIcon />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Retire ${item.displayName}`}
        onClick={() => {
          onRetire(item);
        }}
      >
        <ArchiveIcon />
      </Button>
    </TableCell>
  );
}

function ItemRow({
  item,
  stockCampuses,
  costCampusId,
  showCosts,
  canReceive,
  onEdit,
  onRetire,
}: {
  item: Item;
  stockCampuses: readonly CampusRef[];
  costCampusId: string | undefined;
  showCosts: boolean;
  canReceive: boolean;
  onEdit: (item: Item) => void;
  onRetire: (item: Item) => void;
}) {
  return (
    <TableRow
      className={item.retiredAt === null ? '' : 'text-muted-foreground'}
    >
      <TableCell>
        <ItemCell item={item} />
      </TableCell>
      <TableCell>
        <Badge variant={item.kind === 'book' ? 'secondary' : 'outline'}>
          {KIND_LABELS[item.kind]}
        </Badge>
      </TableCell>
      {stockCampuses.map((campus) => (
        <StockCell key={campus.id} item={item} campusId={campus.id} />
      ))}
      <CostCell item={item} campusId={costCampusId} showCosts={showCosts} />
      <TableCell className="tabular-nums">
        {naira(item.sellPriceMinor)}
      </TableCell>
      <TableCell>
        <StatusBadge item={item} />
      </TableCell>
      {canReceive ? (
        <RowActions item={item} onEdit={onEdit} onRetire={onRetire} />
      ) : null}
    </TableRow>
  );
}

function SearchBox({
  search,
  onChange,
}: {
  search: StoreSearch;
  onChange: (patch: Partial<StoreSearch>) => void;
}) {
  return (
    <div className="relative min-w-48 flex-1">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        className="pl-8"
        aria-label="Search items"
        placeholder="Search items"
        value={search.q ?? ''}
        onChange={(event) => {
          onChange({
            q: event.target.value === '' ? undefined : event.target.value,
          });
        }}
      />
    </div>
  );
}

function KindSelect({
  search,
  onChange,
}: {
  search: StoreSearch;
  onChange: (patch: Partial<StoreSearch>) => void;
}) {
  return (
    <NativeSelect
      aria-label="Type"
      value={search.kind ?? ''}
      onChange={(event) => {
        onChange({
          kind: ITEM_KINDS.find((kind) => kind === event.target.value),
        });
      }}
    >
      <NativeSelectOption value="">Books and uniforms</NativeSelectOption>
      {ITEM_KINDS.map((kind) => (
        <NativeSelectOption key={kind} value={kind}>
          {KIND_PLURALS[kind]}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

function Toolbar({
  search,
  lowCount,
  onSearchChange,
}: Pick<ItemsTableProps, 'search' | 'lowCount' | 'onSearchChange'>) {
  const change = (patch: Partial<StoreSearch>) => {
    onSearchChange({ ...search, ...patch, page: undefined });
  };
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 pb-3">
      <SearchBox search={search} onChange={change} />
      <KindSelect search={search} onChange={change} />
      <SwitchField
        label={`Low or out of stock (${lowCount})`}
        checked={search.low === 1}
        onCheckedChange={(on) => {
          change({ low: on ? 1 : undefined });
        }}
      />
      <SwitchField
        label="Show retired"
        checked={search.retired === 1}
        onCheckedChange={(on) => {
          change({ retired: on ? 1 : undefined });
        }}
      />
    </div>
  );
}

function NoItems({ searching }: { searching: boolean }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchIcon />
        </EmptyMedia>
        <EmptyTitle>{searching ? 'No items match' : 'No items yet'}</EmptyTitle>
        <EmptyDescription>
          {searching
            ? 'Try another search or filter.'
            : 'Add an item to start the store.'}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

interface Layout {
  perCampus: boolean;
  stockCampuses: readonly CampusRef[];
  costCampusId: string | undefined;
}

function layoutOf(search: StoreSearch, campuses: readonly CampusRef[]): Layout {
  const perCampus = search.campus === undefined && campuses.length > 1;
  const stockCampuses = campuses.filter(
    (campus) =>
      perCampus || search.campus === undefined || campus.id === search.campus
  );
  return {
    perCampus,
    stockCampuses,
    costCampusId: perCampus ? undefined : stockCampuses[0]?.id,
  };
}

const isSearching = (search: StoreSearch): boolean =>
  search.q !== undefined ||
  search.kind !== undefined ||
  search.low === 1 ||
  search.retired === 1;

function ItemsHead({
  layout,
  canReceive,
}: {
  layout: Layout;
  canReceive: boolean;
}) {
  return (
    <TableHeader>
      <TableRow>
        <TableHead>Item</TableHead>
        <TableHead>Type</TableHead>
        {layout.perCampus ? (
          layout.stockCampuses.map((campus) => (
            <TableHead key={campus.id}>{campus.name}</TableHead>
          ))
        ) : (
          <TableHead>In stock</TableHead>
        )}
        <TableHead>Cost</TableHead>
        <TableHead>Price</TableHead>
        <TableHead>Status</TableHead>
        {canReceive ? (
          <TableHead>
            <span className="sr-only">Actions</span>
          </TableHead>
        ) : null}
      </TableRow>
    </TableHeader>
  );
}

export function ItemsTable(props: ItemsTableProps) {
  const { data, search, showCosts, canReceive } = props;
  const layout = layoutOf(search, props.campuses);
  return (
    <Card>
      <CardContent className="px-0">
        <Toolbar
          search={search}
          lowCount={props.lowCount}
          onSearchChange={props.onSearchChange}
        />
        {data.items.length === 0 ? (
          <NoItems searching={isSearching(search)} />
        ) : (
          <Table>
            <ItemsHead layout={layout} canReceive={canReceive} />
            <TableBody>
              {data.items.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  stockCampuses={layout.stockCampuses}
                  costCampusId={layout.costCampusId}
                  showCosts={showCosts}
                  canReceive={canReceive}
                  onEdit={props.onEdit}
                  onRetire={props.onRetire}
                />
              ))}
            </TableBody>
          </Table>
        )}
        <FinancePager
          page={search.page ?? 1}
          total={data.total}
          onPage={(next) => {
            props.onSearchChange({
              ...search,
              page: next > 1 ? next : undefined,
            });
          }}
        />
      </CardContent>
    </Card>
  );
}
