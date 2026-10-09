-- migrate:up
create table "organizationRole" (
  "id" text not null primary key default gen_random_uuid()::text,
  "organizationId" text not null references "organization" ("id") on delete cascade,
  "role" text not null,
  "permission" text not null,
  "createdAt" timestamptz default CURRENT_TIMESTAMP not null,
  "updatedAt" timestamptz,
  "label" text,
  "description" text,
  "source" text,
  "editedAt" timestamptz
);

create index "organizationRole_organizationId_idx" on "organizationRole" ("organizationId");

create index "organizationRole_role_idx" on "organizationRole" ("role");

-- migrate:down
DROP TABLE "organizationRole";
