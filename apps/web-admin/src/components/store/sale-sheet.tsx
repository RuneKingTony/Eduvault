import { useState, type SubmitEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckIcon, PackageCheckIcon } from 'lucide-react';
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_PROOF_TYPE_MESSAGE,
  type PaymentMethod,
  storeSaleReference,
  storeSaleReplayedMessage,
  storeSaleNoAccountMessage,
  type Item,
  type RecordedSale,
  type SaleOptions,
} from '@eduvault/api-contract';
import { useCan, useCanAny } from '@eduvault/auth-client';
import { FINANCE_READ_GATE } from '@eduvault/policy';
import { PAYMENT_METHODS, isProofFile, naira, oneOf } from '@eduvault/shared';
import {
  Button,
  ErrorMessage,
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  toast,
} from '@eduvault/ui';
import { useApi } from '../../api';
import {
  announceReplay,
  uploadProofOnce,
  type UploadedProof,
} from '../record-once';
import { useToday } from '../calendar/use-today';
import {
  invalidateSale,
  storeAllItemsQueryOptions,
  storeSaleOptionsQueryOptions,
} from '../../queries';
import {
  effectiveAccount,
  initialSale,
  intoFor,
  needsProof,
  owesLabel,
  saleRequest,
  saleSections,
  saleMethods,
  saleTotalMinor,
  studentLabel,
  validateSale,
  withAccount,
  withMethod,
  withQuantity,
  withStudent,
  type Into,
  type SaleRow,
  type SaleSection,
  type SaleState,
  type SaleStudent,
} from './sale-model';
import { SheetPending } from './sheet-pending';
import { itemDetail, saleRecordedMessage, stockTone } from './store-text';

interface SaleSheetProps {
  open: boolean;
  campusId?: string;
  onOpenChange: (open: boolean) => void;
  onRecorded: () => void;
  onStatement: (studentId: string) => void;
}

interface LoadedProps {
  options: SaleOptions;
  items: readonly Item[];
  today: string;
}

interface Attempt {
  state: SaleState;
  accountId: string | undefined;
  file: File | undefined;
}

const Hint = ({ children }: { children: string }) => (
  <p className="text-xs text-muted-foreground">{children}</p>
);

function useRecord(done: {
  onRecorded: () => void;
  onStatement: (studentId: string) => void;
  uploaded: UploadedProof | undefined;
  onUploaded: (stored: UploadedProof) => void;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const canSeeStatement = useCanAny(FINANCE_READ_GATE);
  const announce = (sale: RecordedSale) => {
    if (
      announceReplay(sale, (again) =>
        storeSaleReplayedMessage(again.reference, again.receiptNumber)
      )
    ) {
      return;
    }
    toast.success(saleRecordedMessage(sale), {
      ...(canSeeStatement
        ? {
            action: {
              label: 'Statement',
              onClick: () => {
                done.onStatement(sale.student.id);
              },
            },
          }
        : {}),
    });
  };
  return useMutation({
    mutationFn: async (attempt: Attempt) => {
      const proofFileId = await uploadProofOnce(api, {
        file: attempt.file,
        needed: needsProof(attempt.state.method),
        uploaded: done.uploaded,
        remember: done.onUploaded,
      });
      return api.store.recordSale({
        body: saleRequest(attempt.state, {
          accountId: attempt.accountId,
          proofFileId,
        }),
      });
    },
    onSuccess: async (sale) => {
      await invalidateSale(queryClient);
      announce(sale);
      done.onRecorded();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

function StudentFields({
  loaded,
  state,
  student,
  campusId,
  onStudent,
}: {
  loaded: LoadedProps;
  state: SaleState;
  student: SaleStudent | undefined;
  campusId: string | undefined;
  onStudent: (id: string) => void;
}) {
  const students = loaded.options.students.filter(
    (row) => campusId === undefined || row.campusId === campusId
  );
  return (
    <>
      <SelectField
        label="Student"
        name="studentId"
        hint="Only active students can receive items."
        value={state.studentId}
        onChange={(event) => {
          onStudent(event.target.value);
        }}
      >
        <NativeSelectOption value="">Choose a student</NativeSelectOption>
        {students.map((row) => (
          <NativeSelectOption key={row.id} value={row.id}>
            {studentLabel(row)}
          </NativeSelectOption>
        ))}
      </SelectField>
      {student === undefined ? (
        <p className="text-sm text-muted-foreground">
          Choose a student to see their class’s book list and the uniforms in
          stock on their campus.
        </p>
      ) : (
        <StudentFacts student={student} />
      )}
    </>
  );
}

function StudentFacts({ student }: { student: SaleStudent }) {
  return (
    <dl className="grid gap-2 rounded-lg border bg-muted/30 p-3 text-sm sm:grid-cols-3">
      <div className="flex flex-col">
        <dt className="text-muted-foreground">Class</dt>
        <dd>{student.className ?? student.levelName ?? '—'}</dd>
      </div>
      <div className="flex flex-col">
        <dt className="text-muted-foreground">Campus</dt>
        <dd>{student.campusName}</dd>
      </div>
      {student.balanceMinor !== undefined && (
        <div className="flex flex-col">
          <dt className="text-muted-foreground">Owes now</dt>
          <dd className="font-medium tabular-nums">
            {owesLabel(student.balanceMinor)}
          </dd>
        </div>
      )}
    </dl>
  );
}

function ItemRow({
  row,
  quantity,
  onQuantity,
}: {
  row: SaleRow;
  quantity: string;
  onQuantity: (text: string) => void;
}) {
  const { item, onHand } = row;
  const tone = stockTone(onHand, item.lowStockLevel);
  const stockClass = [
    tone === 'ok' ? '' : 'font-semibold',
    tone === 'out' ? 'text-destructive' : '',
  ].join(' ');
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
      <TableCell className={`tabular-nums ${stockClass}`}>
        {onHand} left
      </TableCell>
      <TableCell className="tabular-nums">
        {naira(item.sellPriceMinor)}
      </TableCell>
      <TableCell>
        <Input
          className="w-20"
          inputMode="numeric"
          placeholder="0"
          disabled={onHand <= 0}
          aria-label={`Quantity of ${item.displayName}`}
          value={quantity}
          onChange={(event) => {
            onQuantity(event.target.value);
          }}
        />
      </TableCell>
    </TableRow>
  );
}

function SectionTable({
  section,
  state,
  onQuantity,
}: {
  section: SaleSection;
  state: SaleState;
  onQuantity: (itemId: string, text: string, onHand: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{section.title}</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead>Stock</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>Qty</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {section.rows.map((row) => (
            <ItemRow
              key={row.item.id}
              row={row}
              quantity={state.quantities[row.item.id] ?? ''}
              onQuantity={(text) => {
                onQuantity(row.item.id, text, row.onHand);
              }}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function IntoField({
  into,
  state,
  campusName,
  method,
  onAccount,
}: {
  into: Into | undefined;
  state: SaleState;
  campusName: string;
  method: PaymentMethod;
  onAccount: (id: string) => void;
}) {
  if (into === undefined || into.status === 'chosen') {
    return null;
  }
  if (into.status === 'none') {
    return (
      <p role="alert" className="text-sm text-destructive">
        {storeSaleNoAccountMessage(method, campusName)}
      </p>
    );
  }
  return (
    <SelectField
      label="Into"
      name="accountId"
      value={effectiveAccount(state, into)?.id ?? ''}
      onChange={(event) => {
        onAccount(event.target.value);
      }}
    >
      {into.accounts.map((account) => (
        <NativeSelectOption key={account.id} value={account.id}>
          {account.name}
        </NativeSelectOption>
      ))}
    </SelectField>
  );
}

function MethodField({
  loaded,
  state,
  onChange,
}: {
  loaded: LoadedProps;
  state: SaleState;
  onChange: (next: SaleState) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <SelectField
        label="Payment"
        name="method"
        value={state.method}
        onChange={(event) => {
          const picked = oneOf(PAYMENT_METHODS, event.target.value);
          if (picked !== undefined) {
            onChange(withMethod(state, picked));
          }
        }}
      >
        {saleMethods(loaded.options.methods).map((one) => (
          <NativeSelectOption key={one} value={one}>
            {PAYMENT_METHOD_LABELS[one]}
          </NativeSelectOption>
        ))}
      </SelectField>
      <Hint>Store items are paid for here, not added to school fees.</Hint>
    </div>
  );
}

function ReceiptField({
  onFile,
}: {
  onFile: (file: File | undefined) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <TextField
        label="Payment receipt (required for POS and transfer)"
        name="proof"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,application/pdf,.heic"
        onChange={(event) => {
          onFile(event.target.files?.[0]);
        }}
      />
      <Hint>
        Upload the POS slip or the bank transfer receipt (photo or PDF).
      </Hint>
    </div>
  );
}

function PaymentFields({
  loaded,
  state,
  student,
  into,
  onChange,
  onFile,
}: {
  loaded: LoadedProps;
  state: SaleState;
  student: SaleStudent;
  into: Into | undefined;
  onChange: (next: SaleState) => void;
  onFile: (file: File | undefined) => void;
}) {
  const method = state.method === '' ? undefined : state.method;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <MethodField loaded={loaded} state={state} onChange={onChange} />
      <ReceiptField onFile={onFile} />
      {method === undefined ? null : (
        <IntoField
          into={into}
          state={state}
          campusName={student.campusName}
          method={method}
          onAccount={(id) => {
            onChange(withAccount(state, id));
          }}
        />
      )}
    </div>
  );
}

function useSaleForm(loaded: LoadedProps) {
  const [state, setState] = useState(() =>
    initialSale(
      storeSaleReference(loaded.today, globalThis.crypto.randomUUID()),
      loaded.options.methods
    )
  );
  const [file, setFile] = useState<File>();
  const [uploaded, setUploaded] = useState<UploadedProof>();
  const student = loaded.options.students.find(
    (row) => row.id === state.studentId
  );
  const into = intoFor(state.method, student, loaded.options.accounts);
  return {
    state,
    file,
    uploaded,
    student,
    into,
    setUploaded,
    change: setState,
    setFile,
    check: () => {
      const hasProof = file !== undefined || uploaded !== undefined;
      const found =
        file !== undefined && !isProofFile(file)
          ? PAYMENT_PROOF_TYPE_MESSAGE
          : validateSale(state, { student, into, hasProof });
      if (found !== undefined) {
        toast.error(found);
      }
      return found === undefined;
    },
  };
}

function RecordButton({
  disabled,
  chosen,
}: {
  disabled: boolean;
  chosen: boolean;
}) {
  const allowed = useCan('store', 'issue');
  const button = (
    <Button
      type="submit"
      form="record-sale"
      disabled={disabled || !allowed || !chosen}
    >
      <CheckIcon />
      Record purchase
    </Button>
  );
  if (chosen) {
    return button;
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>{button}</span>
      </TooltipTrigger>
      <TooltipContent>Choose a student first</TooltipContent>
    </Tooltip>
  );
}

type SaleFormState = ReturnType<typeof useSaleForm>;

function ChosenStudent({
  loaded,
  form,
  student,
}: {
  loaded: LoadedProps;
  form: SaleFormState;
  student: SaleStudent;
}) {
  const { state } = form;
  return (
    <>
      {saleSections(loaded.items, student).map((section) => (
        <SectionTable
          key={section.title}
          section={section}
          state={state}
          onQuantity={(itemId, text, onHand) => {
            form.change(withQuantity(state, { itemId, text, onHand }));
          }}
        />
      ))}
      <PaymentFields
        loaded={loaded}
        state={state}
        student={student}
        into={form.into}
        onChange={form.change}
        onFile={form.setFile}
      />
      <p className="text-sm text-muted-foreground">
        Total: {naira(saleTotalMinor(state, loaded.items))}
      </p>
    </>
  );
}

function useSaleSubmit(
  form: SaleFormState,
  done: { onRecorded: () => void; onStatement: (studentId: string) => void }
) {
  const record = useRecord({
    ...done,
    uploaded: form.uploaded,
    onUploaded: form.setUploaded,
  });
  return {
    pending: record.isPending,
    submit: (event: SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (form.check()) {
        record.mutate({
          state: form.state,
          accountId: effectiveAccount(form.state, form.into)?.id,
          file: form.file ?? form.uploaded?.file,
        });
      }
    },
  };
}

function SaleForm({
  loaded,
  campusId,
  onClose,
  onRecorded,
  onStatement,
}: {
  loaded: LoadedProps;
  campusId: string | undefined;
  onClose: () => void;
  onRecorded: () => void;
  onStatement: (studentId: string) => void;
}) {
  const form = useSaleForm(loaded);
  const { state, student, into } = form;
  const { pending, submit } = useSaleSubmit(form, { onRecorded, onStatement });

  return (
    <>
      <form
        id="record-sale"
        noValidate
        onSubmit={submit}
        className="flex flex-col gap-4 overflow-y-auto px-4"
      >
        <StudentFields
          loaded={loaded}
          state={state}
          student={student}
          campusId={campusId}
          onStudent={(id) => {
            form.change(withStudent(state, id));
          }}
        />
        {student === undefined ? null : (
          <ChosenStudent loaded={loaded} form={form} student={student} />
        )}
      </form>
      <SheetFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <RecordButton
          chosen={student !== undefined}
          disabled={pending || into?.status === 'none'}
        />
      </SheetFooter>
    </>
  );
}

function SheetBody({
  campusId,
  onClose,
  onRecorded,
  onStatement,
}: Pick<SaleSheetProps, 'campusId' | 'onRecorded' | 'onStatement'> & {
  onClose: () => void;
}) {
  const api = useApi();
  const today = useToday();
  const options = useQuery(storeSaleOptionsQueryOptions(api));
  const items = useQuery(storeAllItemsQueryOptions(api));
  const error = options.error ?? items.error;
  if (error !== null) {
    return (
      <div className="px-4">
        <ErrorMessage error={error} />
      </div>
    );
  }
  if (options.data === undefined || items.data === undefined) {
    return <SheetPending />;
  }
  return (
    <SaleForm
      loaded={{ options: options.data, items: items.data.items, today }}
      campusId={campusId}
      onClose={onClose}
      onRecorded={onRecorded}
      onStatement={onStatement}
    />
  );
}

export function SaleSheet({
  open,
  onOpenChange,
  campusId,
  onRecorded,
  onStatement,
}: SaleSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <PackageCheckIcon aria-hidden="true" />
            Record student purchase
          </SheetTitle>
          <SheetDescription>
            Pick the items the student is buying and how they paid. Stock goes
            down and a receipt is issued.
          </SheetDescription>
        </SheetHeader>
        <SheetBody
          campusId={campusId}
          onRecorded={onRecorded}
          onStatement={onStatement}
          onClose={() => {
            onOpenChange(false);
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
