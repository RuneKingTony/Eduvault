-- migrate:up
alter table "member" add column "title" text;

-- migrate:down
alter table "member" drop column "title";

