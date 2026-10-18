import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CopyIcon, InfoIcon, PlusIcon } from 'lucide-react';
import {
  TUITION_FEE_CODE,
  type FeeCopySource,
  type FeeGrid,
  type FeeGroup,
  type FeeLine,
} from '@eduvault/api-contract';
import { Can, useCan } from '@eduvault/auth-client';
import {
  Button,
  ErrorMessage,
  NativeSelect,
  NativeSelectOption,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@eduvault/ui';
import { useApi } from '../../api';
import {
  chosenTerm,
  feeTermOptions,
  type FeeTermOption,
} from '../../fee-terms';
import type { FeesSearch } from '../../fees-search';
import {
  feeCopySourceQueryOptions,
  feeGridQueryOptions,
  feeLinesQueryOptions,
  feeSetupQueryOptions,
  feeTypesQueryOptions,
} from '../../queries';
import { NoCurrentTermCallout } from '../no-current-term-callout';
import { AddFeeSheet } from './add-fee-sheet';
import { AllFeesCard } from './all-fees-card';
import { ChangeAmountDialog } from './change-amount-dialog';
import { CopyFeesDialog } from './copy-fees-dialog';
import { FeeGridCard } from './fee-grid-card';
import { FeePreviewCard } from './fee-preview-card';
import { FEES_TIP } from './fee-text';
import { FeeTypeChips } from './fee-type-chips';
import { FeesTabs } from './fees-tabs';
import { RetireFeeDialog } from './retire-fee-dialog';

type Editor =
  | { kind: 'closed' }
  | { kind: 'edit'; line: FeeLine }
  | { kind: 'retire'; line: FeeLine };

const COPY = {
  school: {
    title: 'School fees',
    description: 'The main fee each class pays every term.',
    gridTitle: 'School fees',
    emptyAll: 'No school fees for this term',
  },
  other: {
    title: 'Other fees',
    description: 'Fees on top of school fees, grouped by type.',
    gridTitle: 'Other fees',
    emptyAll: 'No other fees for this term',
  },
} as const;

function copyOffer(data: FeeCopySource | undefined) {
  return data?.targetHasLines === false &&
    data.liveLineCount > 0 &&
    data.sourceTerm !== null
    ? { source: data.sourceTerm, count: data.liveLineCount }
    : undefined;
}

function useCopyOffer(group: FeeGroup, term: FeeTermOption | undefined) {
  const api = useApi();
  const canCreate = useCan('feeLine', 'create');
  const canReadAll = useCan('campus', 'readAll');
  const source = useQuery({
    ...feeCopySourceQueryOptions(api, term?.id ?? ''),
    enabled:
      group === 'school' && term !== undefined && canCreate && canReadAll,
  });
  return copyOffer(source.data);
}

function CopyFromLastTerm({
  group,
  term,
}: {
  group: FeeGroup;
  term: FeeTermOption | undefined;
}) {
  const [open, setOpen] = useState(false);
  const offer = useCopyOffer(group, term);
  if (offer === undefined || term === undefined) {
    return null;
  }
  return (
    <>
      <Button
        type="button"
        variant="secondary"
        onClick={() => {
          setOpen(true);
        }}
      >
        <CopyIcon />
        Copy from last term
      </Button>
      <CopyFeesDialog
        open={open}
        source={offer.source}
        count={offer.count}
        target={term}
        onOpenChange={setOpen}
      />
    </>
  );
}

function Header({
  group,
  options,
  term,
  onTerm,
  onAdd,
}: {
  group: FeeGroup;
  options: readonly FeeTermOption[];
  term: FeeTermOption | undefined;
  onTerm: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2">
          {COPY[group].title}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`About ${COPY[group].title.toLowerCase()}`}
                className="text-muted-foreground"
              >
                <InfoIcon className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{FEES_TIP}</TooltipContent>
          </Tooltip>
        </h1>
        <p className="text-sm text-muted-foreground">
          {COPY[group].description}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <NativeSelect
          aria-label="Term"
          value={term?.id ?? ''}
          onChange={(event) => {
            onTerm(event.target.value);
          }}
        >
          {options.map((option) => (
            <NativeSelectOption key={option.id} value={option.id}>
              {option.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <CopyFromLastTerm group={group} term={term} />
        <Can permission="feeLine:create">
          <Button type="button" onClick={onAdd}>
            <PlusIcon />
            Add a fee
          </Button>
        </Can>
      </div>
    </header>
  );
}

function Loading() {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-3">
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

interface BodyProps {
  group: FeeGroup;
  term: FeeTermOption;
  chipId: string | undefined;
}

function Cards({
  group,
  term,
  chipId,
  grid,
  lines,
  setEditor,
}: BodyProps & {
  grid: FeeGrid;
  lines: readonly FeeLine[];
  setEditor: (editor: Editor) => void;
}) {
  const shown =
    group === 'other' && chipId !== undefined
      ? lines.filter((line) => line.feeTypeId === chipId)
      : lines;
  const chipName = grid.feeTypes.find((type) => type.id === chipId)?.name;
  const scope = `${term.id}-${chipId ?? 'all'}`;
  const allFees = (
    <AllFeesCard
      key={`all-${scope}`}
      lines={shown}
      currency={grid.currency}
      emptyTitle={COPY[group].emptyAll}
      onEdit={(line) => {
        setEditor({ kind: 'edit', line });
      }}
      onRetire={(line) => {
        setEditor({ kind: 'retire', line });
      }}
    />
  );
  return (
    <>
      <FeeGridCard
        key={`grid-${scope}`}
        grid={grid}
        title={`${chipName ?? COPY[group].gridTitle} · ${term.label}`}
        showTotal={group === 'school'}
        emptyTitle={COPY[group].emptyAll}
      />
      {group === 'school' ? (
        <div className="grid items-start gap-4 lg:grid-cols-[3fr_2fr]">
          {allFees}
          <Can permission="student:read">
            <FeePreviewCard termId={term.id} />
          </Can>
        </div>
      ) : (
        allFees
      )}
    </>
  );
}

function Body(props: BodyProps) {
  const api = useApi();
  const { group, term, chipId } = props;
  const [editor, setEditor] = useState<Editor>({ kind: 'closed' });
  const grid = useQuery(
    feeGridQueryOptions(api, {
      termId: term.id,
      group,
      feeTypeId: group === 'other' ? chipId : undefined,
    })
  );
  const lines = useQuery(feeLinesQueryOptions(api, term.id, group));
  const error = grid.error ?? lines.error;
  if (grid.data === undefined || lines.data === undefined) {
    return error === null ? <Loading /> : <ErrorMessage error={error} />;
  }
  const close = () => {
    setEditor({ kind: 'closed' });
  };
  return (
    <>
      <Cards
        {...props}
        grid={grid.data}
        lines={lines.data}
        setEditor={setEditor}
      />
      <ChangeAmountDialog
        line={editor.kind === 'edit' ? editor.line : null}
        termLabel={term.label}
        currency={grid.data.currency}
        onClose={close}
      />
      <RetireFeeDialog
        line={editor.kind === 'retire' ? editor.line : null}
        currency={grid.data.currency}
        onClose={close}
      />
    </>
  );
}

function useChips(group: FeeGroup) {
  const feeTypes = useQuery({
    ...feeTypesQueryOptions(useApi()),
    enabled: group === 'other',
  });
  return (feeTypes.data ?? []).filter(
    (feeType) => feeType.code !== TUITION_FEE_CODE
  );
}

function useSetup() {
  return useQuery(feeSetupQueryOptions(useApi()));
}

function Content({
  group,
  setup,
  term,
  chipId,
}: {
  group: FeeGroup;
  setup: ReturnType<typeof useSetup>;
  term: FeeTermOption | undefined;
  chipId: string | undefined;
}) {
  if (setup.isError) {
    return <ErrorMessage error={setup.error} />;
  }
  if (setup.data === undefined) {
    return <Loading />;
  }
  return term === undefined ? (
    <NoCurrentTermCallout />
  ) : (
    <Body group={group} term={term} chipId={chipId} />
  );
}

export function FeesScreen({
  group,
  search,
  onSearchChange,
}: {
  group: FeeGroup;
  search: FeesSearch;
  onSearchChange: (next: FeesSearch) => void;
}) {
  const setup = useSetup();
  const chips = useChips(group);
  const options = feeTermOptions(setup.data?.terms ?? []);
  const term = chosenTerm(options, search.term);
  const chipId = chips.find((chip) => chip.id === search.type)?.id;
  const change = (next: Partial<FeesSearch>) => {
    onSearchChange({ ...search, ...next });
  };
  return (
    <section className="flex flex-col gap-4">
      <FeesTabs term={term?.id} />
      <Header
        group={group}
        options={options}
        term={term}
        onTerm={(id) => {
          change({ term: id });
        }}
        onAdd={() => {
          change({ add: 1 });
        }}
      />
      {group === 'other' ? (
        <FeeTypeChips
          chips={chips}
          selected={chipId}
          onSelect={(type) => {
            change({ type });
          }}
        />
      ) : null}
      <Content group={group} setup={setup} term={term} chipId={chipId} />
      {term === undefined ? null : (
        <AddFeeSheet
          open={search.add === 1}
          group={group}
          chipId={chipId}
          termId={term.id}
          termLabel={term.label}
          onOpenChange={(open) => {
            change({ add: open ? 1 : undefined });
          }}
        />
      )}
    </section>
  );
}
