import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { StoreSummary } from '@eduvault/api-contract';
import { naira } from '@eduvault/shared';
import { Card, CardContent } from '@eduvault/ui';
import { useApi } from '../../api';
import { storeSummaryQueryOptions } from '../../queries';
import type { StoreSearch } from '../../store-search';
import { MaskedMoney } from './masked-money';
import { COSTS_HIDDEN_NOTE, stockValueNote, termSoldNote } from './store-text';

interface StoreTilesProps {
  search: StoreSearch;
  showCosts: boolean;
  onSearchChange: (next: StoreSearch) => void;
}

function Tile({
  label,
  value,
  note,
  onClick,
}: {
  label: string;
  value: ReactNode;
  note: string;
  onClick?: () => void;
}) {
  const body = (
    <CardContent className="flex flex-col gap-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
      <span className="text-sm text-muted-foreground">{note}</span>
    </CardContent>
  );
  return (
    <Card>
      {onClick === undefined ? (
        body
      ) : (
        <button
          type="button"
          className="rounded-xl text-left focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onClick}
        >
          {body}
        </button>
      )}
    </Card>
  );
}

const TILE_LABELS = [
  'Stock value',
  'Sold this term',
  'Profit this term',
  'Items sold',
] as const;

const TileGrid = ({ children }: { children: ReactNode }) => (
  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
);

function LoadedTiles({
  summary,
  search,
  showCosts,
  onSearchChange,
}: StoreTilesProps & { summary: StoreSummary }) {
  const toSold = () => {
    onSearchChange({ campus: search.campus, tab: 'sold' });
  };
  return (
    <TileGrid>
      <Tile
        label="Stock value"
        value={<MaskedMoney minor={summary.stockValueMinor} show={showCosts} />}
        note={stockValueNote(summary.lowCount)}
        onClick={() => {
          onSearchChange({
            ...search,
            tab: undefined,
            low: 1,
            page: undefined,
          });
        }}
      />
      <Tile
        label="Sold this term"
        value={naira(summary.termSalesMinor)}
        note={termSoldNote(summary.termStudentsServed)}
        onClick={toSold}
      />
      <Tile
        label="Profit this term"
        value={
          <MaskedMoney
            minor={summary.termSalesMinor - summary.termCostMinor}
            show={showCosts}
          />
        }
        note={showCosts ? 'Sales minus cost' : COSTS_HIDDEN_NOTE}
      />
      <Tile
        label="Items sold"
        value={summary.termItemsSold}
        note="This term · paid at the store"
        onClick={toSold}
      />
    </TileGrid>
  );
}

export function StoreTiles(props: StoreTilesProps) {
  const summary = useQuery(
    storeSummaryQueryOptions(useApi(), props.search.campus)
  ).data;
  if (summary === undefined) {
    return (
      <TileGrid>
        {TILE_LABELS.map((label) => (
          <Tile key={label} label={label} value="…" note=" " />
        ))}
      </TileGrid>
    );
  }
  return <LoadedTiles {...props} summary={summary} />;
}
