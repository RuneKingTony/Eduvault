# Add an S3-compatible FileStore driver, selected by config

- Status: proposed
- Date: 2026-10-12

Points marked **Choice** were taken without the owner and are the cheapest to reverse; overrule any of them in review.

## Context

`FileStore` (`put`, `get`, `delete`, keyed by `organizationId` and `key`) has one driver, `PostgresFileStore`: bytes in `file_blob (file_id, organization_id, bytes BYTEA)`, tied to `file_object` by a cascading foreign key. D-028 and LD-06 deferred an S3-compatible driver "when hosting is chosen" and asked for an ADR first. Issue #81 is that follow-up. This ADR settles the driver; it does not choose hosting.

Facts that shape it:

- The current driver is Postgres, not local disk. Nothing in the repo writes blobs to a disk.
- `FilesService` inserts the `file_object` row, then calls `store.put`; on failure it deletes the row. `storage_key` is the file id. Reads call `readable()` (school, kind permission, attached: D-114) and then `store.get`. `GET /files/:id` streams bytes with `Cache-Control: private` and `nosniff`.
- `FileSweepService` deletes orphan `file_object` rows and relies on the cascade to drop the blob. That does not delete an S3 object.
- The SPAs render logos and guardian photos as `<img src="${API_URL}/files/:id">`, authenticated by the host-scoped session cookie. An `<img>` cannot carry the acting headers, so an acted school shows initials (`shell-sidebar.tsx`).
- Uploads are at most 1 MB per kind today (proof of transfer will be 4 MB). Docker Compose runs only Postgres; there is no MinIO yet.

## Decision

Add `S3FileStore` beside `PostgresFileStore`, chosen by `FILE_STORE_DRIVER`. The default stays `postgres`, so nothing changes until a deployment opts in. The `FileStore` interface does not change.

**Client and config**

- **Choice: `@aws-sdk/client-s3` v3**, `S3Client` only (no `lib-storage`, no presigner yet). With `endpoint` and `forcePathStyle` it talks to AWS, Cloudflare R2 and MinIO alike, so hosting stays open. The client sets `requestChecksumCalculation` and `responseChecksumValidation` to `WHEN_REQUIRED` so providers without the newer flexible-checksum headers accept it.
- Env, validated in `env.ts` with one `superRefine` that names every missing variable (as `loadEnv` does today):

| Variable                                   | Rule                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------- |
| `FILE_STORE_DRIVER`                        | `postgres` (default) or `s3`                                                          |
| `S3_BUCKET`, `S3_REGION`                   | required when `s3`                                                                    |
| `S3_ENDPOINT`                              | optional URL; omitted for AWS                                                         |
| `S3_FORCE_PATH_STYLE`                      | `true` or `false`, default `false`                                                    |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | both or neither; neither falls back to the SDK's default credential chain (IAM roles) |

- **Choice:** with `s3`, boot runs one `HeadBucket` and fails if the bucket is unreachable, in line with failing fast on a bad environment. `FILE_STORE_TOKEN` becomes a `useFactory` provider on the validated env.
- Local dev and tests use MinIO. It joins `docker-compose.yml` for dev; Testcontainers starts it for tests (see Testing). **Choice:** the compose service sits behind a `s3` profile and uses host ports 9100 (API) and 9101 (console), so `pnpm dev` and the existing ports are untouched. `.env.example` gets the MinIO values commented out.

**Keys and tenancy**

- The object key is `<organizationId>/<storageKey>`, composed inside the driver from `StoredFileKey`. **Choice:** no schema change: `file_object.storage_key` stays the file id, so existing rows map without a rewrite and no drift run is needed.
- A read with another school's `organizationId` composes a different key, finds nothing and returns `undefined`, which the service already turns into 404. The driver rejects an `organizationId` or `key` that contains `/`, `..` or is empty, so a caller cannot escape its prefix. The authority is still `file_object` plus `readable()`; the key layout is a second wall, not the first.
- One private bucket for all schools. No public ACLs, no bucket policy that grants anonymous reads. Out-of-scope, unattached and missing files all answer 404, never 403 (D-114, ADR 0005).
- **Choice:** the bucket is created with versioning on, outside the app, where the provider offers it. It costs little and means a wrong delete is recoverable. The app never relies on it. Staging on Cloudflare R2 goes without versioning, which R2 does not offer ([ADR 0009](0009-deploy-staging-to-render.md) holds that fact and its re-check).

**Reads**

- **Choice: keep streaming through `GET /files/:id`.** The API keeps the per-request permission and attachment check (D-114), the headers, and the `<img>` cookie flow works unchanged. `get` still returns a `Buffer`, fine at 1 to 4 MB.
- Signed URLs are deferred, not rejected. They would remove API bandwidth and would let an acted school show its logo. They also hand a bearer URL to a browser, so they need a short expiry and care about caching. If adopted later: `GET /files/:id` keeps doing the check and answers 302 to a presigned URL of 60 seconds, with the content type and `nosniff` set through response overrides. That adds `@aws-sdk/s3-request-presigner` and is a separate decision.

**Write path**

- `put` is a single `PutObject` with the content type. `get` maps `NoSuchKey` to `undefined`; every other error (credentials, network) is thrown, never turned into a 404. `delete` is `DeleteObject`, which is a no-op on a missing key.
- `FileSweepService` must delete the object of each orphan, not just the row, and in the order `FilesService.discard` already uses: object first, then row. The repository selects the orphans (a new `findOrphansUploadedBefore`, replacing the bulk delete) and the sweep discards each one. If the object delete fails the row stays and the next sweep retries, so an object is never left without a row that points to it. The Postgres driver is unaffected (its `delete` removes the blob; the cascade finds nothing left).
- A crash after the row insert but before `put` leaves a row with no object: reads answer 404 and the sweep removes it after 24 hours, as today. A crash between `put` and the record attaching leaves an orphan the sweep now also cleans.

**Migrating existing blobs (Postgres to S3)**

- A script, `nx run api:files-copy`, copies through the `FileStore` interface, so it is driver-agnostic: `--from=postgres --to=s3`. It walks `file_object` in id order and, for each row, reads the source. If the destination already holds the bytes (same sha256) it skips; otherwise it writes, reads back and compares the SHA-256 with `file_object.sha256`. Idempotent and resumable: a rerun does only the remaining work.
- It prints counts (copied, already present, source missing, mismatched) and exits non-zero on any mismatch or missing source. **Default is a dry run;** `--apply` writes.
- **Never delete data:** the job removes nothing from either side, and `file_blob` rows stay after cutover. Dropping `file_blob` is its own migration, in a later issue, **Choice:** no sooner than 30 days after cutover and after a clean verify run.
- Cutover: copy, verify, switch `FILE_STORE_DRIVER=s3`, then copy and verify once more to catch uploads made during the window.
- Rollback is switching the driver back to `postgres`; the Postgres side is untouched. Files uploaded after cutover exist only in S3, so a rollback after cutover first runs the same job with `--from=s3 --to=postgres`. No dual write.

## Alternatives considered

- **Local disk driver**: the issue assumed one; none exists. It would break with more than one API instance (LD-06 reasons) and add backups of its own.
- **`minio` npm client**: smaller API but tied to MinIO's conventions and less common against AWS and R2.
- **`aws4fetch` or hand-signed requests**: tiny, but we would write and test XML error handling ourselves.
- **Rewrite `storage_key` to the full object key**: makes the DB self-describing and needs a data migration plus a drift run for no isolation gain, since the school is already a column.
- **Bucket per school**: strongest wall, but bucket creation becomes part of creating a school and provider limits on bucket counts apply.
- **Presigned URLs now**: see Reads.
- **Dual write during cutover**: more failure modes than a copy, a verify and a second copy.

## Testing

- `libs/testcontainers` gets `startMinio()` beside `startPostgres()`, with `@testcontainers/minio` added to the `testing` catalog at the same major as `@testcontainers/postgresql`. **Choice:** each spec that needs it starts MinIO in its own `beforeAll`, not in `global-setup.ts`, so the rest of `api:test-integration` does not pay for it. Unit tests still never start Docker.
- One contract suite, `describeFileStoreContract(name, makeStore)` in `apps/api/test/`, runs against both drivers. It covers: put then get returns identical bytes; `get` of an unknown key is `undefined`; the same key under school B does not read school A's bytes, and both can hold the same key at once; `delete` then `get` is `undefined`; `delete` of an unknown key resolves; `delete` under school B leaves school A's bytes. The factory creates the `file_object` row the Postgres driver's foreign key needs. A second `put` of one key is not specified, because the service never reuses a key.
- S3-only cases: a key containing `/` or `..` is rejected; wrong credentials make `get` reject instead of returning `undefined`.
- `files.integration.spec.ts` also runs against the S3 driver (upload, read, 404 for another school, delete, orphan sweep leaves no object). A migration spec seeds blobs, runs the job twice, checks the second run copies nothing, and checks that a corrupted copy is reported.

## Consequences

- The default deployment is unchanged. Choosing S3 is one env switch plus a copy run, reversible while `file_blob` is kept.
- ADR 0004 says Postgres is the only container and there is no infrastructure code. MinIO becomes a second, optional, local-only container. This ADR still chooses no host or deployment tooling; LD-06 deferred the driver "until hosting is chosen" and this un-defers the driver only.
- Storage is no longer in the same transaction or backup as the record. Consistency rests on the order in `FilesService`, the sweep and the verify job.
- Proof of transfer is never deleted (CONTEXT.md) and arrives with M3.4. Bucket versioning helps, but object lock or a retention rule for that kind is a follow-up decision before proofs ship on S3.

## Out of scope and follow-ups

- Choosing a host, credentials management, CDN, bucket lifecycle and encryption settings.
- Presigned or direct browser uploads (LD-07 (c)); presigned reads (above).
- Dropping `file_blob` after cutover; object lock for proofs; malware scanning (LD-10 revisited).
- Streaming `get` for large files, when a kind exceeds a few MB.
- Reconciling objects that have no `file_object` row: a `put` that succeeded after the client timed out (the `upload` catch block deletes the row), or a sweep interrupted mid-run.

## Phase 2 work list (one PR, after this one is accepted)

1. `pnpm-workspace.yaml`: `@aws-sdk/client-s3` in a catalog, `@testcontainers/minio` in `testing`; dependencies in `apps/api` and `libs/testcontainers`.
2. `apps/api/src/app/common/files/s3-file-store.ts` and its key helper.
3. `apps/api/src/app/common/config/env.ts` refinement, `.env.example`, and the `files.module.ts` factory with the boot `HeadBucket`.
4. Sweep fix: `deleteOrphansUploadedBefore` becomes a select of orphans; `FileSweepService` discards each (object, then row); update its spec and the repository.
5. `libs/testcontainers/src/minio.ts` and its export.
6. `apps/api/test/file-store.contract.ts`, run for both drivers, plus the S3 run of `files.integration.spec.ts`.
7. `docker-compose.yml` `minio` service (profile `s3`, bucket created on start) and the notes in `docs/development.md`.
8. The copy script, its `api:files-copy` target and its integration spec.
9. Decision-log rows for anything chosen in the build; update the ports line in CLAUDE.md if the compose ports stay.
10. Definition of done: `pnpm validate:quick`, `nx run api:test-integration`, and the e2e gate (the diff touches product code).
