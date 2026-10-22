import { useState, type SubmitEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckIcon, ClipboardCheckIcon } from 'lucide-react';
import {
  STOCK_COUNT_NOTE_MAX,
  type Campus,
  type Item,
  type StockCount,
} from '@eduvault/api-contract';
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
import { useConfirmStep } from '../use-confirm-step';
import { ConfirmCount } from './confirm-count';
import {
  campusesQueryOptions,
  invalidateApprovals,
  invalidateStore,
  storeAllItemsQueryOptions,
} from '../../queries';
import {
  countRequest,
  expectedAt,
  initialCount,
  validateCount,
  withCampus,
  withCounted,
  type CountState,
} from './stock-count-model';
import { SheetPending } from './sheet-pending';
import { countSubmittedMessage, itemDetail } from './store-text';

interface StockCountSheetProps {
  open: boolean;
  campusId?: string;
  onOpenChange: (open: boolean) => void;
  onSubmitted: () => void;
  onApprovals: () => void;
}

type SubmitDone = Pick<StockCountSheetProps, 'onSubmitted' | 'onApprovals'>;

interface Loaded {
  campuses: readonly Campus[];
  items: readonly Item[];
}

function announce(count: StockCount, onApprovals: () => void) {
  const message = countSubmittedMessage(count);
  if (count.status === 'submitted') {
    toast.success(message, {
      action: { label: 'Approvals', onClick: onApprovals },
    });
    return;
  }
  toast.success(message);
}

function useSubmit(done: SubmitDone) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: ReturnType<typeof countRequest>) =>
      api.stockCounts.submit({ body: request }),
    onSuccess: async (count) => {
      await Promise.all([
        invalidateStore(queryClient),
        invalidateApprovals(queryClient),
      ]);
      announce(count, done.onApprovals);
      done.onSubmitted();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

function useCountForm(loaded: Loaded, campusId: string | undefined) {
  const [state, setState] = useState(() =>
    initialCount(campusId ?? loaded.campuses[0]?.id ?? '', loaded.items)
  );
  const [error, setError] = useState<string>();
  return {
    state,
    error,
    change: (next: CountState) => {
      setState(next);
      setError(undefined);
    },
    check: () => {
      const found = validateCount(state, loaded.items);
      setError(found);
      return found === undefined;
    },
  };
}

function ItemRow({
  item,
  campusId,
  counted,
  onChange,
}: {
  item: Item;
  campusId: string;
  counted: string;
  onChange: (text: string) => void;
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
      <TableCell className="tabular-nums">
        {expectedAt(item, campusId)}
      </TableCell>
      <TableCell>
        <Input
          className="w-20"
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          aria-label={`Counted ${item.displayName}`}
          value={counted}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      </TableCell>
    </TableRow>
  );
}

interface FormProps {
  loaded: Loaded;
  state: CountState;
  onChange: (next: CountState) => void;
}

function HeaderFields({ loaded, state, onChange }: FormProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <SelectField
        label="Campus"
        name="campusId"
        value={state.campusId}
        onChange={(event) => {
          onChange(withCampus(state, event.target.value, loaded.items));
        }}
      >
        {loaded.campuses.map((campus) => (
          <NativeSelectOption key={campus.id} value={campus.id}>
            {campus.name}
          </NativeSelectOption>
        ))}
      </SelectField>
      <TextField
        label="Note"
        name="note"
        autoComplete="off"
        maxLength={STOCK_COUNT_NOTE_MAX}
        placeholder="Optional"
        value={state.note}
        onChange={(event) => {
          onChange({ ...state, note: event.target.value });
        }}
      />
    </div>
  );
}

function ItemsTable({ loaded, state, onChange }: FormProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Item</TableHead>
          <TableHead>Expected</TableHead>
          <TableHead>Counted</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {loaded.items.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            campusId={state.campusId}
            counted={state.counted[item.id] ?? ''}
            onChange={(text) => {
              onChange(withCounted(state, item.id, text));
            }}
          />
        ))}
      </TableBody>
    </Table>
  );
}

function CountForm({
  loaded,
  campusId,
  onClose,
  done,
}: {
  loaded: Loaded;
  campusId: string | undefined;
  onClose: () => void;
  done: SubmitDone;
}) {
  const form = useCountForm(loaded, campusId);
  const submit = useSubmit(done);
  const step = useConfirmStep<CountState>((state, settled) => {
    submit.mutate(countRequest(state, loaded.items), { onSettled: settled });
  });
  const fields = { loaded, state: form.state, onChange: form.change };

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (form.check()) {
      step.ask(form.state);
    }
  }

  return (
    <>
      <form
        id="submit-count"
        noValidate
        onSubmit={onSubmit}
        className="flex flex-col gap-4 overflow-y-auto px-4"
      >
        <HeaderFields {...fields} />
        <ItemsTable {...fields} />
        <FieldError message={form.error} />
        <ErrorMessage error={submit.error} />
      </form>
      <SheetFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" form="submit-count" disabled={submit.isPending}>
          <CheckIcon />
          Submit count
        </Button>
      </SheetFooter>
      <ConfirmCount
        step={step}
        campuses={loaded.campuses}
        items={loaded.items}
        pending={submit.isPending}
      />
    </>
  );
}

function SheetBody({
  campusId,
  onClose,
  done,
}: Pick<StockCountSheetProps, 'campusId'> & {
  onClose: () => void;
  done: SubmitDone;
}) {
  const api = useApi();
  const campuses = useQuery(campusesQueryOptions(api));
  const items = useQuery(storeAllItemsQueryOptions(api));
  const error = campuses.error ?? items.error;
  if (error !== null) {
    return (
      <div className="px-4">
        <ErrorMessage error={error} />
      </div>
    );
  }
  if (campuses.data === undefined || items.data === undefined) {
    return <SheetPending />;
  }
  return (
    <CountForm
      loaded={{ campuses: campuses.data, items: items.data.items }}
      campusId={campusId}
      onClose={onClose}
      done={done}
    />
  );
}

export function StockCountSheet({
  open,
  onOpenChange,
  campusId,
  onSubmitted,
  onApprovals,
}: StockCountSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ClipboardCheckIcon aria-hidden="true" />
            Stock count
          </SheetTitle>
          <SheetDescription>
            Enter what is on the shelf. Differences wait for a second person to
            approve.
          </SheetDescription>
        </SheetHeader>
        <SheetBody
          campusId={campusId}
          onClose={() => {
            onOpenChange(false);
          }}
          done={{ onSubmitted, onApprovals }}
        />
      </SheetContent>
    </Sheet>
  );
}
