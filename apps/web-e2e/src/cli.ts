import { Ledger } from './support/ledger';

const path = process.argv[2];
if (!path) {
  console.error('usage: cleanup <path to ledger.json>');
  process.exit(2);
}

const lines = await new Ledger(path).reverse();
for (const line of lines) console.log(line);
process.exit(
  lines.some((line) => line.startsWith('FAILED') || line.startsWith('skip'))
    ? 1
    : 0
);
