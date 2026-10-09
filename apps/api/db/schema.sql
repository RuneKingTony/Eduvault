--
-- PostgreSQL database dump
--

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: audit_log_refuse_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.audit_log_refuse_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: account; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    "accountId" text NOT NULL,
    "providerId" text NOT NULL,
    "userId" text NOT NULL,
    "accessToken" text,
    "refreshToken" text,
    "idToken" text,
    "accessTokenExpiresAt" timestamp with time zone,
    "refreshTokenExpiresAt" timestamp with time zone,
    scope text,
    password text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);

--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    kind text NOT NULL,
    actor_user_id text NOT NULL,
    organization_id text,
    method text,
    action text,
    path text NOT NULL,
    status smallint NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT audit_log_action_check CHECK ((action = ANY (ARRAY['school.create'::text, 'school.suspend'::text, 'school.reactivate'::text, 'school.replaceOwner'::text]))),
    CONSTRAINT audit_log_kind_check CHECK ((kind = ANY (ARRAY['acting'::text, 'platform'::text]))),
    CONSTRAINT audit_log_reason_check CHECK (((char_length(reason) >= 1) AND (char_length(reason) <= 200))),
    CONSTRAINT audit_log_shape_check CHECK ((((kind = 'acting'::text) AND (method IS NOT NULL) AND (organization_id IS NOT NULL) AND (action IS NULL)) OR ((kind = 'platform'::text) AND (action IS NOT NULL) AND (method IS NULL))))
);

--
-- Name: campus; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campus (
    team_id text NOT NULL,
    organization_id text NOT NULL,
    address text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: class_level; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.class_level (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id text NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    sequence integer NOT NULL,
    next_level_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT class_level_check CHECK ((next_level_id <> id)),
    CONSTRAINT class_level_code_check CHECK ((code ~ '^[A-Z0-9]{2,8}$'::text))
);

--
-- Name: fee_schedule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fee_schedule (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id text NOT NULL,
    campus_id text,
    name text NOT NULL,
    amount_minor bigint NOT NULL,
    currency character(3) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fee_schedule_amount_minor_check CHECK ((amount_minor >= 0))
);

--
-- Name: invitation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invitation (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    "organizationId" text NOT NULL,
    email text NOT NULL,
    role text,
    "teamId" text,
    status text NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "inviterId" text NOT NULL
);

--
-- Name: member; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.member (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    "organizationId" text NOT NULL,
    "userId" text NOT NULL,
    role text NOT NULL,
    "createdAt" timestamp with time zone NOT NULL
);

--
-- Name: organization; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    logo text,
    "createdAt" timestamp with time zone NOT NULL,
    metadata text
);

--
-- Name: organizationRole; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."organizationRole" (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    "organizationId" text NOT NULL,
    role text NOT NULL,
    permission text NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone,
    label text,
    description text,
    source text,
    "editedAt" timestamp with time zone
);

--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    version character varying NOT NULL
);

--
-- Name: school_account; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.school_account (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id text NOT NULL,
    name text NOT NULL,
    currency character(3) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    city text,
    admission_prefix text NOT NULL,
    suspended_at timestamp with time zone,
    suspended_by text,
    CONSTRAINT school_account_admission_prefix_check CHECK ((admission_prefix ~ '^[A-Z]{2,6}$'::text)),
    CONSTRAINT school_account_suspended_check CHECK (((suspended_at IS NULL) = (suspended_by IS NULL)))
);

--
-- Name: session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    token text NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "ipAddress" text,
    "userAgent" text,
    "userId" text NOT NULL,
    "impersonatedBy" text,
    "activeOrganizationId" text,
    "activeTeamId" text
);

--
-- Name: student; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id text NOT NULL,
    campus_id text NOT NULL,
    full_name text NOT NULL,
    admission_number text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: team; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    name text NOT NULL,
    "memberCount" integer NOT NULL,
    "organizationId" text NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone
);

--
-- Name: teamMember; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."teamMember" (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    "teamId" text NOT NULL,
    "userId" text NOT NULL,
    "membershipKey" text,
    "createdAt" timestamp with time zone
);

--
-- Name: user; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."user" (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    "emailVerified" boolean NOT NULL,
    image text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    role text,
    banned boolean,
    "banReason" text,
    "banExpires" timestamp with time zone,
    "mustChangePassword" boolean DEFAULT false NOT NULL
);

--
-- Name: verification; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.verification (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    identifier text NOT NULL,
    value text NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: account account_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account
    ADD CONSTRAINT account_pkey PRIMARY KEY (id);

--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);

--
-- Name: campus campus_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campus
    ADD CONSTRAINT campus_pkey PRIMARY KEY (team_id);

--
-- Name: campus campus_team_id_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campus
    ADD CONSTRAINT campus_team_id_organization_id_key UNIQUE (team_id, organization_id);

--
-- Name: class_level class_level_id_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_level
    ADD CONSTRAINT class_level_id_organization_id_key UNIQUE (id, organization_id);

--
-- Name: class_level class_level_organization_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_level
    ADD CONSTRAINT class_level_organization_id_code_key UNIQUE (organization_id, code);

--
-- Name: class_level class_level_organization_id_sequence_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_level
    ADD CONSTRAINT class_level_organization_id_sequence_key UNIQUE (organization_id, sequence);

--
-- Name: class_level class_level_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_level
    ADD CONSTRAINT class_level_pkey PRIMARY KEY (id);

--
-- Name: fee_schedule fee_schedule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_schedule
    ADD CONSTRAINT fee_schedule_pkey PRIMARY KEY (id);

--
-- Name: invitation invitation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitation
    ADD CONSTRAINT invitation_pkey PRIMARY KEY (id);

--
-- Name: member member_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member
    ADD CONSTRAINT member_pkey PRIMARY KEY (id);

--
-- Name: organizationRole organizationRole_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."organizationRole"
    ADD CONSTRAINT "organizationRole_pkey" PRIMARY KEY (id);

--
-- Name: organization organization_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization
    ADD CONSTRAINT organization_pkey PRIMARY KEY (id);

--
-- Name: organization organization_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization
    ADD CONSTRAINT organization_slug_key UNIQUE (slug);

--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);

--
-- Name: school_account school_account_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_account
    ADD CONSTRAINT school_account_organization_id_key UNIQUE (organization_id);

--
-- Name: school_account school_account_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_account
    ADD CONSTRAINT school_account_pkey PRIMARY KEY (id);

--
-- Name: session session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (id);

--
-- Name: session session_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_token_key UNIQUE (token);

--
-- Name: student student_organization_id_admission_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student
    ADD CONSTRAINT student_organization_id_admission_number_key UNIQUE (organization_id, admission_number);

--
-- Name: student student_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student
    ADD CONSTRAINT student_pkey PRIMARY KEY (id);

--
-- Name: teamMember teamMember_membershipKey_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."teamMember"
    ADD CONSTRAINT "teamMember_membershipKey_key" UNIQUE ("membershipKey");

--
-- Name: teamMember teamMember_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."teamMember"
    ADD CONSTRAINT "teamMember_pkey" PRIMARY KEY (id);

--
-- Name: team team_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team
    ADD CONSTRAINT team_pkey PRIMARY KEY (id);

--
-- Name: user user_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT user_email_key UNIQUE (email);

--
-- Name: user user_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT user_pkey PRIMARY KEY (id);

--
-- Name: verification verification_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verification
    ADD CONSTRAINT verification_pkey PRIMARY KEY (id);

--
-- Name: account_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "account_userId_idx" ON public.account USING btree ("userId");

--
-- Name: audit_log_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_created_idx ON public.audit_log USING btree (created_at DESC);

--
-- Name: audit_log_organization_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_organization_created_idx ON public.audit_log USING btree (organization_id, created_at DESC);

--
-- Name: campus_organization_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campus_organization_id_idx ON public.campus USING btree (organization_id);

--
-- Name: fee_schedule_organization_campus_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fee_schedule_organization_campus_idx ON public.fee_schedule USING btree (organization_id, campus_id);

--
-- Name: invitation_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invitation_email_idx ON public.invitation USING btree (email);

--
-- Name: invitation_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "invitation_organizationId_idx" ON public.invitation USING btree ("organizationId");

--
-- Name: member_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "member_organizationId_idx" ON public.member USING btree ("organizationId");

--
-- Name: member_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "member_userId_idx" ON public.member USING btree ("userId");

--
-- Name: organizationRole_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "organizationRole_organizationId_idx" ON public."organizationRole" USING btree ("organizationId");

--
-- Name: organizationRole_organizationId_role_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "organizationRole_organizationId_role_key" ON public."organizationRole" USING btree ("organizationId", role);

--
-- Name: organizationRole_role_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "organizationRole_role_idx" ON public."organizationRole" USING btree (role);

--
-- Name: session_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "session_userId_idx" ON public.session USING btree ("userId");

--
-- Name: student_organization_campus_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX student_organization_campus_idx ON public.student USING btree (organization_id, campus_id);

--
-- Name: teamMember_teamId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "teamMember_teamId_idx" ON public."teamMember" USING btree ("teamId");

--
-- Name: teamMember_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "teamMember_userId_idx" ON public."teamMember" USING btree ("userId");

--
-- Name: team_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "team_organizationId_idx" ON public.team USING btree ("organizationId");

--
-- Name: verification_identifier_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX verification_identifier_idx ON public.verification USING btree (identifier);

--
-- Name: audit_log audit_log_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_log_append_only BEFORE DELETE OR UPDATE ON public.audit_log FOR EACH ROW EXECUTE FUNCTION public.audit_log_refuse_change();

--
-- Name: account account_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account
    ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

--
-- Name: audit_log audit_log_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public."user"(id) ON DELETE RESTRICT;

--
-- Name: audit_log audit_log_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE RESTRICT;

--
-- Name: campus campus_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campus
    ADD CONSTRAINT campus_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;

--
-- Name: campus campus_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campus
    ADD CONSTRAINT campus_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.team(id) ON DELETE CASCADE;

--
-- Name: class_level class_level_next_level_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_level
    ADD CONSTRAINT class_level_next_level_id_organization_id_fkey FOREIGN KEY (next_level_id, organization_id) REFERENCES public.class_level(id, organization_id);

--
-- Name: class_level class_level_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_level
    ADD CONSTRAINT class_level_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;

--
-- Name: fee_schedule fee_schedule_campus_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_schedule
    ADD CONSTRAINT fee_schedule_campus_id_organization_id_fkey FOREIGN KEY (campus_id, organization_id) REFERENCES public.campus(team_id, organization_id);

--
-- Name: fee_schedule fee_schedule_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_schedule
    ADD CONSTRAINT fee_schedule_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;

--
-- Name: invitation invitation_inviterId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitation
    ADD CONSTRAINT "invitation_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES public."user"(id) ON DELETE CASCADE;

--
-- Name: invitation invitation_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitation
    ADD CONSTRAINT "invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organization(id) ON DELETE CASCADE;

--
-- Name: member member_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member
    ADD CONSTRAINT "member_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organization(id) ON DELETE CASCADE;

--
-- Name: member member_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member
    ADD CONSTRAINT "member_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

--
-- Name: organizationRole organizationRole_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."organizationRole"
    ADD CONSTRAINT "organizationRole_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organization(id) ON DELETE CASCADE;

--
-- Name: school_account school_account_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_account
    ADD CONSTRAINT school_account_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;

--
-- Name: school_account school_account_suspended_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_account
    ADD CONSTRAINT school_account_suspended_by_fkey FOREIGN KEY (suspended_by) REFERENCES public."user"(id) ON DELETE RESTRICT;

--
-- Name: session session_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

--
-- Name: student student_campus_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student
    ADD CONSTRAINT student_campus_id_organization_id_fkey FOREIGN KEY (campus_id, organization_id) REFERENCES public.campus(team_id, organization_id);

--
-- Name: student student_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student
    ADD CONSTRAINT student_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;

--
-- Name: teamMember teamMember_teamId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."teamMember"
    ADD CONSTRAINT "teamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES public.team(id) ON DELETE CASCADE;

--
-- Name: teamMember teamMember_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."teamMember"
    ADD CONSTRAINT "teamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

--
-- Name: team team_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team
    ADD CONSTRAINT "team_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organization(id) ON DELETE CASCADE;

--
-- PostgreSQL database dump complete
--

--
-- Dbmate schema migrations
--

INSERT INTO public.schema_migrations (version) VALUES
    ('20261007112254'),
    ('20261007112300'),
    ('20261009155210'),
    ('20261009185725'),
    ('20261009190000'),
    ('20261009210000'),
    ('20261010090000');
