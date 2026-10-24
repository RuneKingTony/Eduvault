import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog';
import { Fact } from './fact';

export interface TraceDialogFact {
  label: string;
  value: string;
  mono: boolean;
}

export function TraceDialog({ facts }: { facts: readonly TraceDialogFact[] }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="link"
          size="xs"
          className="h-auto p-0 text-xs"
        >
          Trace
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Trace</DialogTitle>
          <DialogDescription>
            How this money reached the wallet, from Monnify to the books.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid gap-3 sm:grid-cols-2">
          {facts.map((fact) => (
            <Fact key={fact.label} label={fact.label} mono={fact.mono}>
              {fact.value}
            </Fact>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
