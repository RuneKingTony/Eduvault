#!/usr/bin/env node
// Expand a --only spec into ticket keys: `401`, `EDU-401`, `401-432`, `EDU-401-EDU-432`, mixed with commas,
// e.g. `401-410,415,420-425`. A leading `+` marks the append form.
// usage: only.mjs <spec> → {"append": bool, "keys": ["EDU-401", ...]} (deduped, first-seen order)
// exit 2 with a message on stderr for a malformed token, a reversed range or an oversized range.
const MAX_RANGE = 500;
const spec = process.argv[2] ?? '';
const append = spec.startsWith('+');
const fail = (m) => {
  console.error(`--only: ${m}`);
  process.exit(2);
};
const tokens = (append ? spec.slice(1) : spec)
  .split(',')
  .map((t) => t.trim())
  .filter(Boolean);
if (tokens.length === 0) fail('no tickets given');
const keys = [];
const seen = new Set();
const add = (n) => {
  const k = `EDU-${n}`;
  if (!seen.has(k)) {
    seen.add(k);
    keys.push(k);
  }
};
for (const t of tokens) {
  const m = /^(?:EDU-)?(\d+)(?:-(?:EDU-)?(\d+))?$/i.exec(t);
  if (!m) fail(`cannot parse '${t}' (use 401, EDU-401, 401-432)`);
  const a = Number(m[1]);
  const b = m[2] === undefined ? a : Number(m[2]);
  if (a < 1 || b < 1) fail(`'${t}' has a ticket number below 1`);
  if (b < a) fail(`range '${t}' runs backwards`);
  if (b - a + 1 > MAX_RANGE)
    fail(`range '${t}' spans more than ${MAX_RANGE} tickets`);
  for (let n = a; n <= b; n++) add(n);
}
console.log(JSON.stringify({ append, keys }));
