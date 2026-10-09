-- migrate:up
create unique index "organizationRole_organizationId_role_key" on "organizationRole" ("organizationId", "role");

-- migrate:down
drop index "organizationRole_organizationId_role_key";
