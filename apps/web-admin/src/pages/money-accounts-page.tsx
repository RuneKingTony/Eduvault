import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  InfoIcon,
  LandmarkIcon,
  PlusIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import type { MoneyAccount } from '@eduvault/api-contract';
import { Can } from '@eduvault/auth-client';
import {
  Alert,
  AlertDescription,
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  ErrorMessage,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@eduvault/ui';
import { useApi } from '../api';
import { MoneyAccountSheet } from '../components/money-account-sheet';
import { AccountTiles } from '../components/money/account-tiles';
import { CashBookCard } from '../components/money/cash-book-card';
import {
  ACCOUNTS_TIP,
  hiddenAccountsText,
} from '../components/money/money-text';
import { RetireMoneyAccountDialog } from '../components/retire-money-account-dialog';
import { moneyAccountsQueryOptions } from '../queries';

type Editor =
  | { kind: 'closed' }
  | { kind: 'add' }
  | { kind: 'edit'; account: MoneyAccount }
  | { kind: 'retire'; account: MoneyAccount };

function Header({ onAdd }: { onAdd: () => void }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2">
          Money accounts
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="About money accounts"
                className="text-muted-foreground"
              >
                <InfoIcon className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{ACCOUNTS_TIP}</TooltipContent>
          </Tooltip>
        </h1>
        <p className="text-sm text-muted-foreground">
          Bank, POS and cash accounts the school keeps money in.
        </p>
      </div>
      <Can permission="moneyAccount:create">
        <Button type="button" onClick={onAdd}>
          <PlusIcon />
          Add account
        </Button>
      </Can>
    </header>
  );
}

function NoAccounts({ onAdd }: { onAdd: () => void }) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <LandmarkIcon />
        </EmptyMedia>
        <EmptyTitle>No money accounts in your scope</EmptyTitle>
        <EmptyDescription>
          Accounts you can see show up here with their balances.
        </EmptyDescription>
      </EmptyHeader>
      <Can permission="moneyAccount:create">
        <EmptyContent>
          <Button type="button" onClick={onAdd}>
            <PlusIcon />
            Add account
          </Button>
        </EmptyContent>
      </Can>
    </Empty>
  );
}

function useSelection(items: readonly MoneyAccount[] | undefined) {
  const [chosen, setChosen] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const selected = items?.find((item) => item.id === chosen) ?? items?.[0];
  return {
    selected,
    page,
    choose: (id: string) => {
      setChosen(id);
      setPage(1);
    },
    setPage,
  };
}

function HiddenCallout({ count }: { count: number }) {
  return count > 0 ? (
    <Alert>
      <TriangleAlertIcon />
      <AlertDescription>{hiddenAccountsText(count)}</AlertDescription>
    </Alert>
  ) : null;
}

function Editors({
  editor,
  setEditor,
  onSaved,
}: {
  editor: Editor;
  setEditor: (editor: Editor) => void;
  onSaved: (id: string) => void;
}) {
  return (
    <>
      <MoneyAccountSheet
        open={editor.kind === 'add' || editor.kind === 'edit'}
        editing={editor.kind === 'edit' ? editor.account : null}
        onOpenChange={(open) => {
          if (!open) {
            setEditor({ kind: 'closed' });
          }
        }}
        onSaved={onSaved}
      />
      <RetireMoneyAccountDialog
        account={editor.kind === 'retire' ? editor.account : null}
        onClose={() => {
          setEditor({ kind: 'closed' });
        }}
      />
    </>
  );
}

function Loaded({
  data,
  editor,
  setEditor,
}: {
  data: NonNullable<ReturnType<typeof useAccounts>['data']>;
  editor: Editor;
  setEditor: (editor: Editor) => void;
}) {
  const selection = useSelection(data.items);
  const { selected } = selection;
  return (
    <>
      <HiddenCallout count={data.hiddenSchoolWideCount} />
      {selected === undefined ? (
        <NoAccounts
          onAdd={() => {
            setEditor({ kind: 'add' });
          }}
        />
      ) : (
        <>
          <AccountTiles
            accounts={data.items}
            currency={data.currency}
            selectedId={selected.id}
            onSelect={selection.choose}
          />
          <CashBookCard
            key={selected.id}
            account={selected}
            currency={data.currency}
            page={selection.page}
            onPage={selection.setPage}
            onEdit={() => {
              setEditor({ kind: 'edit', account: selected });
            }}
            onRetire={() => {
              setEditor({ kind: 'retire', account: selected });
            }}
          />
        </>
      )}
      <Editors
        editor={editor}
        setEditor={setEditor}
        onSaved={selection.choose}
      />
    </>
  );
}

function useAccounts() {
  return useQuery(moneyAccountsQueryOptions(useApi()));
}

export function MoneyAccountsPage() {
  const accounts = useAccounts();
  const [editor, setEditor] = useState<Editor>({ kind: 'closed' });
  return (
    <section className="flex flex-col gap-4">
      <Header
        onAdd={() => {
          setEditor({ kind: 'add' });
        }}
      />
      {accounts.isPending ? (
        <div role="status" aria-label="Loading" className="flex flex-col gap-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : null}
      {accounts.isError ? <ErrorMessage error={accounts.error} /> : null}
      {accounts.data === undefined ? null : (
        <Loaded data={accounts.data} editor={editor} setEditor={setEditor} />
      )}
    </section>
  );
}
