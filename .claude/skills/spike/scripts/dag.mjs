#!/usr/bin/env node
// The DAG walk, pure: no GitHub, no gh, no herdr — three files in, one JSON line out, so it is
// fixture-testable and cheap to re-run on every iteration.
//
// usage:
//   dag.mjs next    <graph.json> <observed.json> <epic-status.json>   → the walk (below)
//   dag.mjs mermaid <graph.json> <observed.json> <epic-status.json>   → a Mermaid `graph TD`
//   dag.mjs validate <graph.json>                                     → {ok, errors}; exit 1 if not ok
//
// graph.json    {epic, nodes: [{key, summary, status, done, external}], edges: {KEY: [blocker, ...]}, hash,
//               soft_edges: [{key, blocked_by, from, phrase, in_epic}]}
//               edges are normalised to blocked_by only (graph.sh unions both link directions). A soft edge
//               (ordering stated in the ticket text) gates, freezes and orders exactly like an edge.
// observed.json {KEY: {state: none|running|done|halted|died|blocked-ui|waiting-user|held|merged-outside-ship|withdrawn,
//               pr_url?, reason?, pane_tail?}} from observe.sh
// epic-status   {concurrency, only, max_tickets, run_started?, dispatched: {KEY: {epoch, withdrawn_at?, ...}}}
//
// next prints {complete, stalled, held_done, budget_done, cap, slots, dispatch, eligible, inflight, done, halted, held,
//              frozen, blocked, components, out_of_scope, budget_left, waiting_user, merged_outside, withdrawn, soft_edges}
import { readFileSync } from 'node:fs';

const [cmd, ...files] = process.argv.slice(2);
const read = (f) => JSON.parse(readFileSync(f, 'utf8'));

// edges ∪ the soft edges whose blocked ticket is in the graph and not external
function gating(g) {
  const node = Object.fromEntries(g.nodes.map((n) => [n.key, n]));
  const all = Object.fromEntries(
    Object.entries(g.edges).map(([k, bs]) => [k, [...bs]])
  );
  for (const e of g.soft_edges ?? []) {
    if (!node[e.key] || node[e.key].external || e.key === e.blocked_by)
      continue;
    if (!(all[e.key] ??= []).includes(e.blocked_by))
      all[e.key].push(e.blocked_by);
  }
  return all;
}

function validate(g) {
  const keys = new Set(g.nodes.map((n) => n.key));
  const errors = [];
  for (const [k, bs] of Object.entries(g.edges)) {
    if (!keys.has(k)) errors.push(`edge from unknown ticket ${k}`);
    for (const b of bs)
      if (!keys.has(b))
        errors.push(`${k} is blocked by ${b}, which does not resolve`);
  }
  const edges = gating(g);
  for (const [k, bs] of Object.entries(edges))
    for (const b of bs)
      if (!keys.has(b) && !(g.edges[k] ?? []).includes(b))
        errors.push(`${k}'s text orders it after ${b}, which does not resolve`);
  // cycle check — a cycle is a permanent deadlock, better named up front
  const color = {};
  const visit = (k, path) => {
    if (color[k] === 2) return;
    if (color[k] === 1) {
      errors.push(`cycle: ${[...path.slice(path.indexOf(k)), k].join(' -> ')}`);
      return;
    }
    color[k] = 1;
    for (const b of edges[k] ?? []) visit(b, [...path, k]);
    color[k] = 2;
  };
  for (const k of keys) visit(k, []);
  return { ok: errors.length === 0, errors };
}

function walk(g, obs, st) {
  const node = Object.fromEntries(g.nodes.map((n) => [n.key, n]));
  const edges = gating(g);
  const only = st.only ? new Set(st.only) : null;
  const internal = g.nodes.filter((n) => !n.external).map((n) => n.key);
  const inScope = (k) => !node[k].external && (!only || only.has(k));
  // withdrawn (withdraw.sh) frees its slot at once. While its ship still holds a live lock it is
  // `withdrawn` (not eligible: dispatch.sh would refuse it); after that it is `none` again
  const withdrawnKeys = new Set(
    Object.entries(st.dispatched ?? {})
      .filter(([, d]) => d?.withdrawn_at)
      .map(([k]) => k)
  );
  const state = (k) => {
    const s = obs[k]?.state ?? 'none';
    if (s === 'withdrawn') return s;
    if (withdrawnKeys.has(k) && s !== 'done' && s !== 'merged-outside-ship')
      return 'none';
    return s;
  };
  // Satisfied = issue closed, OR ship merged it (merge-gate pass + gh MERGED, confirmed by observe.sh).
  // ship never moves a ticket to Done ("closing an issue is human only"), so without the second arm the
  // epic would deadlock after its first merge.
  // A PR merged by hand (merge-gate never passed) still satisfies its dependents; the board flags it.
  const isDone = (k) =>
    node[k].done || state(k) === 'done' || state(k) === 'merged-outside-ship';
  const blockers = (k) => edges[k] ?? [];
  const dependents = {};
  for (const [k, bs] of Object.entries(edges))
    for (const b of bs) (dependents[b] ??= []).push(k);

  // depth = longest path to a sink over not-done tickets (critical path first)
  const memo = {};
  const depth = (k) => {
    if (k in memo) return memo[k];
    memo[k] = 0;
    const ds = (dependents[k] ?? []).filter((d) => !isDone(d));
    return (memo[k] = ds.length ? 1 + Math.max(...ds.map(depth)) : 0);
  };

  // weakly-connected components over internal tickets, ignoring direction
  const parent = Object.fromEntries(internal.map((k) => [k, k]));
  const find = (k) => (parent[k] === k ? k : (parent[k] = find(parent[k])));
  for (const [k, bs] of Object.entries(edges))
    for (const b of bs)
      if (k in parent && b in parent) parent[find(k)] = find(b);
  const comps = {};
  for (const k of internal) (comps[find(k)] ??= []).push(k);
  const components = Object.values(comps).map((c) => c.sort());

  // died = ship's lock went stale without a release (the session was killed); it freezes like a halt
  const halted = internal.filter((k) =>
    ['halted', 'died', 'blocked-ui'].includes(state(k))
  );
  // held = ship's merge-gate stopped on a hold-merge label on purpose: not a halt, so nothing freezes and it
  // holds no slot, but it isn't done, so its dependents stay blocked until it merges
  const held = internal.filter((k) => state(k) === 'held' && !isDone(k));
  const behindHold = new Set();
  const markBehind = (k) => {
    for (const d of dependents[k] ?? [])
      if (!behindHold.has(d)) {
        behindHold.add(d);
        markBehind(d);
      }
  };
  held.forEach(markBehind);
  const haltedRoots = new Set(halted.map(find));
  const frozen = internal.filter(
    (k) =>
      haltedRoots.has(find(k)) &&
      !isDone(k) &&
      !halted.includes(k) &&
      !held.includes(k)
  );
  const done = internal.filter(isDone);
  const inflight = internal.filter((k) => state(k) === 'running');
  // waiting-user = ship's lock is live but its pane has sat idle for a long time: it holds a slot like
  // blocked-ui, but doesn't freeze its component (ship is still alive and resumes once answered)
  const waitingUser = internal.filter((k) => state(k) === 'waiting-user');

  const blocked = {};
  const eligible = [];
  for (const k of internal) {
    if (!inScope(k) || isDone(k) || state(k) !== 'none') continue;
    const unmet = blockers(k).filter((b) => !isDone(b));
    if (unmet.length) {
      blocked[k] = unmet;
      continue;
    }
    if (haltedRoots.has(find(k))) continue; // frozen: its component has a halt
    eligible.push({ key: k, depth: depth(k), summary: node[k].summary });
  }
  eligible.sort(
    (a, b) =>
      b.depth - a.depth || a.key.localeCompare(b.key, 'en', { numeric: true })
  );

  // effective cap: dispatch.sh hands each ticket pane SHIP_MAX_PARALLEL=<concurrency>, so ship's
  // slot.sh admits the same number; the ceiling of 10 keeps the number of concurrent e2e stacks sane (stack-worktree.sh has room for 81 port sets)
  const conc = Math.max(1, Math.min(Number(st.concurrency ?? 3), 10));
  // only this run's dispatches spend --max-tickets (init.sh stamps run_started on each invocation)
  const dispatchedCount = Object.values(st.dispatched ?? {}).filter(
    (d) => !st.run_started || Number(d?.epoch ?? 0) >= Number(st.run_started)
  ).length;
  const budgetLeft = st.max_tickets
    ? Math.max(0, st.max_tickets - dispatchedCount)
    : null;
  // a blocked-ui ticket still holds a live ship lock, and ship's slot.sh counts it — so count it here
  const waitingOnUser = halted.filter((k) => state(k) === 'blocked-ui').length;
  const slots = Math.max(
    0,
    conc - inflight.length - waitingOnUser - waitingUser.length
  );
  const n = Math.min(slots, budgetLeft ?? Infinity);
  const dispatch = eligible.slice(0, n).map((e) => e.key);

  const remaining = internal.filter((k) => inScope(k) && !isDone(k));
  const complete = remaining.length === 0;
  // a ticket waiting on a prompt is the user's to answer — keep the run alive for it
  // --max-tickets spent and nothing left running: a clean stop, not a wait
  const budgetDone =
    budgetLeft === 0 &&
    inflight.length === 0 &&
    waitingUser.length === 0 &&
    !complete;
  const quiet =
    eligible.length === 0 &&
    inflight.length === 0 &&
    waitingUser.length === 0 &&
    !halted.some((k) => state(k) === 'blocked-ui');
  // only held tickets, and what waits behind them, are left: a clean stop until the operator merges them
  const heldDone =
    !budgetDone &&
    !complete &&
    quiet &&
    held.length > 0 &&
    halted.length === 0 &&
    remaining.every((k) => held.includes(k) || behindHold.has(k));
  const stalled = !budgetDone && !complete && !heldDone && quiet;
  const errors = only
    ? [...only]
        .filter((k) => !node[k] || node[k].external)
        .map((k) => `--only ${k} is not a child of ${g.epic}`)
    : [];
  const outOfScope = only ? internal.filter((k) => !only.has(k)) : [];
  return {
    complete,
    stalled,
    held_done: heldDone,
    budget_done: budgetDone,
    cap: conc,
    slots,
    budget_left: budgetLeft,
    dispatch,
    eligible,
    inflight,
    done,
    halted: halted.map((k) => ({
      key: k,
      state: state(k),
      reason: obs[k]?.reason ?? null,
    })),
    held: held.map((k) => ({
      key: k,
      reason: obs[k]?.reason ?? null,
      pr_url: obs[k]?.pr_url ?? null,
    })),
    frozen,
    blocked,
    components,
    out_of_scope: outOfScope,
    errors,
    waiting_user: waitingUser.map((k) => ({
      key: k,
      reason: obs[k]?.reason ?? null,
      pane_tail: obs[k]?.pane_tail ?? null,
    })),
    merged_outside: internal.filter((k) => state(k) === 'merged-outside-ship'),
    withdrawn: internal.filter((k) => withdrawnKeys.has(k) && !isDone(k)),
    soft_edges: (g.soft_edges ?? [])
      .filter((e) => node[e.key] && !node[e.key].external && !isDone(e.key))
      .map((e) => ({
        ...e,
        satisfied: Boolean(node[e.blocked_by]) && isDone(e.blocked_by),
      })),
  };
}

function mermaid(g, obs, st) {
  const w = walk(g, obs, st);
  const cls = (k) => {
    if (w.done.includes(k)) return 'done';
    if (w.inflight.includes(k) || w.waiting_user.some((x) => x.key === k))
      return 'inflight';
    if (w.held.some((h) => h.key === k)) return 'held';
    if (w.halted.some((h) => h.key === k)) return 'halted';
    if (w.eligible.some((e) => e.key === k)) return 'eligible';
    return 'blocked';
  };
  const id = (k) => k.replace(/[^A-Za-z0-9]/g, '');
  const lines = ['graph TD'];
  for (const n of g.nodes) {
    const label = n.external ? `${n.key} (outside epic)` : n.key;
    lines.push(
      `  ${id(n.key)}["${label}"]:::${n.external ? (n.done ? 'done' : 'blocked') : cls(n.key)}`
    );
  }
  for (const [k, bs] of Object.entries(g.edges))
    for (const b of bs) lines.push(`  ${id(b)} --> ${id(k)}`);
  for (const [k, bs] of Object.entries(gating(g)))
    for (const b of bs)
      if (!(g.edges[k] ?? []).includes(b))
        lines.push(`  ${id(b)} -.-> ${id(k)}`);
  lines.push(
    '  classDef done fill:#4caf50,color:#fff',
    '  classDef inflight fill:#2196f3,color:#fff',
    '  classDef eligible fill:#ffb300,color:#000',
    '  classDef halted fill:#e53935,color:#fff',
    '  classDef held fill:#8e24aa,color:#fff',
    '  classDef blocked fill:#9e9e9e,color:#fff'
  );
  return lines.join('\n');
}

const g = read(files[0]);
if (cmd === 'validate') {
  const v = validate(g);
  console.log(JSON.stringify(v));
  process.exit(v.ok ? 0 : 1);
}
const [obs, st] = [read(files[1]), read(files[2])];
const v = validate(g);
if (!v.ok) {
  console.log(JSON.stringify({ error: 'invalid graph', errors: v.errors }));
  process.exit(1);
}
if (cmd === 'next') console.log(JSON.stringify(walk(g, obs, st)));
else if (cmd === 'mermaid') console.log(mermaid(g, obs, st));
else {
  console.error(
    'usage: dag.mjs next|mermaid|validate <graph.json> [observed.json epic-status.json]'
  );
  process.exit(2);
}
