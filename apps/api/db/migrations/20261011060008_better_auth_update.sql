-- migrate:up
alter table "user" add column "username" text;

alter table "user" add column "displayUsername" text;

create unique index "user_username_uidx" on "user" ("username");

-- migrate:down
drop index "user_username_uidx";

alter table "user" drop column "displayUsername";

alter table "user" drop column "username";

