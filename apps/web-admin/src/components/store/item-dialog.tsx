import { useState, type SubmitEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckIcon } from 'lucide-react';
import {
  ITEM_KINDS,
  ITEM_LOW_STOCK_DEFAULT,
  ITEM_NAME_MAX,
  ITEM_VARIANT_MAX,
  type Item,
  type ItemKind,
} from '@eduvault/api-contract';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ErrorMessage,
  FieldError,
  NativeSelectOption,
  SelectField,
  TextField,
  toast,
} from '@eduvault/ui';
import { useApi, type Api } from '../../api';
import { classLevelsQueryOptions, invalidateStore } from '../../queries';
import {
  emptyItemForm,
  itemChanges,
  itemFormOf,
  newItemRequest,
  withKind,
  type ItemFormState,
} from './item-model';
import { KIND_LABELS, itemAddedMessage, itemSavedMessage } from './store-text';

interface ItemDialogProps {
  item?: Item;
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
  onRecordDelivery: () => void;
}

const NAME_PLACEHOLDERS: Record<ItemKind, string> = {
  uniform: 'e.g. School cardigan',
  book: 'e.g. Civic Education textbook',
};

function useSaveItem(
  item: Item | undefined,
  done: Pick<ItemDialogProps, 'onClose' | 'onAdded' | 'onRecordDelivery'>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (send: () => Promise<Item>) => send(),
    onSuccess: async (saved) => {
      await invalidateStore(queryClient);
      if (item === undefined) {
        toast.success(itemAddedMessage(saved.displayName), {
          action: { label: 'Record delivery', onClick: done.onRecordDelivery },
        });
        done.onAdded();
      } else {
        toast.success(itemSavedMessage(saved.displayName));
        done.onClose();
      }
    },
  });
}

interface FieldsProps {
  form: ItemFormState;
  adding: boolean;
  firstLevelId: string;
  levels: readonly { id: string; name: string }[];
  onChange: (next: ItemFormState) => void;
}

function TypeField({
  form,
  firstLevelId,
  onChange,
}: Pick<FieldsProps, 'form' | 'firstLevelId' | 'onChange'>) {
  return (
    <SelectField
      label="Type"
      name="kind"
      value={form.kind}
      onChange={(event) => {
        const kind = ITEM_KINDS.find((one) => one === event.target.value);
        if (kind !== undefined) {
          onChange(withKind(form, kind, firstLevelId));
        }
      }}
    >
      {ITEM_KINDS.map((kind) => (
        <NativeSelectOption key={kind} value={kind}>
          {KIND_LABELS[kind]}
        </NativeSelectOption>
      ))}
    </SelectField>
  );
}

function LevelField({
  form,
  levels,
  onChange,
}: Pick<FieldsProps, 'form' | 'levels' | 'onChange'>) {
  return (
    <SelectField
      label="Class level"
      name="classLevelId"
      hint="Offered first when a student of this level is served."
      value={form.classLevelId}
      onChange={(event) => {
        onChange({ ...form, classLevelId: event.target.value });
      }}
    >
      {levels.map((level) => (
        <NativeSelectOption key={level.id} value={level.id}>
          {level.name}
        </NativeSelectOption>
      ))}
    </SelectField>
  );
}

function KindFields(props: FieldsProps) {
  const { form, adding, onChange } = props;
  return (
    <>
      {adding ? <TypeField {...props} /> : null}
      <TextField
        label="Name"
        name="name"
        autoComplete="off"
        maxLength={ITEM_NAME_MAX}
        placeholder={NAME_PLACEHOLDERS[form.kind]}
        value={form.name}
        onChange={(event) => {
          onChange({ ...form, name: event.target.value });
        }}
      />
      {form.kind === 'book' && adding ? <LevelField {...props} /> : null}
      {form.kind === 'uniform' ? (
        <TextField
          label="Size"
          name="size"
          autoComplete="off"
          maxLength={ITEM_VARIANT_MAX}
          placeholder="e.g. Size 10, or leave blank for one size"
          value={form.size}
          onChange={(event) => {
            onChange({ ...form, size: event.target.value });
          }}
        />
      ) : null}
    </>
  );
}

function PriceFields({
  form,
  onChange,
}: Pick<FieldsProps, 'form' | 'onChange'>) {
  const patch = (change: Partial<ItemFormState>) => {
    onChange({ ...form, ...change });
  };
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="Cost price (₦)"
          name="cost"
          inputMode="decimal"
          placeholder="3,500"
          value={form.cost}
          onChange={(event) => {
            patch({ cost: event.target.value });
          }}
        />
        <TextField
          label="Selling price (₦)"
          name="price"
          inputMode="decimal"
          placeholder="5,500"
          value={form.price}
          onChange={(event) => {
            patch({ price: event.target.value });
          }}
        />
      </div>
      <TextField
        label="Low at"
        name="lowAt"
        inputMode="numeric"
        placeholder={String(ITEM_LOW_STOCK_DEFAULT)}
        value={form.lowAt}
        onChange={(event) => {
          patch({ lowAt: event.target.value });
        }}
      />
    </>
  );
}

type Prepared =
  | { error: string; request?: undefined }
  | { error?: undefined; request: (() => Promise<Item>) | undefined };

function prepare(
  api: Api,
  item: Item | undefined,
  form: ItemFormState
): Prepared {
  if (item === undefined) {
    const checked = newItemRequest(form);
    return checked.error === undefined
      ? { request: () => api.store.createItem({ body: checked.body }) }
      : { error: checked.error };
  }
  const checked = itemChanges(item, form);
  if (checked.error !== undefined) {
    return { error: checked.error };
  }
  return Object.keys(checked.body).length === 0
    ? { request: undefined }
    : {
        request: () =>
          api.store.updateItem({ params: { id: item.id }, body: checked.body }),
      };
}

function ItemForm(props: Omit<ItemDialogProps, 'open'>) {
  const { item, onClose } = props;
  const api = useApi();
  const levels = useQuery(classLevelsQueryOptions(api)).data ?? [];
  const [form, setForm] = useState(() =>
    item === undefined ? emptyItemForm('') : itemFormOf(item)
  );
  const [error, setError] = useState<string>();
  const save = useSaveItem(item, props);

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const send = prepare(api, item, form);
    setError(send.error);
    if (send.error !== undefined) {
      return;
    }
    if (send.request === undefined) {
      onClose();
      return;
    }
    save.mutate(send.request);
  }

  return (
    <form
      id="item-form"
      noValidate
      onSubmit={submit}
      className="flex flex-col gap-4"
    >
      <KindFields
        form={form}
        adding={item === undefined}
        firstLevelId={levels[0]?.id ?? ''}
        levels={levels}
        onChange={(next) => {
          setForm(next);
          setError(undefined);
        }}
      />
      <PriceFields
        form={form}
        onChange={(next) => {
          setForm(next);
          setError(undefined);
        }}
      />
      <FieldError message={error} />
      <ErrorMessage error={save.error} />
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending}>
          <CheckIcon />
          {item === undefined ? 'Add item' : 'Save item'}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function ItemDialog({ open, ...props }: ItemDialogProps) {
  const { item, onClose } = props;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {item === undefined ? 'Add an item' : `Edit ${item.displayName}`}
          </DialogTitle>
          <DialogDescription>
            {item === undefined
              ? 'Each size of a uniform is its own item, so each size has its own stock.'
              : 'A new cost price only changes the default for later deliveries. Stock on hand keeps its value.'}
          </DialogDescription>
        </DialogHeader>
        <ItemForm {...props} />
      </DialogContent>
    </Dialog>
  );
}
