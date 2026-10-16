import { useState } from 'react';
import { PlusIcon } from 'lucide-react';
import type { FeeType } from '@eduvault/api-contract';
import { Can } from '@eduvault/auth-client';
import { Button, Tabs, TabsList, TabsTrigger } from '@eduvault/ui';
import { NewFeeTypeDialog } from './new-fee-type-dialog';

const ALL = 'all';

export function FeeTypeChips({
  chips,
  selected,
  onSelect,
}: {
  chips: readonly FeeType[];
  selected: string | undefined;
  onSelect: (id: string | undefined) => void;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Tabs
        value={selected ?? ALL}
        onValueChange={(value) => {
          onSelect(value === ALL ? undefined : value);
        }}
      >
        <TabsList aria-label="Fee type" className="h-auto flex-wrap">
          <TabsTrigger value={ALL}>All other fees</TabsTrigger>
          {chips.map((chip) => (
            <TabsTrigger key={chip.id} value={chip.id}>
              {chip.name}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <Can permission="feeLine:create">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setAdding(true);
          }}
        >
          <PlusIcon />
          New fee type
        </Button>
      </Can>
      <NewFeeTypeDialog open={adding} onOpenChange={setAdding} />
    </div>
  );
}
