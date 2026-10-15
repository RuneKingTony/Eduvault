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
-- Name: btree_gist; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;

--
-- Name: EXTENSION btree_gist; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION btree_gist IS 'support for indexing common datatypes in GiST';

--
-- Name: activity_event_refuse_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.activity_event_refuse_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'activity_event is append-only';
END;
$$;

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

--
-- Name: journal_append_only(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.journal_append_only() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME
    USING ERRCODE = 'check_violation', CONSTRAINT = 'journal_append_only';
END;
$$;

--
-- Name: journal_entry_balanced(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.journal_entry_balanced() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  totals RECORD;
BEGIN
  SELECT count(*) AS lines,
    COALESCE(sum(debit_minor), 0) AS debits,
    COALESCE(sum(credit_minor), 0) AS credits
  INTO totals
  FROM journal_line
  WHERE entry_id = NEW.entry_id AND organization_id = NEW.organization_id;
  IF totals.lines < 2 OR totals.debits <> totals.credits THEN
    RAISE EXCEPTION 'journal entry % is not balanced', NEW.entry_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'journal_entry_balanced';
  END IF;
  RETURN NULL;
END;
$$;

--
-- Name: journal_entry_not_empty(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.journal_entry_not_empty() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM journal_line
    WHERE entry_id = NEW.id AND organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'journal entry % has no lines', NEW.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'journal_entry_not_empty';
  END IF;
  RETURN NULL;
END;
$$;

--
-- Name: journal_line_requires_student(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.journal_line_requires_student() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.student_id IS NULL AND EXISTS (
    SELECT 1 FROM ledger_account
    WHERE id = NEW.ledger_account_id
      AND organization_id = NEW.organization_id
      AND requires_student
  ) THEN
    RAISE EXCEPTION 'a line on this account needs a student'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'journal_line_requires_student';
  END IF;
  RETURN NEW;
END;
$$;

--
-- Name: ledger_account_system_fixed(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ledger_account_system_fixed() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF OLD.system_key IS NOT NULL AND (
    NEW.type IS DISTINCT FROM OLD.type
    OR NEW.parent_id IS DISTINCT FROM OLD.parent_id
    OR NEW.system_key IS DISTINCT FROM OLD.system_key
    OR NEW.retired_at IS DISTINCT FROM OLD.retired_at
  ) THEN
    RAISE EXCEPTION 'built-in account % cannot be changed', OLD.code
      USING ERRCODE = 'check_violation', CONSTRAINT = 'ledger_account_system_fixed';
  END IF;
  RETURN NEW;
END;
$$;

--
-- Name: seed_ledger_accounts(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_ledger_accounts(org text) RETURNS void
    LANGUAGE sql
    AS $$
  INSERT INTO ledger_account (organization_id, code, name, type, system_key, requires_student)
  VALUES
    (org, 1100, 'Fees owed to the school', 'asset', 'fees_receivable', TRUE),
    (org, 1200, 'Money accounts', 'asset', 'money_accounts', FALSE),
    (org, 1300, 'Store stock (books and uniforms)', 'asset', 'store_stock', FALSE),
    (org, 2100, 'Refunds owed to families', 'liability', 'customer_credit_refunds', FALSE),
    (org, 3000, 'Opening balance', 'equity', 'opening_balance_equity', FALSE),
    (org, 4000, 'Fee income', 'income', 'fee_income', FALSE),
    (org, 4500, 'Store sales', 'income', 'store_sales', FALSE),
    (org, 5000, 'Discounts given', 'expense', 'discounts_given', FALSE),
    (org, 5100, 'Bad debt', 'expense', 'bad_debt', FALSE),
    (org, 5200, 'Cost of store items sold', 'expense', 'store_cost', FALSE),
    (org, 5300, 'Store stock losses', 'expense', 'store_losses', FALSE)
  ON CONFLICT DO NOTHING;

  INSERT INTO ledger_account (organization_id, code, name, type, parent_id, system_key)
  SELECT org, fee.code, fee.name, 'income', parent.id, fee.system_key
  FROM (
    VALUES
      (4010, 'Tuition', NULL),
      (4020, 'PTA fee', NULL),
      (4030, 'School bus', NULL),
      (4040, 'Development levy', NULL),
      (4050, 'Laboratory fee', NULL),
      (4060, 'Other charges', 'other_charges'),
      (4070, 'Excursion levy', NULL),
      (4080, 'Graduation fee', NULL)
  ) AS fee (code, name, system_key)
  JOIN ledger_account parent
    ON parent.organization_id = org AND parent.system_key = 'fee_income'
  ON CONFLICT DO NOTHING;
$$;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: academic_session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.academic_session (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id text NOT NULL,
    name text NOT NULL,
    starts_on date NOT NULL,
    ends_on date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT academic_session_check CHECK (((ends_on - starts_on) >= 84)),
    CONSTRAINT academic_session_name_check CHECK ((name ~ '^\d{4}/\d{4}$'::text))
);

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
-- Name: activity_event; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_event (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id text NOT NULL,
    campus_id text,
    pillar text NOT NULL,
    kind text NOT NULL,
    actor_user_id text NOT NULL,
    subject_type text NOT NULL,
    subject_id text NOT NULL,
    text text NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT activity_event_pillar_check CHECK ((pillar = ANY (ARRAY['foundation'::text, 'finance'::text, 'access'::text, 'platform'::text])))
);

--
-- Name: announcement; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.announcement (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id text NOT NULL,
    campus_id text,
    title text NOT NULL,
    body text NOT NULL,
    tag text NOT NULL,
    status text NOT NULL,
    pinned boolean DEFAULT false NOT NULL,
    published_on date,
    withdrawn_at timestamp with time zone,
    created_by text NOT NULL,
    updated_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT announcement_body_check CHECK (((char_length(body) >= 1) AND (char_length(body) <= 2000))),
    CONSTRAINT announcement_check CHECK (((NOT pinned) OR (status = 'published'::text))),
    CONSTRAINT announcement_check1 CHECK (((status <> 'published'::text) OR (published_on IS NOT NULL))),
    CONSTRAINT announcement_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'withdrawn'::text]))),
    CONSTRAINT announcement_tag_check CHECK ((tag = ANY (ARRAY['general'::text, 'academics'::text, 'event'::text, 'fees'::text]))),
    CONSTRAINT announcement_title_check CHECK (((char_length(title) >= 1) AND (char_length(title) <= 80)))
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
-- Name: class_arm; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.class_arm (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id text NOT NULL,
    class_level_id uuid NOT NULL,
    campus_id text NOT NULL,
    name text NOT NULL,
    retired_at timestamp with time zone,
    retired_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT class_arm_name_check CHECK ((btrim(name) <> ''::text))
);

--
-- Name: class_arm_teacher; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.class_arm_teacher (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id text NOT NULL,
    class_arm_id uuid NOT NULL,
    session_id uuid NOT NULL,
    user_id text NOT NULL,
    role text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by text,
    CONSTRAINT class_arm_teacher_role_check CHECK ((role = ANY (ARRAY['lead'::text, 'assistant'::text, 'uniform'::text])))
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
-- Name: document_sequence; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_sequence (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id text NOT NULL,
    kind text NOT NULL,
    year smallint,
    next_value integer NOT NULL,
    CONSTRAINT document_sequence_kind_check CHECK ((kind = ANY (ARRAY['admission'::text, 'invoice'::text, 'payment'::text, 'billing_run'::text, 'adjustment'::text, 'store_sale'::text, 'delivery'::text, 'stock_count'::text]))),
    CONSTRAINT document_sequence_next_value_check CHECK ((next_value > 0))
);

--
-- Name: enrollment_placement; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.enrollment_placement (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id text NOT NULL,
    enrollment_id uuid NOT NULL,
    term_id uuid NOT NULL,
    class_arm_id uuid NOT NULL,
    campus_id text NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
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
-- Name: file_blob; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.file_blob (
    file_id uuid NOT NULL,
    organization_id text NOT NULL,
    bytes bytea NOT NULL
);

--
-- Name: file_object; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.file_object (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id text NOT NULL,
    kind text NOT NULL,
    storage_key text NOT NULL,
    content_type text NOT NULL,
    byte_size integer NOT NULL,
    sha256 text NOT NULL,
    original_name text NOT NULL,
    uploaded_by text,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT file_object_byte_size_check CHECK ((byte_size > 0)),
    CONSTRAINT file_object_kind_check CHECK ((kind = ANY (ARRAY['school_logo'::text, 'guardian_photo'::text])))
);

--
-- Name: guardian; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guardian (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id text NOT NULL,
    full_name text NOT NULL,
    phone text NOT NULL,
    email text,
    address text,
    photo_file_id uuid,
    user_id text NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT guardian_address_check CHECK ((char_length(address) <= 200)),
    CONSTRAINT guardian_full_name_check CHECK (((char_length(btrim(full_name)) >= 1) AND (char_length(btrim(full_name)) <= 120))),
    CONSTRAINT guardian_phone_check CHECK (((char_length(phone) >= 7) AND (char_length(phone) <= 20)))
);

--
-- Name: guardian_student; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guardian_student (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id text NOT NULL,
    guardian_id uuid NOT NULL,
    student_id uuid NOT NULL,
    relationship text NOT NULL,
    pays_fees boolean DEFAULT false NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT guardian_student_relationship_check CHECK ((relationship = ANY (ARRAY['mother'::text, 'father'::text, 'guardian'::text])))
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
-- Name: journal_entry; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.journal_entry (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id text NOT NULL,
    reference text NOT NULL,
    sequence bigint NOT NULL,
    kind text NOT NULL,
    source_id uuid,
    effective_on date NOT NULL,
    posted_at timestamp with time zone DEFAULT now() NOT NULL,
    posted_by text,
    memo text,
    reverses_entry_id uuid,
    CONSTRAINT journal_entry_kind_check CHECK ((kind = ANY (ARRAY['invoice'::text, 'adhoc'::text, 'payment'::text, 'payment_void'::text, 'adjustment'::text, 'opening'::text, 'store'::text, 'store_receive'::text, 'store_cost'::text, 'store_count'::text]))),
    CONSTRAINT journal_entry_memo_check CHECK ((char_length(memo) <= 500)),
    CONSTRAINT journal_entry_reference_check CHECK ((char_length(btrim(reference)) > 0))
);

--
-- Name: journal_entry_sequence_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.journal_entry ALTER COLUMN sequence ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.journal_entry_sequence_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: journal_line; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.journal_line (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id text NOT NULL,
    entry_id uuid NOT NULL,
    ledger_account_id uuid NOT NULL,
    student_id uuid,
    campus_id text,
    debit_minor bigint DEFAULT 0 NOT NULL,
    credit_minor bigint DEFAULT 0 NOT NULL,
    CONSTRAINT journal_line_one_side CHECK ((((debit_minor > 0) AND (credit_minor = 0)) OR ((credit_minor > 0) AND (debit_minor = 0))))
);

--
-- Name: ledger_account; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ledger_account (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id text NOT NULL,
    code integer NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    parent_id uuid,
    system_key text,
    requires_student boolean DEFAULT false NOT NULL,
    retired_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ledger_account_code_check CHECK ((code > 0)),
    CONSTRAINT ledger_account_name_check CHECK (((char_length(btrim(name)) >= 1) AND (char_length(btrim(name)) <= 80))),
    CONSTRAINT ledger_account_type_check CHECK ((type = ANY (ARRAY['asset'::text, 'liability'::text, 'equity'::text, 'income'::text, 'expense'::text])))
);

--
-- Name: member; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.member (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    "organizationId" text NOT NULL,
    "userId" text NOT NULL,
    role text NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    title text
);

--
-- Name: money_account; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.money_account (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id text NOT NULL,
    ledger_account_id uuid NOT NULL,
    campus_id text,
    name text NOT NULL,
    kind text NOT NULL,
    bank_name text,
    account_last4 text,
    retired_at timestamp with time zone,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT money_account_account_last4_check CHECK ((account_last4 ~ '^[0-9]{4}$'::text)),
    CONSTRAINT money_account_bank_name_check CHECK (((char_length(btrim(bank_name)) >= 1) AND (char_length(btrim(bank_name)) <= 80))),
    CONSTRAINT money_account_bank_name_for_bank CHECK (((bank_name IS NULL) OR (kind = 'bank'::text))),
    CONSTRAINT money_account_kind_check CHECK ((kind = ANY (ARRAY['cash'::text, 'bank'::text, 'pos'::text, 'gateway'::text]))),
    CONSTRAINT money_account_name_check CHECK (((char_length(btrim(name)) >= 1) AND (char_length(btrim(name)) <= 80)))
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
    address text,
    phone text,
    email text,
    logo_file_id uuid,
    updated_by text,
    CONSTRAINT school_account_address_check CHECK ((char_length(address) <= 200)),
    CONSTRAINT school_account_admission_prefix_check CHECK ((admission_prefix ~ '^[A-Z]{2,6}$'::text)),
    CONSTRAINT school_account_city_check CHECK ((char_length(city) <= 80)),
    CONSTRAINT school_account_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 120))),
    CONSTRAINT school_account_phone_check CHECK ((char_length(phone) <= 30)),
    CONSTRAINT school_account_suspended_check CHECK (((suspended_at IS NULL) = (suspended_by IS NULL)))
);

--
-- Name: school_holiday; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.school_holiday (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id text NOT NULL,
    term_id uuid NOT NULL,
    date date NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT school_holiday_name_check CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 100)))
);

--
-- Name: school_setting; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.school_setting (
    organization_id text NOT NULL,
    max_guardians smallint DEFAULT 4 NOT NULL,
    require_guardian boolean DEFAULT true NOT NULL,
    updated_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT school_setting_max_guardians_check CHECK (((max_guardians >= 1) AND (max_guardians <= 6)))
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
    first_name text NOT NULL,
    last_name text NOT NULL,
    gender text NOT NULL,
    date_of_birth date NOT NULL,
    admission_number text NOT NULL,
    admitted_on date NOT NULL,
    user_id text,
    created_by text,
    not_seen_since date,
    not_seen_by text,
    not_seen_note text,
    exit_kind text,
    exit_reason text,
    exit_note text,
    last_day date,
    graduated_session_id uuid,
    archived_at timestamp with time zone,
    archived_by text,
    archived_term_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT student_exit_completed_check CHECK (((exit_kind IS NULL) OR ((exit_kind = 'graduated'::text) = (exit_reason = 'completed'::text)))),
    CONSTRAINT student_exit_kind_check CHECK ((exit_kind = ANY (ARRAY['left'::text, 'graduated'::text]))),
    CONSTRAINT student_exit_note_check CHECK ((char_length(exit_note) <= 500)),
    CONSTRAINT student_exit_reason_check CHECK ((exit_reason = ANY (ARRAY['did_not_return'::text, 'relocated'::text, 'transferred'::text, 'fees'::text, 'expelled'::text, 'other'::text, 'completed'::text]))),
    CONSTRAINT student_exit_together CHECK ((((exit_kind IS NULL) AND (exit_reason IS NULL) AND (exit_note IS NULL) AND (last_day IS NULL) AND (graduated_session_id IS NULL) AND (archived_at IS NULL) AND (archived_by IS NULL) AND (archived_term_id IS NULL)) OR ((exit_kind IS NOT NULL) AND (exit_reason IS NOT NULL) AND (archived_at IS NOT NULL) AND (archived_term_id IS NOT NULL)))),
    CONSTRAINT student_first_name_check CHECK (((char_length(btrim(first_name)) >= 1) AND (char_length(btrim(first_name)) <= 80))),
    CONSTRAINT student_gender_check CHECK ((gender = ANY (ARRAY['F'::text, 'M'::text]))),
    CONSTRAINT student_last_name_check CHECK (((char_length(btrim(last_name)) >= 1) AND (char_length(btrim(last_name)) <= 80))),
    CONSTRAINT student_not_seen_note_check CHECK ((char_length(not_seen_note) <= 500)),
    CONSTRAINT student_not_seen_together CHECK (((not_seen_since IS NOT NULL) OR ((not_seen_by IS NULL) AND (not_seen_note IS NULL))))
);

--
-- Name: student_enrollment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_enrollment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id text NOT NULL,
    student_id uuid NOT NULL,
    session_id uuid NOT NULL,
    class_level_id uuid NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    is_new_student boolean DEFAULT false NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT student_enrollment_status_check CHECK ((status = ANY (ARRAY['active'::text, 'withdrawn'::text, 'completed'::text])))
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
-- Name: term; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.term (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id text NOT NULL,
    session_id uuid NOT NULL,
    sequence smallint NOT NULL,
    name text NOT NULL,
    starts_on date NOT NULL,
    ends_on date NOT NULL,
    is_current boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT term_check CHECK ((starts_on <= ends_on)),
    CONSTRAINT term_sequence_check CHECK (((sequence >= 1) AND (sequence <= 3)))
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
    "mustChangePassword" boolean DEFAULT false NOT NULL,
    username text,
    "displayUsername" text
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
-- Name: academic_session academic_session_id_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.academic_session
    ADD CONSTRAINT academic_session_id_organization_id_key UNIQUE (id, organization_id);

--
-- Name: academic_session academic_session_no_overlap; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.academic_session
    ADD CONSTRAINT academic_session_no_overlap EXCLUDE USING gist (organization_id WITH =, daterange(starts_on, ends_on, '[]'::text) WITH &&);

--
-- Name: academic_session academic_session_organization_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.academic_session
    ADD CONSTRAINT academic_session_organization_id_name_key UNIQUE (organization_id, name);

--
-- Name: academic_session academic_session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.academic_session
    ADD CONSTRAINT academic_session_pkey PRIMARY KEY (id);

--
-- Name: account account_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account
    ADD CONSTRAINT account_pkey PRIMARY KEY (id);

--
-- Name: activity_event activity_event_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_event
    ADD CONSTRAINT activity_event_pkey PRIMARY KEY (id);

--
-- Name: announcement announcement_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcement
    ADD CONSTRAINT announcement_pkey PRIMARY KEY (id);

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
-- Name: class_arm class_arm_id_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_arm
    ADD CONSTRAINT class_arm_id_organization_id_key UNIQUE (id, organization_id);

--
-- Name: class_arm class_arm_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_arm
    ADD CONSTRAINT class_arm_name_unique UNIQUE (class_level_id, campus_id, name);

--
-- Name: class_arm class_arm_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_arm
    ADD CONSTRAINT class_arm_pkey PRIMARY KEY (id);

--
-- Name: class_arm_teacher class_arm_teacher_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_arm_teacher
    ADD CONSTRAINT class_arm_teacher_pkey PRIMARY KEY (id);

--
-- Name: class_arm_teacher class_arm_teacher_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_arm_teacher
    ADD CONSTRAINT class_arm_teacher_unique UNIQUE (class_arm_id, session_id, user_id);

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
-- Name: document_sequence document_sequence_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_sequence
    ADD CONSTRAINT document_sequence_key UNIQUE NULLS NOT DISTINCT (organization_id, kind, year);

--
-- Name: document_sequence document_sequence_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_sequence
    ADD CONSTRAINT document_sequence_pkey PRIMARY KEY (id);

--
-- Name: enrollment_placement enrollment_placement_enrollment_term_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollment_placement
    ADD CONSTRAINT enrollment_placement_enrollment_term_key UNIQUE (enrollment_id, term_id);

--
-- Name: enrollment_placement enrollment_placement_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollment_placement
    ADD CONSTRAINT enrollment_placement_pkey PRIMARY KEY (id);

--
-- Name: fee_schedule fee_schedule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_schedule
    ADD CONSTRAINT fee_schedule_pkey PRIMARY KEY (id);

--
-- Name: file_blob file_blob_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_blob
    ADD CONSTRAINT file_blob_pkey PRIMARY KEY (file_id);

--
-- Name: file_object file_object_id_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_object
    ADD CONSTRAINT file_object_id_organization_id_key UNIQUE (id, organization_id);

--
-- Name: file_object file_object_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_object
    ADD CONSTRAINT file_object_pkey PRIMARY KEY (id);

--
-- Name: guardian guardian_id_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guardian
    ADD CONSTRAINT guardian_id_organization_id_key UNIQUE (id, organization_id);

--
-- Name: guardian guardian_organization_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guardian
    ADD CONSTRAINT guardian_organization_id_user_id_key UNIQUE (organization_id, user_id);

--
-- Name: guardian guardian_photo_file_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guardian
    ADD CONSTRAINT guardian_photo_file_id_key UNIQUE (photo_file_id);

--
-- Name: guardian guardian_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guardian
    ADD CONSTRAINT guardian_pkey PRIMARY KEY (id);

--
-- Name: guardian_student guardian_student_guardian_student_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guardian_student
    ADD CONSTRAINT guardian_student_guardian_student_key UNIQUE (guardian_id, student_id);

--
-- Name: guardian_student guardian_student_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guardian_student
    ADD CONSTRAINT guardian_student_pkey PRIMARY KEY (id);

--
-- Name: invitation invitation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitation
    ADD CONSTRAINT invitation_pkey PRIMARY KEY (id);

--
-- Name: journal_entry journal_entry_id_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entry
    ADD CONSTRAINT journal_entry_id_organization_id_key UNIQUE (id, organization_id);

--
-- Name: journal_entry journal_entry_organization_id_reference_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entry
    ADD CONSTRAINT journal_entry_organization_id_reference_key UNIQUE (organization_id, reference);

--
-- Name: journal_entry journal_entry_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entry
    ADD CONSTRAINT journal_entry_pkey PRIMARY KEY (id);

--
-- Name: journal_line journal_line_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_line
    ADD CONSTRAINT journal_line_pkey PRIMARY KEY (id);

--
-- Name: ledger_account ledger_account_id_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_account
    ADD CONSTRAINT ledger_account_id_organization_id_key UNIQUE (id, organization_id);

--
-- Name: ledger_account ledger_account_organization_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_account
    ADD CONSTRAINT ledger_account_organization_id_code_key UNIQUE (organization_id, code);

--
-- Name: ledger_account ledger_account_organization_id_system_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_account
    ADD CONSTRAINT ledger_account_organization_id_system_key_key UNIQUE (organization_id, system_key);

--
-- Name: ledger_account ledger_account_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_account
    ADD CONSTRAINT ledger_account_pkey PRIMARY KEY (id);

--
-- Name: member member_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member
    ADD CONSTRAINT member_pkey PRIMARY KEY (id);

--
-- Name: money_account money_account_id_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.money_account
    ADD CONSTRAINT money_account_id_organization_id_key UNIQUE (id, organization_id);

--
-- Name: money_account money_account_ledger_account_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.money_account
    ADD CONSTRAINT money_account_ledger_account_id_key UNIQUE (ledger_account_id);

--
-- Name: money_account money_account_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.money_account
    ADD CONSTRAINT money_account_pkey PRIMARY KEY (id);

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
-- Name: school_account school_account_logo_file_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_account
    ADD CONSTRAINT school_account_logo_file_id_key UNIQUE (logo_file_id);

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
-- Name: school_holiday school_holiday_organization_id_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_holiday
    ADD CONSTRAINT school_holiday_organization_id_date_key UNIQUE (organization_id, date);

--
-- Name: school_holiday school_holiday_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_holiday
    ADD CONSTRAINT school_holiday_pkey PRIMARY KEY (id);

--
-- Name: school_setting school_setting_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_setting
    ADD CONSTRAINT school_setting_pkey PRIMARY KEY (organization_id);

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
-- Name: student_enrollment student_enrollment_id_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_enrollment
    ADD CONSTRAINT student_enrollment_id_organization_id_key UNIQUE (id, organization_id);

--
-- Name: student_enrollment student_enrollment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_enrollment
    ADD CONSTRAINT student_enrollment_pkey PRIMARY KEY (id);

--
-- Name: student_enrollment student_enrollment_student_session_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_enrollment
    ADD CONSTRAINT student_enrollment_student_session_key UNIQUE (student_id, session_id);

--
-- Name: student student_id_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student
    ADD CONSTRAINT student_id_organization_id_key UNIQUE (id, organization_id);

--
-- Name: student student_organization_id_admission_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student
    ADD CONSTRAINT student_organization_id_admission_number_key UNIQUE (organization_id, admission_number);

--
-- Name: student student_organization_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student
    ADD CONSTRAINT student_organization_id_user_id_key UNIQUE (organization_id, user_id);

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
-- Name: term term_id_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.term
    ADD CONSTRAINT term_id_organization_id_key UNIQUE (id, organization_id);

--
-- Name: term term_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.term
    ADD CONSTRAINT term_pkey PRIMARY KEY (id);

--
-- Name: term term_session_id_sequence_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.term
    ADD CONSTRAINT term_session_id_sequence_key UNIQUE (session_id, sequence);

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
-- Name: activity_event_subject_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_event_subject_idx ON public.activity_event USING btree (organization_id, subject_type, subject_id);

--
-- Name: activity_event_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_event_time_idx ON public.activity_event USING btree (organization_id, occurred_at DESC);

--
-- Name: announcement_status_published_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX announcement_status_published_idx ON public.announcement USING btree (organization_id, status, published_on DESC);

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
-- Name: class_arm_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX class_arm_scope_idx ON public.class_arm USING btree (organization_id, campus_id);

--
-- Name: class_arm_teacher_one_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX class_arm_teacher_one_lead ON public.class_arm_teacher USING btree (class_arm_id, session_id) WHERE (role = 'lead'::text);

--
-- Name: class_arm_teacher_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX class_arm_teacher_scope_idx ON public.class_arm_teacher USING btree (organization_id, session_id, user_id);

--
-- Name: enrollment_placement_arm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX enrollment_placement_arm_idx ON public.enrollment_placement USING btree (organization_id, term_id, class_arm_id);

--
-- Name: enrollment_placement_campus_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX enrollment_placement_campus_idx ON public.enrollment_placement USING btree (organization_id, term_id, campus_id);

--
-- Name: fee_schedule_organization_campus_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fee_schedule_organization_campus_idx ON public.fee_schedule USING btree (organization_id, campus_id);

--
-- Name: file_object_organization_uploaded_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX file_object_organization_uploaded_idx ON public.file_object USING btree (organization_id, uploaded_at);

--
-- Name: guardian_email_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX guardian_email_unique ON public.guardian USING btree (organization_id, lower(email)) WHERE (email IS NOT NULL);

--
-- Name: guardian_student_student_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX guardian_student_student_idx ON public.guardian_student USING btree (organization_id, student_id);

--
-- Name: guardian_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX guardian_user_idx ON public.guardian USING btree (user_id);

--
-- Name: invitation_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invitation_email_idx ON public.invitation USING btree (email);

--
-- Name: invitation_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "invitation_organizationId_idx" ON public.invitation USING btree ("organizationId");

--
-- Name: journal_entry_effective_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX journal_entry_effective_idx ON public.journal_entry USING btree (organization_id, effective_on DESC, sequence DESC);

--
-- Name: journal_entry_reverses_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX journal_entry_reverses_key ON public.journal_entry USING btree (reverses_entry_id) WHERE (reverses_entry_id IS NOT NULL);

--
-- Name: journal_line_account_student_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX journal_line_account_student_idx ON public.journal_line USING btree (organization_id, ledger_account_id, student_id);

--
-- Name: journal_line_entry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX journal_line_entry_idx ON public.journal_line USING btree (entry_id);

--
-- Name: ledger_account_sibling_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ledger_account_sibling_name_key ON public.ledger_account USING btree (organization_id, parent_id, lower(name)) NULLS NOT DISTINCT;

--
-- Name: member_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "member_organizationId_idx" ON public.member USING btree ("organizationId");

--
-- Name: member_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "member_userId_idx" ON public.member USING btree ("userId");

--
-- Name: money_account_campus_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX money_account_campus_idx ON public.money_account USING btree (organization_id, campus_id);

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
-- Name: student_duplicate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX student_duplicate_idx ON public.student USING btree (organization_id, lower(last_name), lower(first_name), date_of_birth);

--
-- Name: student_enrollment_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX student_enrollment_session_idx ON public.student_enrollment USING btree (organization_id, session_id);

--
-- Name: student_organization_campus_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX student_organization_campus_idx ON public.student USING btree (organization_id, campus_id);

--
-- Name: student_organization_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX student_organization_name_idx ON public.student USING btree (organization_id, last_name, first_name);

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
-- Name: term_one_current; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX term_one_current ON public.term USING btree (organization_id) WHERE is_current;

--
-- Name: user_username_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX user_username_uidx ON public."user" USING btree (username);

--
-- Name: verification_identifier_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX verification_identifier_idx ON public.verification USING btree (identifier);

--
-- Name: activity_event activity_event_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER activity_event_append_only BEFORE DELETE OR UPDATE ON public.activity_event FOR EACH ROW EXECUTE FUNCTION public.activity_event_refuse_change();

--
-- Name: audit_log audit_log_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_log_append_only BEFORE DELETE OR UPDATE ON public.audit_log FOR EACH ROW EXECUTE FUNCTION public.audit_log_refuse_change();

--
-- Name: journal_entry journal_entry_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER journal_entry_append_only BEFORE DELETE OR UPDATE ON public.journal_entry FOR EACH ROW EXECUTE FUNCTION public.journal_append_only();

--
-- Name: journal_line journal_entry_balanced; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER journal_entry_balanced AFTER INSERT ON public.journal_line DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.journal_entry_balanced();

--
-- Name: journal_entry journal_entry_not_empty; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER journal_entry_not_empty AFTER INSERT ON public.journal_entry DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.journal_entry_not_empty();

--
-- Name: journal_line journal_line_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER journal_line_append_only BEFORE DELETE OR UPDATE ON public.journal_line FOR EACH ROW EXECUTE FUNCTION public.journal_append_only();

--
-- Name: journal_line journal_line_requires_student; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER journal_line_requires_student BEFORE INSERT ON public.journal_line FOR EACH ROW EXECUTE FUNCTION public.journal_line_requires_student();

--
-- Name: ledger_account ledger_account_system_fixed; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER ledger_account_system_fixed BEFORE UPDATE ON public.ledger_account FOR EACH ROW EXECUTE FUNCTION public.ledger_account_system_fixed();

--
-- Name: academic_session academic_session_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.academic_session
    ADD CONSTRAINT academic_session_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;

--
-- Name: account account_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account
    ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

--
-- Name: activity_event activity_event_campus_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_event
    ADD CONSTRAINT activity_event_campus_id_organization_id_fkey FOREIGN KEY (campus_id, organization_id) REFERENCES public.campus(team_id, organization_id);

--
-- Name: activity_event activity_event_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_event
    ADD CONSTRAINT activity_event_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE RESTRICT;

--
-- Name: announcement announcement_campus_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcement
    ADD CONSTRAINT announcement_campus_id_organization_id_fkey FOREIGN KEY (campus_id, organization_id) REFERENCES public.campus(team_id, organization_id);

--
-- Name: announcement announcement_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcement
    ADD CONSTRAINT announcement_created_by_fkey FOREIGN KEY (created_by) REFERENCES public."user"(id);

--
-- Name: announcement announcement_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcement
    ADD CONSTRAINT announcement_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE RESTRICT;

--
-- Name: announcement announcement_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcement
    ADD CONSTRAINT announcement_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public."user"(id);

--
-- Name: audit_log audit_log_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public."user"(id) ON DELETE RESTRICT;

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
-- Name: class_arm class_arm_campus_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_arm
    ADD CONSTRAINT class_arm_campus_id_organization_id_fkey FOREIGN KEY (campus_id, organization_id) REFERENCES public.campus(team_id, organization_id);

--
-- Name: class_arm class_arm_class_level_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_arm
    ADD CONSTRAINT class_arm_class_level_id_organization_id_fkey FOREIGN KEY (class_level_id, organization_id) REFERENCES public.class_level(id, organization_id);

--
-- Name: class_arm class_arm_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_arm
    ADD CONSTRAINT class_arm_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;

--
-- Name: class_arm class_arm_retired_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_arm
    ADD CONSTRAINT class_arm_retired_by_fkey FOREIGN KEY (retired_by) REFERENCES public."user"(id) ON DELETE SET NULL;

--
-- Name: class_arm_teacher class_arm_teacher_class_arm_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_arm_teacher
    ADD CONSTRAINT class_arm_teacher_class_arm_id_organization_id_fkey FOREIGN KEY (class_arm_id, organization_id) REFERENCES public.class_arm(id, organization_id) ON DELETE CASCADE;

--
-- Name: class_arm_teacher class_arm_teacher_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_arm_teacher
    ADD CONSTRAINT class_arm_teacher_created_by_fkey FOREIGN KEY (created_by) REFERENCES public."user"(id) ON DELETE SET NULL;

--
-- Name: class_arm_teacher class_arm_teacher_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_arm_teacher
    ADD CONSTRAINT class_arm_teacher_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;

--
-- Name: class_arm_teacher class_arm_teacher_session_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_arm_teacher
    ADD CONSTRAINT class_arm_teacher_session_id_organization_id_fkey FOREIGN KEY (session_id, organization_id) REFERENCES public.academic_session(id, organization_id);

--
-- Name: class_arm_teacher class_arm_teacher_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_arm_teacher
    ADD CONSTRAINT class_arm_teacher_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;

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
-- Name: document_sequence document_sequence_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_sequence
    ADD CONSTRAINT document_sequence_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;

--
-- Name: enrollment_placement enrollment_placement_campus_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollment_placement
    ADD CONSTRAINT enrollment_placement_campus_id_organization_id_fkey FOREIGN KEY (campus_id, organization_id) REFERENCES public.campus(team_id, organization_id);

--
-- Name: enrollment_placement enrollment_placement_class_arm_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollment_placement
    ADD CONSTRAINT enrollment_placement_class_arm_id_organization_id_fkey FOREIGN KEY (class_arm_id, organization_id) REFERENCES public.class_arm(id, organization_id);

--
-- Name: enrollment_placement enrollment_placement_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollment_placement
    ADD CONSTRAINT enrollment_placement_created_by_fkey FOREIGN KEY (created_by) REFERENCES public."user"(id) ON DELETE SET NULL;

--
-- Name: enrollment_placement enrollment_placement_enrollment_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollment_placement
    ADD CONSTRAINT enrollment_placement_enrollment_id_organization_id_fkey FOREIGN KEY (enrollment_id, organization_id) REFERENCES public.student_enrollment(id, organization_id) ON DELETE RESTRICT;

--
-- Name: enrollment_placement enrollment_placement_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollment_placement
    ADD CONSTRAINT enrollment_placement_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE RESTRICT;

--
-- Name: enrollment_placement enrollment_placement_term_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollment_placement
    ADD CONSTRAINT enrollment_placement_term_id_organization_id_fkey FOREIGN KEY (term_id, organization_id) REFERENCES public.term(id, organization_id);

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
-- Name: file_blob file_blob_file_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_blob
    ADD CONSTRAINT file_blob_file_id_organization_id_fkey FOREIGN KEY (file_id, organization_id) REFERENCES public.file_object(id, organization_id) ON DELETE CASCADE;

--
-- Name: file_object file_object_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_object
    ADD CONSTRAINT file_object_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;

--
-- Name: file_object file_object_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_object
    ADD CONSTRAINT file_object_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public."user"(id) ON DELETE SET NULL;

--
-- Name: guardian guardian_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guardian
    ADD CONSTRAINT guardian_created_by_fkey FOREIGN KEY (created_by) REFERENCES public."user"(id) ON DELETE SET NULL;

--
-- Name: guardian guardian_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guardian
    ADD CONSTRAINT guardian_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE RESTRICT;

--
-- Name: guardian guardian_photo_file_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guardian
    ADD CONSTRAINT guardian_photo_file_fkey FOREIGN KEY (photo_file_id, organization_id) REFERENCES public.file_object(id, organization_id) ON DELETE SET NULL (photo_file_id);

--
-- Name: guardian_student guardian_student_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guardian_student
    ADD CONSTRAINT guardian_student_created_by_fkey FOREIGN KEY (created_by) REFERENCES public."user"(id) ON DELETE SET NULL;

--
-- Name: guardian_student guardian_student_guardian_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guardian_student
    ADD CONSTRAINT guardian_student_guardian_id_organization_id_fkey FOREIGN KEY (guardian_id, organization_id) REFERENCES public.guardian(id, organization_id) ON DELETE RESTRICT;

--
-- Name: guardian_student guardian_student_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guardian_student
    ADD CONSTRAINT guardian_student_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE RESTRICT;

--
-- Name: guardian_student guardian_student_student_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guardian_student
    ADD CONSTRAINT guardian_student_student_id_organization_id_fkey FOREIGN KEY (student_id, organization_id) REFERENCES public.student(id, organization_id) ON DELETE RESTRICT;

--
-- Name: guardian guardian_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guardian
    ADD CONSTRAINT guardian_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE RESTRICT;

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
-- Name: journal_entry journal_entry_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entry
    ADD CONSTRAINT journal_entry_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE RESTRICT;

--
-- Name: journal_entry journal_entry_reverses_entry_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entry
    ADD CONSTRAINT journal_entry_reverses_entry_id_organization_id_fkey FOREIGN KEY (reverses_entry_id, organization_id) REFERENCES public.journal_entry(id, organization_id) ON DELETE RESTRICT;

--
-- Name: journal_line journal_line_campus_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_line
    ADD CONSTRAINT journal_line_campus_id_organization_id_fkey FOREIGN KEY (campus_id, organization_id) REFERENCES public.campus(team_id, organization_id) ON DELETE RESTRICT;

--
-- Name: journal_line journal_line_entry_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_line
    ADD CONSTRAINT journal_line_entry_id_organization_id_fkey FOREIGN KEY (entry_id, organization_id) REFERENCES public.journal_entry(id, organization_id) ON DELETE RESTRICT;

--
-- Name: journal_line journal_line_ledger_account_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_line
    ADD CONSTRAINT journal_line_ledger_account_id_organization_id_fkey FOREIGN KEY (ledger_account_id, organization_id) REFERENCES public.ledger_account(id, organization_id) ON DELETE RESTRICT;

--
-- Name: journal_line journal_line_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_line
    ADD CONSTRAINT journal_line_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE RESTRICT;

--
-- Name: journal_line journal_line_student_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_line
    ADD CONSTRAINT journal_line_student_id_organization_id_fkey FOREIGN KEY (student_id, organization_id) REFERENCES public.student(id, organization_id) ON DELETE RESTRICT;

--
-- Name: ledger_account ledger_account_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_account
    ADD CONSTRAINT ledger_account_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;

--
-- Name: ledger_account ledger_account_parent_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_account
    ADD CONSTRAINT ledger_account_parent_id_organization_id_fkey FOREIGN KEY (parent_id, organization_id) REFERENCES public.ledger_account(id, organization_id) ON DELETE RESTRICT;

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
-- Name: money_account money_account_campus_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.money_account
    ADD CONSTRAINT money_account_campus_id_organization_id_fkey FOREIGN KEY (campus_id, organization_id) REFERENCES public.campus(team_id, organization_id) ON DELETE RESTRICT;

--
-- Name: money_account money_account_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.money_account
    ADD CONSTRAINT money_account_created_by_fkey FOREIGN KEY (created_by) REFERENCES public."user"(id) ON DELETE SET NULL;

--
-- Name: money_account money_account_ledger_account_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.money_account
    ADD CONSTRAINT money_account_ledger_account_id_organization_id_fkey FOREIGN KEY (ledger_account_id, organization_id) REFERENCES public.ledger_account(id, organization_id) ON DELETE RESTRICT;

--
-- Name: money_account money_account_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.money_account
    ADD CONSTRAINT money_account_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE RESTRICT;

--
-- Name: organizationRole organizationRole_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."organizationRole"
    ADD CONSTRAINT "organizationRole_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organization(id) ON DELETE CASCADE;

--
-- Name: school_account school_account_logo_file_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_account
    ADD CONSTRAINT school_account_logo_file_fkey FOREIGN KEY (logo_file_id, organization_id) REFERENCES public.file_object(id, organization_id) ON DELETE SET NULL (logo_file_id);

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
-- Name: school_account school_account_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_account
    ADD CONSTRAINT school_account_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public."user"(id) ON DELETE SET NULL;

--
-- Name: school_holiday school_holiday_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_holiday
    ADD CONSTRAINT school_holiday_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;

--
-- Name: school_holiday school_holiday_term_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_holiday
    ADD CONSTRAINT school_holiday_term_id_organization_id_fkey FOREIGN KEY (term_id, organization_id) REFERENCES public.term(id, organization_id) ON DELETE CASCADE;

--
-- Name: school_setting school_setting_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_setting
    ADD CONSTRAINT school_setting_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;

--
-- Name: school_setting school_setting_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_setting
    ADD CONSTRAINT school_setting_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public."user"(id) ON DELETE SET NULL;

--
-- Name: session session_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;

--
-- Name: student student_archived_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student
    ADD CONSTRAINT student_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES public."user"(id) ON DELETE SET NULL;

--
-- Name: student student_archived_term_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student
    ADD CONSTRAINT student_archived_term_id_organization_id_fkey FOREIGN KEY (archived_term_id, organization_id) REFERENCES public.term(id, organization_id);

--
-- Name: student student_campus_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student
    ADD CONSTRAINT student_campus_id_organization_id_fkey FOREIGN KEY (campus_id, organization_id) REFERENCES public.campus(team_id, organization_id);

--
-- Name: student student_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student
    ADD CONSTRAINT student_created_by_fkey FOREIGN KEY (created_by) REFERENCES public."user"(id) ON DELETE SET NULL;

--
-- Name: student_enrollment student_enrollment_class_level_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_enrollment
    ADD CONSTRAINT student_enrollment_class_level_id_organization_id_fkey FOREIGN KEY (class_level_id, organization_id) REFERENCES public.class_level(id, organization_id);

--
-- Name: student_enrollment student_enrollment_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_enrollment
    ADD CONSTRAINT student_enrollment_created_by_fkey FOREIGN KEY (created_by) REFERENCES public."user"(id) ON DELETE SET NULL;

--
-- Name: student_enrollment student_enrollment_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_enrollment
    ADD CONSTRAINT student_enrollment_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE RESTRICT;

--
-- Name: student_enrollment student_enrollment_session_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_enrollment
    ADD CONSTRAINT student_enrollment_session_id_organization_id_fkey FOREIGN KEY (session_id, organization_id) REFERENCES public.academic_session(id, organization_id);

--
-- Name: student_enrollment student_enrollment_student_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_enrollment
    ADD CONSTRAINT student_enrollment_student_id_organization_id_fkey FOREIGN KEY (student_id, organization_id) REFERENCES public.student(id, organization_id) ON DELETE RESTRICT;

--
-- Name: student student_graduated_session_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student
    ADD CONSTRAINT student_graduated_session_id_organization_id_fkey FOREIGN KEY (graduated_session_id, organization_id) REFERENCES public.academic_session(id, organization_id);

--
-- Name: student student_not_seen_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student
    ADD CONSTRAINT student_not_seen_by_fkey FOREIGN KEY (not_seen_by) REFERENCES public."user"(id) ON DELETE SET NULL;

--
-- Name: student student_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student
    ADD CONSTRAINT student_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE RESTRICT;

--
-- Name: student student_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student
    ADD CONSTRAINT student_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE SET NULL;

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
-- Name: term term_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.term
    ADD CONSTRAINT term_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;

--
-- Name: term term_session_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.term
    ADD CONSTRAINT term_session_id_organization_id_fkey FOREIGN KEY (session_id, organization_id) REFERENCES public.academic_session(id, organization_id) ON DELETE CASCADE;

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
    ('20261010090000'),
    ('20261010100000'),
    ('20261010120000'),
    ('20261010130000'),
    ('20261010140000'),
    ('20261011060008'),
    ('20261011090000'),
    ('20261011100000'),
    ('20261012090000');
