import { Badge } from '@eduvault/ui';
import { ContrastTable, type ContrastPair } from './contrast-table';

const PAIRS: readonly ContrastPair[] = [
  { label: 'Body text on card', text: ['foreground'], surface: ['card'] },
  {
    label: 'Muted text on card',
    text: ['muted-foreground'],
    surface: ['card'],
  },
  { label: 'Owe amount on card', text: ['destructive'], surface: ['card'] },
  { label: 'Paid amount on card', text: ['success'], surface: ['card'] },
  { label: 'Extra amount on card', text: ['credit'], surface: ['card'] },
  {
    label: 'Owe pill (12% tint)',
    text: ['destructive'],
    surface: ['destructive', 0.12],
  },
  {
    label: 'Paid pill (14% tint)',
    text: ['success'],
    surface: ['success', 0.14],
  },
  {
    label: 'Extra pill (12% tint)',
    text: ['credit'],
    surface: ['credit', 0.12],
  },
  {
    label: 'Owe row tint (8%)',
    text: ['destructive'],
    surface: ['destructive', 0.08],
  },
  {
    label: 'Paid row tint (8%)',
    text: ['success'],
    surface: ['success', 0.08],
  },
  { label: 'Extra row tint (7%)', text: ['credit'], surface: ['credit', 0.07] },
  {
    label: 'Warning badge ink on tint',
    text: ['warning-ink'],
    surface: ['warning', 0.25],
  },
  {
    label: 'Primary button text',
    text: ['primary-foreground'],
    surface: ['primary'],
  },
  {
    label: 'Teal text on tinted surface',
    text: ['primary-ink'],
    surface: ['primary-light'],
  },
  { label: 'Sidebar text', text: ['sidebar-foreground'], surface: ['sidebar'] },
  {
    label: 'Sidebar section label',
    text: ['sidebar-muted'],
    surface: ['sidebar'],
  },
  {
    label: 'Current nav item',
    text: ['sidebar-primary-foreground'],
    surface: ['sidebar-primary'],
  },
];

export function MoneySection() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-destructive/12 px-2.5 py-0.5 text-sm font-semibold text-destructive tabular-nums">
          ₦12,000
        </span>
        <span className="rounded-full bg-success/14 px-2.5 py-0.5 text-sm font-medium text-success">
          Paid up
        </span>
        <span className="rounded-full bg-credit/12 px-2.5 py-0.5 text-sm font-medium text-credit tabular-nums">
          ₦5,000 extra paid
        </span>
        <Badge variant="warning">Waiting</Badge>
      </div>
      <ContrastTable pairs={PAIRS} />
    </div>
  );
}
