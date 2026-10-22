import { useState, type SubmitEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckIcon, TruckIcon } from 'lucide-react';
import {
  DELIVERY_ACCOUNT_MESSAGE,
  DELIVERY_SUPPLIER_MAX,
  OPENING_STOCK_SUPPLIER,
  type Campus,
  type Item,
  type MoneyAccount,
  type RecordedDelivery,
} from '@eduvault/api-contract';
import { useCan } from '@eduvault/auth-client';
import {
  Button,
  ErrorMessage,
  FieldError,
  Input,
  NativeSelectOption,
  SelectField,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TextField,
  toast,
} from '@eduvault/ui';
import { useApi } from '../../api';
import { announceReplay } from '../record-once';
import { useConfirmStep } from '../use-confirm-step';
import { useToday } from '../calendar/use-today';
import {
  campusesQueryOptions,
  invalidateStore,
  moneyAccountsQueryOptions,
  storeAllItemsQueryOptions,
  storeDeliveriesQueryOptions,
} from '../../queries';
import {
  deliveryRequest,
  eligibleAccounts,
  initialDelivery,
  totalMinor,
  validateDelivery,
  withCampus,
  withLine,
  withLoaded,
  withOpening,
  type DeliveryState,
  type LineState,
} from './delivery-model';
import {
  NO_ACCOUNT_ACCESS_MESSAGE,
  itemDetail,
  deliveryRecordedMessage,
  deliveryReplayedMessage,
  newDeliveryReference,
} from './store-text';
import { ConfirmDelivery } from './confirm-delivery';
import { MaskedMoney } from './masked-money';
import { SheetPending } from './sheet-pending';
import { SwitchField } from './switch-field';
import { useShowCosts } from './use-show-costs';

interface DeliverySheetProps {
  open: boolean;
  campusId?: string;
  onOpenChange: (open: boolean) => void;
  onRecorded: () => void;
}

interface LoadedProps {
  campuses: readonly Campus[];
  items: readonly Item[];
  accounts: readonly MoneyAccount[];
  canReadAccounts: boolean;
  suppliers: readonly string[];
  today: string;
}

function announce(delivery: RecordedDelivery, campusName: string) {
  if (
    announceReplay(delivery, (again) =>
      deliveryReplayedMessage(again.reference, again.number)
    )
  ) {
    return;
  }
  toast.success(deliveryRecordedMessage(delivery, campusName));
}

function useRecord(campuses: readonly Campus[], onRecorded: () => void) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (state: DeliveryState) =>
      api.store.recordDelivery({ body: deliveryRequest(state) }),
    onSuccess: async (delivery) => {
      await invalidateStore(queryClient);
      const campus = campuses.find((one) => one.id === delivery.campusId);
      announce(delivery, campus?.name ?? '');
      onRecorded();
    },
  });
}

function SupplierField({
  state,
  suppliers,
  onChange,
}: {
  state: DeliveryState;
  suppliers: readonly string[];
  onChange: (next: DeliveryState) => void;
}) {
  return (
    <>
      <TextField
        label="Supplier"
        name="supplier"
        autoComplete="off"
        list="store-suppliers"
        maxLength={DELIVERY_SUPPLIER_MAX}
        placeholder="e.g. Adebayo Uniforms Ltd"
        value={state.supplier}
        onChange={(event) => {
          onChange({ ...state, supplier: event.target.value });
        }}
      />
      <datalist id="store-suppliers">
        {suppliers
          .filter((name) => name !== OPENING_STOCK_SUPPLIER)
          .map((name) => (
            <option key={name} value={name} />
          ))}
      </datalist>
    </>
  );
}

function accountHint(count: number, canRead: boolean): string | undefined {
  if (!canRead) {
    return NO_ACCOUNT_ACCESS_MESSAGE;
  }
  return count === 0 ? DELIVERY_ACCOUNT_MESSAGE : undefined;
}

function PaidFromField({
  state,
  loaded,
  onChange,
}: {
  state: DeliveryState;
  loaded: LoadedProps;
  onChange: (next: DeliveryState) => void;
}) {
  const accounts = eligibleAccounts(loaded.accounts, state.campusId);
  return (
    <SelectField
      label="Paid from"
      name="accountId"
      hint={accountHint(accounts.length, loaded.canReadAccounts)}
      value={state.accountId}
      onChange={(event) => {
        onChange({ ...state, accountId: event.target.value });
      }}
    >
      {accounts.map((account) => (
        <NativeSelectOption key={account.id} value={account.id}>
          {account.name}
        </NativeSelectOption>
      ))}
    </SelectField>
  );
}

function HeaderFields({
  state,
  loaded,
  onChange,
}: {
  state: DeliveryState;
  loaded: LoadedProps;
  onChange: (next: DeliveryState) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <SupplierField
        state={state}
        suppliers={loaded.suppliers}
        onChange={onChange}
      />
      <SelectField
        label="Campus"
        name="campusId"
        value={state.campusId}
        onChange={(event) => {
          onChange(withCampus(state, event.target.value, loaded.accounts));
        }}
      >
        {loaded.campuses.map((campus) => (
          <NativeSelectOption key={campus.id} value={campus.id}>
            {campus.name}
          </NativeSelectOption>
        ))}
      </SelectField>
      {state.opening ? null : (
        <PaidFromField state={state} loaded={loaded} onChange={onChange} />
      )}
      <TextField
        label="Received on"
        name="receivedOn"
        type="date"
        max={loaded.today}
        value={state.receivedOn}
        onChange={(event) => {
          onChange({ ...state, receivedOn: event.target.value });
        }}
      />
      <div className="self-end pb-2">
        <SwitchField
          label="Opening stock"
          checked={state.opening}
          onCheckedChange={(on) => {
            onChange(withOpening(state, on));
          }}
        />
      </div>
    </div>
  );
}

function LineRow({
  item,
  line,
  onChange,
}: {
  item: Item;
  line: LineState | undefined;
  onChange: (change: Partial<LineState>) => void;
}) {
  return (
    <TableRow>
      <TableCell>
        <div className="flex flex-col">
          <span className="font-medium">{item.name}</span>
          <span className="text-xs text-muted-foreground">
            {itemDetail(item)}
          </span>
        </div>
      </TableCell>
      <TableCell>
        <Input
          className="w-28"
          inputMode="decimal"
          aria-label={`Unit cost for ${item.displayName}`}
          value={line?.unitCost ?? ''}
          onChange={(event) => {
            onChange({ unitCost: event.target.value });
          }}
        />
      </TableCell>
      <TableCell>
        <Input
          className="w-20"
          inputMode="numeric"
          placeholder="0"
          aria-label={`Quantity for ${item.displayName}`}
          value={line?.quantity ?? ''}
          onChange={(event) => {
            onChange({ quantity: event.target.value });
          }}
        />
      </TableCell>
    </TableRow>
  );
}

function LinesTable({
  state,
  items,
  onChange,
}: {
  state: DeliveryState;
  items: readonly Item[];
  onChange: (next: DeliveryState) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Item</TableHead>
          <TableHead>Unit cost (₦)</TableHead>
          <TableHead>Qty</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <LineRow
            key={item.id}
            item={item}
            line={state.lines[item.id]}
            onChange={(change) => {
              onChange(withLine(state, item.id, change));
            }}
          />
        ))}
      </TableBody>
    </Table>
  );
}

function useDeliveryForm(loaded: LoadedProps, campusId: string | undefined) {
  const [state, setState] = useState(() =>
    withLoaded(
      initialDelivery(
        newDeliveryReference(loaded.today),
        campusId ?? loaded.campuses[0]?.id ?? '',
        loaded.today
      ),
      loaded.items,
      loaded.accounts
    )
  );
  const [error, setError] = useState<string>();
  return {
    state,
    error,
    change: (next: DeliveryState) => {
      setState(next);
      setError(undefined);
    },
    check: () => {
      const found = validateDelivery(state, loaded.today);
      setError(found);
      return found === undefined;
    },
  };
}

function TotalAtCost({ minor }: { minor: number }) {
  const [showCosts] = useShowCosts();
  return (
    <p className="text-sm text-muted-foreground">
      Total at cost: <MaskedMoney minor={minor} show={showCosts} />
    </p>
  );
}

function DeliveryFooter({
  onClose,
  pending,
}: {
  onClose: () => void;
  pending: boolean;
}) {
  return (
    <SheetFooter>
      <Button type="button" variant="ghost" onClick={onClose}>
        Cancel
      </Button>
      <Button type="submit" form="record-delivery" disabled={pending}>
        <CheckIcon />
        Record delivery
      </Button>
    </SheetFooter>
  );
}

function useDeliveryStep(record: ReturnType<typeof useRecord>) {
  return useConfirmStep<DeliveryState>((state, settled) => {
    record.mutate(state, { onSettled: settled });
  });
}

function DeliveryForm({
  loaded,
  campusId,
  onClose,
  onRecorded,
}: {
  loaded: LoadedProps;
  campusId: string | undefined;
  onClose: () => void;
  onRecorded: () => void;
}) {
  const form = useDeliveryForm(loaded, campusId);
  const record = useRecord(loaded.campuses, onRecorded);
  const step = useDeliveryStep(record);

  return (
    <>
      <form
        id="record-delivery"
        noValidate
        onSubmit={(event: SubmitEvent<HTMLFormElement>) => {
          event.preventDefault();
          if (form.check()) {
            step.ask(form.state);
          }
        }}
        className="flex flex-col gap-4 overflow-y-auto px-4"
      >
        <HeaderFields
          state={form.state}
          loaded={loaded}
          onChange={form.change}
        />
        <LinesTable
          state={form.state}
          items={loaded.items}
          onChange={form.change}
        />
        <TotalAtCost minor={totalMinor(form.state)} />
        <FieldError message={form.error} />
        <ErrorMessage error={record.error} />
      </form>
      <DeliveryFooter onClose={onClose} pending={record.isPending} />
      <ConfirmDelivery
        step={step}
        campuses={loaded.campuses}
        pending={record.isPending}
      />
    </>
  );
}

type Loading =
  | { status: 'ready'; loaded: LoadedProps }
  | { status: 'waiting' }
  | { status: 'failed'; error: unknown };

interface QueryPart<T> {
  data: T | undefined;
  error: Error | null;
}

interface SheetQueries {
  campuses: QueryPart<readonly Campus[]>;
  items: QueryPart<{ items: readonly Item[] }>;
  deliveries: Pick<QueryPart<{ suppliers: readonly string[] }>, 'data'>;
  accounts: QueryPart<{ items: readonly MoneyAccount[] }>;
}

const firstError = (...parts: { error: Error | null }[]) =>
  parts.find((part) => part.error !== null)?.error ?? null;

function loadingOf(
  { campuses, items, deliveries, accounts }: SheetQueries,
  canReadAccounts: boolean,
  today: string
): Loading {
  const error = firstError(campuses, items, accounts);
  if (error !== null) {
    return { status: 'failed', error };
  }
  const accountRows = canReadAccounts ? accounts.data?.items : [];
  if (
    campuses.data === undefined ||
    items.data === undefined ||
    accountRows === undefined
  ) {
    return { status: 'waiting' };
  }
  return {
    status: 'ready',
    loaded: {
      campuses: campuses.data,
      items: items.data.items,
      accounts: accountRows,
      canReadAccounts,
      suppliers: deliveries.data?.suppliers ?? [],
      today,
    },
  };
}

function useLoaded(): Loading {
  const api = useApi();
  const canReadAccounts = useCan('moneyAccount', 'read');
  const today = useToday();
  const campuses = useQuery(campusesQueryOptions(api));
  const items = useQuery(storeAllItemsQueryOptions(api));
  const deliveries = useQuery(storeDeliveriesQueryOptions(api));
  const accounts = useQuery({
    ...moneyAccountsQueryOptions(api),
    enabled: canReadAccounts,
  });
  return loadingOf(
    { campuses, items, deliveries, accounts },
    canReadAccounts,
    today
  );
}

function SheetBody({
  campusId,
  onClose,
  onRecorded,
}: Pick<DeliverySheetProps, 'campusId' | 'onRecorded'> & {
  onClose: () => void;
}) {
  const loading = useLoaded();
  if (loading.status === 'failed') {
    return (
      <div className="px-4">
        <ErrorMessage error={loading.error} />
      </div>
    );
  }
  if (loading.status === 'waiting') {
    return <SheetPending />;
  }
  return (
    <DeliveryForm
      loaded={loading.loaded}
      campusId={campusId}
      onClose={onClose}
      onRecorded={onRecorded}
    />
  );
}

export function DeliverySheet({
  open,
  onOpenChange,
  campusId,
  onRecorded,
}: DeliverySheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <TruckIcon aria-hidden="true" />
            Record a delivery
          </SheetTitle>
          <SheetDescription>
            Stock goes up and the cost is paid from a money account.
          </SheetDescription>
        </SheetHeader>
        <SheetBody
          campusId={campusId}
          onRecorded={onRecorded}
          onClose={() => {
            onOpenChange(false);
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
