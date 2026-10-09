-- migrate:up
alter table "user" add column "mustChangePassword" boolean default false not null;

-- migrate:down
alter table "user" drop column "mustChangePassword";
