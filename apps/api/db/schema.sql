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
-- Name: approval_record_immutable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.approval_record_immutable() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'a % is never deleted', TG_TABLE_NAME
      USING ERRCODE = 'check_violation', CONSTRAINT = TG_TABLE_NAME || '_never_deleted';
  END IF;
  IF OLD.status <> 'submitted' THEN
    RAISE EXCEPTION 'a decided % cannot change', TG_TABLE_NAME
      USING ERRCODE = 'check_violation', CONSTRAINT = TG_TABLE_NAME || '_decided_frozen';
  END IF;
  RETURN NEW;
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
-- Name: fee_line_fee_income_child(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fee_line_fee_income_child() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM ledger_account child
    JOIN ledger_account parent
      ON parent.id = child.parent_id AND parent.organization_id = child.organization_id
    WHERE child.id = NEW.ledger_account_id
      AND child.organization_id = NEW.organization_id
      AND parent.system_key = 'fee_income'
  ) THEN
    RAISE EXCEPTION 'a fee line needs a fee type under Fee income'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'fee_line_fee_income_child';
  END IF;
  RETURN NEW;
END;
$$;

--
-- Name: invoice_immutable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.invoice_immutable() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'a charge is never deleted'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'invoice_never_deleted';
  END IF;
  IF OLD.status <> 'draft' THEN
    RAISE EXCEPTION 'a sent or cancelled charge cannot change'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'invoice_frozen';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.student_id IS DISTINCT FROM OLD.student_id
    OR NEW.term_id IS DISTINCT FROM OLD.term_id
    OR NEW.campus_id IS DISTINCT FROM OLD.campus_id
    OR NEW.billing_run_id IS DISTINCT FROM OLD.billing_run_id
    OR NEW.kind IS DISTINCT FROM OLD.kind
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'only the status, number and issue details of a draft charge can change'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'invoice_frozen_fields';
  END IF;
  RETURN NEW;
END;
$$;

--
-- Name: invoice_line_draft_only(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.invoice_line_draft_only() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  parent_id UUID;
  parent_status TEXT;
BEGIN
  parent_id := CASE WHEN TG_OP = 'INSERT' THEN NEW.invoice_id ELSE OLD.invoice_id END;
  SELECT status INTO parent_status
  FROM invoice
  WHERE id = parent_id
    AND organization_id = CASE WHEN TG_OP = 'INSERT' THEN NEW.organization_id ELSE OLD.organization_id END;
  IF parent_status IS NOT NULL AND parent_status <> 'draft' THEN
    RAISE EXCEPTION 'the lines of a sent or cancelled charge cannot change'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'invoice_line_frozen';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.invoice_id <> OLD.invoice_id OR NEW.organization_id <> OLD.organization_id) THEN
    RAISE EXCEPTION 'a charge line cannot move to another charge'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'invoice_line_frozen';
  END IF;
  RETURN NEW;
END;
$$;

--
-- Name: item_never_deleted(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.item_never_deleted() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF school_is_gone(OLD.organization_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'an item is retired, never deleted'
    USING ERRCODE = 'check_violation', CONSTRAINT = 'item_never_deleted';
END;
$$;

--
-- Name: item_price_change_append_only(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.item_price_change_append_only() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'DELETE' AND school_is_gone(OLD.organization_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME
    USING ERRCODE = 'check_violation', CONSTRAINT = 'store_record_append_only';
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
-- Name: payment_allocation_immutable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.payment_allocation_immutable() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'a payment allocation cannot change'
    USING ERRCODE = 'check_violation', CONSTRAINT = 'payment_allocation_frozen';
END;
$$;

--
-- Name: payment_immutable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.payment_immutable() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'a payment is never deleted'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'payment_never_deleted';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.reference IS DISTINCT FROM OLD.reference
    OR NEW.receipt_number IS DISTINCT FROM OLD.receipt_number
    OR NEW.payer_guardian_id IS DISTINCT FROM OLD.payer_guardian_id
    OR NEW.payer_name IS DISTINCT FROM OLD.payer_name
    OR NEW.money_account_id IS DISTINCT FROM OLD.money_account_id
    OR NEW.method IS DISTINCT FROM OLD.method
    OR NEW.provider_reference IS DISTINCT FROM OLD.provider_reference
    OR NEW.proof_file_id IS DISTINCT FROM OLD.proof_file_id
    OR NEW.amount_minor IS DISTINCT FROM OLD.amount_minor
    OR NEW.paid_on IS DISTINCT FROM OLD.paid_on
    OR NEW.request_hash IS DISTINCT FROM OLD.request_hash
    OR NEW.journal_entry_id IS DISTINCT FROM OLD.journal_entry_id
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'only the status of a payment can change'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'payment_frozen_fields';
  END IF;
  RETURN NEW;
END;
$$;

--
-- Name: payment_store_sale_stays_posted(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.payment_store_sale_stays_posted() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'posted' AND EXISTS (
    SELECT 1 FROM store_sale
    WHERE payment_id = OLD.id AND organization_id = OLD.organization_id
  ) THEN
    RAISE EXCEPTION 'This payment is for a store sale. It can’t be cancelled on its own.'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'payment_store_sale_stays_posted';
  END IF;
  RETURN NEW;
END;
$$;

--
-- Name: school_is_gone(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.school_is_gone(org text) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  SELECT NOT EXISTS (SELECT 1 FROM "organization" WHERE id = org);
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

--
-- Name: stock_count_not_empty(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.stock_count_not_empty() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM stock_count_line
    WHERE stock_count_id = NEW.id AND organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'stock count % has no lines', NEW.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'stock_count_not_empty';
  END IF;
  RETURN NULL;
END;
$$;

--
-- Name: stock_delivery_not_empty(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.stock_delivery_not_empty() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM stock_delivery_line
    WHERE stock_delivery_id = NEW.id AND organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'stock delivery % has no lines', NEW.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'stock_delivery_not_empty';
  END IF;
  RETURN NULL;
END;
$$;

--
-- Name: stock_movement_append_only(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.stock_movement_append_only() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'a stock movement is never changed or deleted'
    USING ERRCODE = 'check_violation', CONSTRAINT = 'stock_movement_append_only';
END;
$$;

--
-- Name: store_record_append_only(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.store_record_append_only() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME
    USING ERRCODE = 'check_violation', CONSTRAINT = 'store_record_append_only';
END;
$$;

--
-- Name: store_sale_not_empty(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.store_sale_not_empty() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM store_sale_line
    WHERE store_sale_id = NEW.id AND organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'store sale % has no lines', NEW.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'store_sale_not_empty';
  END IF;
  RETURN NULL;
END;
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
-- Name: adjustment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.adjustment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id text NOT NULL,
    number text NOT NULL,
    kind text NOT NULL,
    student_id uuid NOT NULL,
    invoice_id uuid,
    ledger_account_id uuid,
    money_account_id uuid,
    amount_minor bigint NOT NULL,
    reason text NOT NULL,
    status text DEFAULT 'submitted'::text NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    approved_by text,
    approved_at timestamp with time zone,
    rejected_by text,
    rejected_at timestamp with time zone,
    rejection_reason text,
    journal_entry_id uuid,
    CONSTRAINT adjustment_amount_minor_check CHECK ((amount_minor > 0)),
    CONSTRAINT adjustment_approved_columns CHECK (((status = 'approved'::text) = (approved_at IS NOT NULL))),
    CONSTRAINT adjustment_approved_not_self CHECK (((approved_by IS NULL) OR (approved_by <> created_by))),
    CONSTRAINT adjustment_kind_check CHECK ((kind = ANY (ARRAY['credit_note'::text, 'write_off'::text, 'refund'::text]))),
    CONSTRAINT adjustment_kind_shape CHECK (
CASE kind
    WHEN 'credit_note'::text THEN ((ledger_account_id IS NOT NULL) AND (money_account_id IS NULL))
    WHEN 'write_off'::text THEN ((ledger_account_id IS NULL) AND (money_account_id IS NULL) AND (invoice_id IS NULL))
    ELSE ((money_account_id IS NOT NULL) AND (ledger_account_id IS NULL) AND (invoice_id IS NULL))
END),
    CONSTRAINT adjustment_number_check CHECK ((char_length(btrim(number)) > 0)),
    CONSTRAINT adjustment_reason_check CHECK (((char_length(btrim(reason)) >= 1) AND (char_length(btrim(reason)) <= 200))),
    CONSTRAINT adjustment_rejected_columns CHECK (((status = 'rejected'::text) = ((rejected_at IS NOT NULL) AND (rejected_by IS NOT NULL) AND (rejection_reason IS NOT NULL)))),
    CONSTRAINT adjustment_rejected_not_self CHECK (((rejected_by IS NULL) OR (rejected_by <> created_by))),
    CONSTRAINT adjustment_rejection_reason_check CHECK (((char_length(btrim(rejection_reason)) >= 1) AND (char_length(btrim(rejection_reason)) <= 500))),
    CONSTRAINT adjustment_status_check CHECK ((status = ANY (ARRAY['submitted'::text, 'approved'::text, 'rejected'::text])))
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
-- Name: billing_run; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_run (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id text NOT NULL,
    number text NOT NULL,
    term_id uuid NOT NULL,
    scope text NOT NULL,
    scope_campus_id text,
    scope_class_level_id uuid,
    status text DEFAULT 'draft'::text NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    issued_by text,
    issued_at timestamp with time zone,
    cancelled_by text,
    cancelled_at timestamp with time zone,
    CONSTRAINT billing_run_cancelled_columns CHECK (((status = 'cancelled'::text) = (cancelled_at IS NOT NULL))),
    CONSTRAINT billing_run_issued_columns CHECK (((status = 'issued'::text) = (issued_at IS NOT NULL))),
    CONSTRAINT billing_run_number_check CHECK ((char_length(btrim(number)) > 0)),
    CONSTRAINT billing_run_scope_check CHECK ((scope = ANY (ARRAY['school'::text, 'campus'::text, 'level'::text]))),
    CONSTRAINT billing_run_scope_matches CHECK ((((scope = 'school'::text) AND (scope_campus_id IS NULL) AND (scope_class_level_id IS NULL)) OR ((scope = 'campus'::text) AND (scope_campus_id IS NOT NULL) AND (scope_class_level_id IS NULL)) OR ((scope = 'level'::text) AND (scope_campus_id IS NULL) AND (scope_class_level_id IS NOT NULL)))),
    CONSTRAINT billing_run_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'issued'::text, 'cancelled'::text])))
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
-- Name: fee_line; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fee_line (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id text NOT NULL,
    term_id uuid NOT NULL,
    class_level_id uuid NOT NULL,
    ledger_account_id uuid NOT NULL,
    campus_id text,
    name text NOT NULL,
    amount_minor bigint NOT NULL,
    applies_to text DEFAULT 'all'::text NOT NULL,
    is_optional boolean DEFAULT false NOT NULL,
    retired_at timestamp with time zone,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fee_line_amount_positive CHECK ((amount_minor > 0)),
    CONSTRAINT fee_line_applies_to_check CHECK ((applies_to = ANY (ARRAY['all'::text, 'new'::text, 'returning'::text]))),
    CONSTRAINT fee_line_name_check CHECK (((char_length(btrim(name)) >= 1) AND (char_length(btrim(name)) <= 80)))
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
    CONSTRAINT file_object_kind_check CHECK ((kind = ANY (ARRAY['school_logo'::text, 'guardian_photo'::text, 'payment_proof'::text])))
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
-- Name: invoice; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id text NOT NULL,
    student_id uuid NOT NULL,
    term_id uuid NOT NULL,
    campus_id text NOT NULL,
    billing_run_id uuid,
    kind text NOT NULL,
    number text,
    status text DEFAULT 'draft'::text NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    issued_at timestamp with time zone,
    issued_by text,
    journal_entry_id uuid,
    CONSTRAINT invoice_issued_columns CHECK ((((status = 'issued'::text) AND (number IS NOT NULL) AND (issued_at IS NOT NULL) AND (journal_entry_id IS NOT NULL)) OR ((status <> 'issued'::text) AND (number IS NULL) AND (issued_at IS NULL) AND (journal_entry_id IS NULL)))),
    CONSTRAINT invoice_kind_check CHECK ((kind = ANY (ARRAY['term'::text, 'store'::text, 'adhoc'::text]))),
    CONSTRAINT invoice_number_check CHECK ((char_length(btrim(number)) > 0)),
    CONSTRAINT invoice_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'issued'::text, 'cancelled'::text]))),
    CONSTRAINT invoice_term_in_round CHECK (((kind <> 'term'::text) OR (billing_run_id IS NOT NULL)))
);

--
-- Name: invoice_line; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_line (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id text NOT NULL,
    invoice_id uuid NOT NULL,
    fee_line_id uuid,
    student_discount_id uuid,
    ledger_account_id uuid NOT NULL,
    description text NOT NULL,
    amount_minor bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT invoice_line_amount_nonzero CHECK ((amount_minor <> 0)),
    CONSTRAINT invoice_line_description_check CHECK (((char_length(btrim(description)) >= 1) AND (char_length(btrim(description)) <= 300))),
    CONSTRAINT invoice_line_discount_negative CHECK (((student_discount_id IS NOT NULL) = (amount_minor < 0)))
);

--
-- Name: item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.item (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id text NOT NULL,
    kind text NOT NULL,
    name text NOT NULL,
    variant text,
    class_level_id uuid,
    cost_price_minor bigint NOT NULL,
    sell_price_minor bigint NOT NULL,
    low_stock_level integer DEFAULT 5 NOT NULL,
    retired_at timestamp with time zone,
    retired_by text,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT item_cost_price_minor_check CHECK ((cost_price_minor >= 0)),
    CONSTRAINT item_kind_check CHECK ((kind = ANY (ARRAY['uniform'::text, 'book'::text]))),
    CONSTRAINT item_level_only_for_books CHECK (((kind = 'book'::text) = (class_level_id IS NOT NULL))),
    CONSTRAINT item_low_stock_level_check CHECK ((low_stock_level >= 0)),
    CONSTRAINT item_name_check CHECK (((char_length(btrim(name)) >= 1) AND (char_length(btrim(name)) <= 120))),
    CONSTRAINT item_price_not_below_cost CHECK ((sell_price_minor >= cost_price_minor)),
    CONSTRAINT item_variant_check CHECK (((char_length(btrim(variant)) >= 1) AND (char_length(btrim(variant)) <= 40))),
    CONSTRAINT item_variant_not_for_books CHECK (((kind <> 'book'::text) OR (variant IS NULL)))
);

--
-- Name: item_price_change; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.item_price_change (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id text NOT NULL,
    item_id uuid NOT NULL,
    old_cost_minor bigint NOT NULL,
    new_cost_minor bigint NOT NULL,
    old_price_minor bigint NOT NULL,
    new_price_minor bigint NOT NULL,
    changed_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
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
-- Name: level_subject; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.level_subject (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id text NOT NULL,
    class_level_id uuid NOT NULL,
    subject_id uuid NOT NULL,
    kind text NOT NULL,
    sequence integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT level_subject_kind_check CHECK ((kind = ANY (ARRAY['core'::text, 'elective'::text]))),
    CONSTRAINT level_subject_sequence_check CHECK ((sequence >= 1))
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
-- Name: payment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id text NOT NULL,
    reference text NOT NULL,
    receipt_number text NOT NULL,
    payer_guardian_id uuid,
    payer_name text NOT NULL,
    money_account_id uuid NOT NULL,
    method text NOT NULL,
    provider_reference text,
    proof_file_id uuid,
    amount_minor bigint NOT NULL,
    paid_on date NOT NULL,
    status text DEFAULT 'posted'::text NOT NULL,
    request_hash text NOT NULL,
    journal_entry_id uuid NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payment_amount_minor_check CHECK ((amount_minor > 0)),
    CONSTRAINT payment_method_check CHECK ((method = ANY (ARRAY['cash'::text, 'transfer'::text, 'pos'::text]))),
    CONSTRAINT payment_payer_name_check CHECK (((char_length(btrim(payer_name)) >= 1) AND (char_length(btrim(payer_name)) <= 120))),
    CONSTRAINT payment_provider_reference_check CHECK (((char_length(btrim(provider_reference)) >= 1) AND (char_length(btrim(provider_reference)) <= 80))),
    CONSTRAINT payment_receipt_number_check CHECK ((char_length(btrim(receipt_number)) > 0)),
    CONSTRAINT payment_reference_check CHECK (((char_length(btrim(reference)) >= 1) AND (char_length(btrim(reference)) <= 80))),
    CONSTRAINT payment_status_check CHECK ((status = ANY (ARRAY['posted'::text, 'void_pending'::text, 'voided'::text])))
);

--
-- Name: payment_allocation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_allocation (
    payment_id uuid NOT NULL,
    organization_id text NOT NULL,
    student_id uuid NOT NULL,
    amount_minor bigint NOT NULL,
    CONSTRAINT payment_allocation_amount_minor_check CHECK ((amount_minor > 0))
);

--
-- Name: payment_void; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_void (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id text NOT NULL,
    payment_id uuid NOT NULL,
    reason text NOT NULL,
    status text DEFAULT 'submitted'::text NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    approved_by text,
    approved_at timestamp with time zone,
    rejected_by text,
    rejected_at timestamp with time zone,
    rejection_reason text,
    journal_entry_id uuid,
    CONSTRAINT payment_void_approved_columns CHECK (((status = 'approved'::text) = (approved_at IS NOT NULL))),
    CONSTRAINT payment_void_approved_not_self CHECK (((approved_by IS NULL) OR (approved_by <> created_by))),
    CONSTRAINT payment_void_reason_check CHECK (((char_length(btrim(reason)) >= 1) AND (char_length(btrim(reason)) <= 500))),
    CONSTRAINT payment_void_rejected_columns CHECK (((status = 'rejected'::text) = ((rejected_at IS NOT NULL) AND (rejected_by IS NOT NULL) AND (rejection_reason IS NOT NULL)))),
    CONSTRAINT payment_void_rejected_not_self CHECK (((rejected_by IS NULL) OR (rejected_by <> created_by))),
    CONSTRAINT payment_void_rejection_reason_check CHECK (((char_length(btrim(rejection_reason)) >= 1) AND (char_length(btrim(rejection_reason)) <= 500))),
    CONSTRAINT payment_void_status_check CHECK ((status = ANY (ARRAY['submitted'::text, 'approved'::text, 'rejected'::text])))
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
    pay_cash boolean DEFAULT true NOT NULL,
    pay_transfer boolean DEFAULT true NOT NULL,
    pay_pos boolean DEFAULT true NOT NULL,
    receipt_footer text DEFAULT 'Thank you for your payment.'::text NOT NULL,
    approve_refund boolean DEFAULT true NOT NULL,
    approve_write_off boolean DEFAULT true NOT NULL,
    approve_credit_note boolean DEFAULT true NOT NULL,
    approve_discount boolean DEFAULT true NOT NULL,
    approve_payment_void boolean DEFAULT true NOT NULL,
    CONSTRAINT school_setting_max_guardians_check CHECK (((max_guardians >= 1) AND (max_guardians <= 6))),
    CONSTRAINT school_setting_pay_method_check CHECK ((pay_cash OR pay_transfer OR pay_pos)),
    CONSTRAINT school_setting_receipt_footer_check CHECK ((char_length(receipt_footer) <= 120))
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
-- Name: staff_leave; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_leave (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id text NOT NULL,
    type text NOT NULL,
    starts_on date NOT NULL,
    ends_on date NOT NULL,
    reason text NOT NULL,
    cover text,
    status text DEFAULT 'submitted'::text NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    approved_by text,
    approved_at timestamp with time zone,
    rejected_by text,
    rejected_at timestamp with time zone,
    rejection_reason text,
    cancelled_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT staff_leave_approved_columns CHECK (((status = 'approved'::text) = ((approved_by IS NOT NULL) AND (approved_at IS NOT NULL)))),
    CONSTRAINT staff_leave_approved_not_self CHECK (((approved_by IS NULL) OR (approved_by <> created_by))),
    CONSTRAINT staff_leave_cancelled_columns CHECK (((status = 'cancelled'::text) = (cancelled_at IS NOT NULL))),
    CONSTRAINT staff_leave_cover_check CHECK ((char_length(cover) <= 200)),
    CONSTRAINT staff_leave_dates CHECK ((ends_on >= starts_on)),
    CONSTRAINT staff_leave_reason_check CHECK (((char_length(btrim(reason)) >= 1) AND (char_length(btrim(reason)) <= 500))),
    CONSTRAINT staff_leave_rejected_columns CHECK (((status = 'rejected'::text) = ((rejected_by IS NOT NULL) AND (rejected_at IS NOT NULL) AND (rejection_reason IS NOT NULL)))),
    CONSTRAINT staff_leave_rejected_not_self CHECK (((rejected_by IS NULL) OR (rejected_by <> created_by))),
    CONSTRAINT staff_leave_rejection_reason_check CHECK (((char_length(btrim(rejection_reason)) >= 1) AND (char_length(btrim(rejection_reason)) <= 500))),
    CONSTRAINT staff_leave_status_check CHECK ((status = ANY (ARRAY['submitted'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text]))),
    CONSTRAINT staff_leave_type_check CHECK ((type = ANY (ARRAY['annual'::text, 'sick'::text, 'personal'::text, 'study'::text, 'parental'::text])))
);

--
-- Name: stock_count; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_count (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id text NOT NULL,
    number text NOT NULL,
    store_id uuid NOT NULL,
    status text NOT NULL,
    note text,
    journal_entry_id uuid,
    created_by text,
    approved_by text,
    approved_at timestamp with time zone,
    rejected_by text,
    rejected_at timestamp with time zone,
    rejection_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT stock_count_approved_columns CHECK (((status = 'approved'::text) = (approved_at IS NOT NULL))),
    CONSTRAINT stock_count_approved_not_self CHECK (((approved_by IS NULL) OR (approved_by <> created_by))),
    CONSTRAINT stock_count_note_check CHECK (((char_length(btrim(note)) >= 1) AND (char_length(btrim(note)) <= 500))),
    CONSTRAINT stock_count_number_check CHECK ((char_length(btrim(number)) > 0)),
    CONSTRAINT stock_count_rejected_columns CHECK (((status = 'rejected'::text) = ((rejected_at IS NOT NULL) AND (rejected_by IS NOT NULL) AND (rejection_reason IS NOT NULL)))),
    CONSTRAINT stock_count_rejected_not_self CHECK (((rejected_by IS NULL) OR (rejected_by <> created_by))),
    CONSTRAINT stock_count_rejection_reason_check CHECK (((char_length(btrim(rejection_reason)) >= 1) AND (char_length(btrim(rejection_reason)) <= 500))),
    CONSTRAINT stock_count_status_check CHECK ((status = ANY (ARRAY['matched'::text, 'submitted'::text, 'approved'::text, 'rejected'::text])))
);

--
-- Name: stock_count_line; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_count_line (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id text NOT NULL,
    stock_count_id uuid NOT NULL,
    item_id uuid NOT NULL,
    expected_quantity integer NOT NULL,
    counted_quantity integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT stock_count_line_counted_quantity_check CHECK ((counted_quantity >= 0)),
    CONSTRAINT stock_count_line_expected_quantity_check CHECK ((expected_quantity >= 0))
);

--
-- Name: stock_delivery; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_delivery (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id text NOT NULL,
    number text NOT NULL,
    reference text NOT NULL,
    request_hash text NOT NULL,
    store_id uuid NOT NULL,
    supplier_name text NOT NULL,
    money_account_id uuid,
    is_opening boolean DEFAULT false NOT NULL,
    received_on date NOT NULL,
    received_by text,
    total_minor bigint NOT NULL,
    journal_entry_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT stock_delivery_number_check CHECK ((char_length(btrim(number)) > 0)),
    CONSTRAINT stock_delivery_opening_has_no_account CHECK ((is_opening = (money_account_id IS NULL))),
    CONSTRAINT stock_delivery_reference_check CHECK (((char_length(btrim(reference)) >= 1) AND (char_length(btrim(reference)) <= 80))),
    CONSTRAINT stock_delivery_supplier_name_check CHECK (((char_length(btrim(supplier_name)) >= 1) AND (char_length(btrim(supplier_name)) <= 120))),
    CONSTRAINT stock_delivery_total_minor_check CHECK ((total_minor > 0))
);

--
-- Name: stock_delivery_line; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_delivery_line (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id text NOT NULL,
    stock_delivery_id uuid NOT NULL,
    item_id uuid NOT NULL,
    quantity integer NOT NULL,
    unit_cost_minor bigint NOT NULL,
    CONSTRAINT stock_delivery_line_quantity_check CHECK ((quantity > 0)),
    CONSTRAINT stock_delivery_line_unit_cost_minor_check CHECK ((unit_cost_minor > 0))
);

--
-- Name: stock_movement; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_movement (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id text NOT NULL,
    store_id uuid NOT NULL,
    item_id uuid NOT NULL,
    quantity integer NOT NULL,
    kind text NOT NULL,
    value_minor bigint NOT NULL,
    reference text NOT NULL,
    source_id uuid,
    moved_by text,
    moved_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT stock_movement_kind_check CHECK ((kind = ANY (ARRAY['opening'::text, 'receive'::text, 'sell'::text, 'count'::text]))),
    CONSTRAINT stock_movement_quantity_check CHECK ((quantity <> 0)),
    CONSTRAINT stock_movement_reference_check CHECK ((char_length(btrim(reference)) > 0))
);

--
-- Name: store; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id text NOT NULL,
    campus_id text NOT NULL,
    name text NOT NULL,
    retired_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT store_name_check CHECK (((char_length(btrim(name)) >= 1) AND (char_length(btrim(name)) <= 160)))
);

--
-- Name: store_sale; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store_sale (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id text NOT NULL,
    number text NOT NULL,
    reference text NOT NULL,
    request_hash text NOT NULL,
    store_id uuid NOT NULL,
    student_id uuid NOT NULL,
    invoice_id uuid NOT NULL,
    payment_id uuid NOT NULL,
    sold_by text,
    sold_on date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT store_sale_number_check CHECK ((char_length(btrim(number)) > 0)),
    CONSTRAINT store_sale_reference_check CHECK (((char_length(btrim(reference)) >= 1) AND (char_length(btrim(reference)) <= 80)))
);

--
-- Name: store_sale_line; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store_sale_line (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id text NOT NULL,
    store_sale_id uuid NOT NULL,
    item_id uuid NOT NULL,
    quantity integer NOT NULL,
    unit_price_minor bigint NOT NULL,
    cost_minor bigint NOT NULL,
    CONSTRAINT store_sale_line_cost_minor_check CHECK ((cost_minor >= 0)),
    CONSTRAINT store_sale_line_quantity_check CHECK ((quantity > 0)),
    CONSTRAINT store_sale_line_unit_price_minor_check CHECK ((unit_price_minor > 0))
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
-- Name: student_discount; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_discount (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id text NOT NULL,
    student_id uuid NOT NULL,
    kind text NOT NULL,
    value bigint NOT NULL,
    ledger_account_id uuid,
    reason text NOT NULL,
    from_term_id uuid NOT NULL,
    to_term_id uuid,
    status text DEFAULT 'submitted'::text NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    approved_by text,
    approved_at timestamp with time zone,
    rejected_by text,
    rejected_at timestamp with time zone,
    rejection_reason text,
    ended_at timestamp with time zone,
    ended_by text,
    CONSTRAINT student_discount_approved_columns CHECK (((status = 'approved'::text) = (approved_at IS NOT NULL))),
    CONSTRAINT student_discount_approved_not_self CHECK (((approved_by IS NULL) OR (approved_by <> created_by))),
    CONSTRAINT student_discount_kind_check CHECK ((kind = ANY (ARRAY['percent'::text, 'fixed'::text]))),
    CONSTRAINT student_discount_percent_range CHECK (((kind <> 'percent'::text) OR (value <= 100))),
    CONSTRAINT student_discount_reason_check CHECK (((char_length(btrim(reason)) >= 1) AND (char_length(btrim(reason)) <= 200))),
    CONSTRAINT student_discount_rejected_columns CHECK (((status = 'rejected'::text) = ((rejected_at IS NOT NULL) AND (rejected_by IS NOT NULL) AND (rejection_reason IS NOT NULL)))),
    CONSTRAINT student_discount_rejected_not_self CHECK (((rejected_by IS NULL) OR (rejected_by <> created_by))),
    CONSTRAINT student_discount_rejection_reason_check CHECK (((char_length(btrim(rejection_reason)) >= 1) AND (char_length(btrim(rejection_reason)) <= 500))),
    CONSTRAINT student_discount_status_check CHECK ((status = ANY (ARRAY['submitted'::text, 'approved'::text, 'rejected'::text]))),
    CONSTRAINT student_discount_value_positive CHECK ((value > 0))
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
-- Name: student_fee_option; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_fee_option (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id text NOT NULL,
    enrollment_id uuid NOT NULL,
    ledger_account_id uuid NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: student_subject; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_subject (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id text NOT NULL,
    enrollment_id uuid NOT NULL,
    subject_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: subject; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subject (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id text NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    retired_at timestamp with time zone,
    retired_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT subject_code_check CHECK ((code ~ '^[A-Z]{1,5}$'::text)),
    CONSTRAINT subject_name_check CHECK (((char_length(btrim(name)) >= 1) AND (char_length(btrim(name)) <= 80)))
);

--
-- Name: subject_teacher; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subject_teacher (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id text NOT NULL,
    class_arm_id uuid NOT NULL,
    subject_id uuid NOT NULL,
    term_id uuid NOT NULL,
    user_id text NOT NULL,
    assigned_by text,
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
-- Name: adjustment adjustment_id_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adjustment
    ADD CONSTRAINT adjustment_id_organization_id_key UNIQUE (id, organization_id);

--
-- Name: adjustment adjustment_organization_id_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adjustment
    ADD CONSTRAINT adjustment_organization_id_number_key UNIQUE (organization_id, number);

--
-- Name: adjustment adjustment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adjustment
    ADD CONSTRAINT adjustment_pkey PRIMARY KEY (id);

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
-- Name: billing_run billing_run_id_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_run
    ADD CONSTRAINT billing_run_id_organization_id_key UNIQUE (id, organization_id);

--
-- Name: billing_run billing_run_organization_id_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_run
    ADD CONSTRAINT billing_run_organization_id_number_key UNIQUE (organization_id, number);

--
-- Name: billing_run billing_run_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_run
    ADD CONSTRAINT billing_run_pkey PRIMARY KEY (id);

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
-- Name: fee_line fee_line_id_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_line
    ADD CONSTRAINT fee_line_id_organization_id_key UNIQUE (id, organization_id);

--
-- Name: fee_line fee_line_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_line
    ADD CONSTRAINT fee_line_pkey PRIMARY KEY (id);

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
-- Name: invoice invoice_id_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice
    ADD CONSTRAINT invoice_id_organization_id_key UNIQUE (id, organization_id);

--
-- Name: invoice_line invoice_line_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_line
    ADD CONSTRAINT invoice_line_pkey PRIMARY KEY (id);

--
-- Name: invoice invoice_organization_id_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice
    ADD CONSTRAINT invoice_organization_id_number_key UNIQUE (organization_id, number);

--
-- Name: invoice invoice_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice
    ADD CONSTRAINT invoice_pkey PRIMARY KEY (id);

--
-- Name: item item_id_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item
    ADD CONSTRAINT item_id_organization_id_key UNIQUE (id, organization_id);

--
-- Name: item item_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item
    ADD CONSTRAINT item_pkey PRIMARY KEY (id);

--
-- Name: item_price_change item_price_change_id_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_price_change
    ADD CONSTRAINT item_price_change_id_organization_id_key UNIQUE (id, organization_id);

--
-- Name: item_price_change item_price_change_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_price_change
    ADD CONSTRAINT item_price_change_pkey PRIMARY KEY (id);

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
-- Name: level_subject level_subject_id_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.level_subject
    ADD CONSTRAINT level_subject_id_organization_id_key UNIQUE (id, organization_id);

--
-- Name: level_subject level_subject_level_subject_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.level_subject
    ADD CONSTRAINT level_subject_level_subject_key UNIQUE (class_level_id, subject_id);

--
-- Name: level_subject level_subject_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.level_subject
    ADD CONSTRAINT level_subject_pkey PRIMARY KEY (id);

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
-- Name: payment_allocation payment_allocation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_allocation
    ADD CONSTRAINT payment_allocation_pkey PRIMARY KEY (payment_id, student_id);

--
-- Name: payment payment_id_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT payment_id_organization_id_key UNIQUE (id, organization_id);

--
-- Name: payment payment_organization_id_receipt_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT payment_organization_id_receipt_number_key UNIQUE (organization_id, receipt_number);

--
-- Name: payment payment_organization_id_reference_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT payment_organization_id_reference_key UNIQUE (organization_id, reference);

--
-- Name: payment payment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT payment_pkey PRIMARY KEY (id);

--
-- Name: payment_void payment_void_id_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_void
    ADD CONSTRAINT payment_void_id_organization_id_key UNIQUE (id, organization_id);

--
-- Name: payment_void payment_void_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_void
    ADD CONSTRAINT payment_void_pkey PRIMARY KEY (id);

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
-- Name: staff_leave staff_leave_id_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_leave
    ADD CONSTRAINT staff_leave_id_organization_id_key UNIQUE (id, organization_id);

--
-- Name: staff_leave staff_leave_no_overlap; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_leave
    ADD CONSTRAINT staff_leave_no_overlap EXCLUDE USING gist (organization_id WITH =, created_by WITH =, daterange(starts_on, ends_on, '[]'::text) WITH &&) WHERE ((status = ANY (ARRAY['submitted'::text, 'approved'::text])));

--
-- Name: staff_leave staff_leave_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_leave
    ADD CONSTRAINT staff_leave_pkey PRIMARY KEY (id);

--
-- Name: stock_count stock_count_id_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_count
    ADD CONSTRAINT stock_count_id_organization_id_key UNIQUE (id, organization_id);

--
-- Name: stock_count_line stock_count_line_id_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_count_line
    ADD CONSTRAINT stock_count_line_id_organization_id_key UNIQUE (id, organization_id);

--
-- Name: stock_count_line stock_count_line_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_count_line
    ADD CONSTRAINT stock_count_line_pkey PRIMARY KEY (id);

--
-- Name: stock_count_line stock_count_line_stock_count_id_item_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_count_line
    ADD CONSTRAINT stock_count_line_stock_count_id_item_id_key UNIQUE (stock_count_id, item_id);

--
-- Name: stock_count stock_count_organization_id_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_count
    ADD CONSTRAINT stock_count_organization_id_number_key UNIQUE (organization_id, number);

--
-- Name: stock_count stock_count_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_count
    ADD CONSTRAINT stock_count_pkey PRIMARY KEY (id);

--
-- Name: stock_delivery stock_delivery_id_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_delivery
    ADD CONSTRAINT stock_delivery_id_organization_id_key UNIQUE (id, organization_id);

--
-- Name: stock_delivery_line stock_delivery_line_id_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_delivery_line
    ADD CONSTRAINT stock_delivery_line_id_organization_id_key UNIQUE (id, organization_id);

--
-- Name: stock_delivery_line stock_delivery_line_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_delivery_line
    ADD CONSTRAINT stock_delivery_line_pkey PRIMARY KEY (id);

--
-- Name: stock_delivery_line stock_delivery_line_stock_delivery_id_item_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_delivery_line
    ADD CONSTRAINT stock_delivery_line_stock_delivery_id_item_id_key UNIQUE (stock_delivery_id, item_id);

--
-- Name: stock_delivery stock_delivery_organization_id_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_delivery
    ADD CONSTRAINT stock_delivery_organization_id_number_key UNIQUE (organization_id, number);

--
-- Name: stock_delivery stock_delivery_organization_id_reference_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_delivery
    ADD CONSTRAINT stock_delivery_organization_id_reference_key UNIQUE (organization_id, reference);

--
-- Name: stock_delivery stock_delivery_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_delivery
    ADD CONSTRAINT stock_delivery_pkey PRIMARY KEY (id);

--
-- Name: stock_movement stock_movement_id_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movement
    ADD CONSTRAINT stock_movement_id_organization_id_key UNIQUE (id, organization_id);

--
-- Name: stock_movement stock_movement_organization_id_reference_store_id_item_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movement
    ADD CONSTRAINT stock_movement_organization_id_reference_store_id_item_id_key UNIQUE (organization_id, reference, store_id, item_id);

--
-- Name: stock_movement stock_movement_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movement
    ADD CONSTRAINT stock_movement_pkey PRIMARY KEY (id);

--
-- Name: store store_campus_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store
    ADD CONSTRAINT store_campus_id_key UNIQUE (campus_id);

--
-- Name: store store_campus_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store
    ADD CONSTRAINT store_campus_id_name_key UNIQUE (campus_id, name);

--
-- Name: store store_id_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store
    ADD CONSTRAINT store_id_organization_id_key UNIQUE (id, organization_id);

--
-- Name: store store_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store
    ADD CONSTRAINT store_pkey PRIMARY KEY (id);

--
-- Name: store_sale store_sale_id_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_sale
    ADD CONSTRAINT store_sale_id_organization_id_key UNIQUE (id, organization_id);

--
-- Name: store_sale_line store_sale_line_id_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_sale_line
    ADD CONSTRAINT store_sale_line_id_organization_id_key UNIQUE (id, organization_id);

--
-- Name: store_sale_line store_sale_line_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_sale_line
    ADD CONSTRAINT store_sale_line_pkey PRIMARY KEY (id);

--
-- Name: store_sale_line store_sale_line_store_sale_id_item_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_sale_line
    ADD CONSTRAINT store_sale_line_store_sale_id_item_id_key UNIQUE (store_sale_id, item_id);

--
-- Name: store_sale store_sale_organization_id_invoice_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_sale
    ADD CONSTRAINT store_sale_organization_id_invoice_id_key UNIQUE (organization_id, invoice_id);

--
-- Name: store_sale store_sale_organization_id_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_sale
    ADD CONSTRAINT store_sale_organization_id_number_key UNIQUE (organization_id, number);

--
-- Name: store_sale store_sale_organization_id_payment_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_sale
    ADD CONSTRAINT store_sale_organization_id_payment_id_key UNIQUE (organization_id, payment_id);

--
-- Name: store_sale store_sale_organization_id_reference_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_sale
    ADD CONSTRAINT store_sale_organization_id_reference_key UNIQUE (organization_id, reference);

--
-- Name: store_sale store_sale_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_sale
    ADD CONSTRAINT store_sale_pkey PRIMARY KEY (id);

--
-- Name: student_discount student_discount_id_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_discount
    ADD CONSTRAINT student_discount_id_organization_id_key UNIQUE (id, organization_id);

--
-- Name: student_discount student_discount_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_discount
    ADD CONSTRAINT student_discount_pkey PRIMARY KEY (id);

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
-- Name: student_fee_option student_fee_option_enrollment_account_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_fee_option
    ADD CONSTRAINT student_fee_option_enrollment_account_key UNIQUE (enrollment_id, ledger_account_id);

--
-- Name: student_fee_option student_fee_option_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_fee_option
    ADD CONSTRAINT student_fee_option_pkey PRIMARY KEY (id);

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
-- Name: student_subject student_subject_enrollment_subject_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_subject
    ADD CONSTRAINT student_subject_enrollment_subject_key UNIQUE (enrollment_id, subject_id);

--
-- Name: student_subject student_subject_id_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_subject
    ADD CONSTRAINT student_subject_id_organization_id_key UNIQUE (id, organization_id);

--
-- Name: student_subject student_subject_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_subject
    ADD CONSTRAINT student_subject_pkey PRIMARY KEY (id);

--
-- Name: subject subject_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subject
    ADD CONSTRAINT subject_code_unique UNIQUE (organization_id, code);

--
-- Name: subject subject_id_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subject
    ADD CONSTRAINT subject_id_organization_id_key UNIQUE (id, organization_id);

--
-- Name: subject subject_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subject
    ADD CONSTRAINT subject_pkey PRIMARY KEY (id);

--
-- Name: subject_teacher subject_teacher_arm_subject_term_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subject_teacher
    ADD CONSTRAINT subject_teacher_arm_subject_term_key UNIQUE (class_arm_id, subject_id, term_id);

--
-- Name: subject_teacher subject_teacher_id_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subject_teacher
    ADD CONSTRAINT subject_teacher_id_organization_id_key UNIQUE (id, organization_id);

--
-- Name: subject_teacher subject_teacher_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subject_teacher
    ADD CONSTRAINT subject_teacher_pkey PRIMARY KEY (id);

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
-- Name: adjustment_invoice_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adjustment_invoice_idx ON public.adjustment USING btree (organization_id, invoice_id);

--
-- Name: adjustment_journal_entry_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX adjustment_journal_entry_key ON public.adjustment USING btree (journal_entry_id) WHERE (journal_entry_id IS NOT NULL);

--
-- Name: adjustment_ledger_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adjustment_ledger_account_idx ON public.adjustment USING btree (organization_id, ledger_account_id);

--
-- Name: adjustment_listing_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adjustment_listing_idx ON public.adjustment USING btree (organization_id, created_at DESC);

--
-- Name: adjustment_money_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adjustment_money_account_idx ON public.adjustment USING btree (organization_id, money_account_id);

--
-- Name: adjustment_student_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adjustment_student_idx ON public.adjustment USING btree (organization_id, student_id, status);

--
-- Name: adjustment_waiting_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX adjustment_waiting_idx ON public.adjustment USING btree (organization_id, status) WHERE (status = 'submitted'::text);

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
-- Name: billing_run_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX billing_run_created_idx ON public.billing_run USING btree (organization_id, created_at DESC);

--
-- Name: billing_run_scope_campus_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX billing_run_scope_campus_idx ON public.billing_run USING btree (organization_id, scope_campus_id);

--
-- Name: billing_run_term_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX billing_run_term_idx ON public.billing_run USING btree (organization_id, term_id);

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
-- Name: fee_line_campus_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fee_line_campus_idx ON public.fee_line USING btree (organization_id, campus_id);

--
-- Name: fee_line_ledger_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fee_line_ledger_account_idx ON public.fee_line USING btree (organization_id, ledger_account_id);

--
-- Name: fee_line_live_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX fee_line_live_key ON public.fee_line USING btree (organization_id, term_id, class_level_id, ledger_account_id, COALESCE(campus_id, ''::text)) WHERE (retired_at IS NULL);

--
-- Name: fee_line_term_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fee_line_term_idx ON public.fee_line USING btree (organization_id, term_id, class_level_id);

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
-- Name: invoice_campus_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoice_campus_idx ON public.invoice USING btree (organization_id, campus_id);

--
-- Name: invoice_journal_entry_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX invoice_journal_entry_key ON public.invoice USING btree (journal_entry_id) WHERE (journal_entry_id IS NOT NULL);

--
-- Name: invoice_line_discount_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoice_line_discount_idx ON public.invoice_line USING btree (organization_id, student_discount_id);

--
-- Name: invoice_line_fee_line_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoice_line_fee_line_idx ON public.invoice_line USING btree (organization_id, fee_line_id);

--
-- Name: invoice_line_invoice_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoice_line_invoice_idx ON public.invoice_line USING btree (organization_id, invoice_id);

--
-- Name: invoice_run_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoice_run_idx ON public.invoice USING btree (organization_id, billing_run_id);

--
-- Name: invoice_student_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoice_student_idx ON public.invoice USING btree (organization_id, student_id, created_at DESC);

--
-- Name: invoice_term_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoice_term_idx ON public.invoice USING btree (organization_id, term_id, status);

--
-- Name: invoice_term_student_live_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX invoice_term_student_live_key ON public.invoice USING btree (student_id, term_id) WHERE ((kind = 'term'::text) AND (status <> 'cancelled'::text));

--
-- Name: item_active_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX item_active_key ON public.item USING btree (organization_id, kind, name, variant, class_level_id) NULLS NOT DISTINCT WHERE (retired_at IS NULL);

--
-- Name: item_listing_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX item_listing_idx ON public.item USING btree (organization_id, kind, name);

--
-- Name: item_price_change_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX item_price_change_item_idx ON public.item_price_change USING btree (organization_id, item_id, created_at DESC);

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

CREATE INDEX journal_line_account_student_idx ON public.journal_line USING btree (organization_id, ledger_account_id, student_id) INCLUDE (debit_minor, credit_minor);

--
-- Name: journal_line_entry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX journal_line_entry_idx ON public.journal_line USING btree (entry_id);

--
-- Name: ledger_account_sibling_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ledger_account_sibling_name_key ON public.ledger_account USING btree (organization_id, parent_id, lower(name)) NULLS NOT DISTINCT;

--
-- Name: level_subject_subject_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX level_subject_subject_idx ON public.level_subject USING btree (organization_id, subject_id);

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
-- Name: payment_allocation_student_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payment_allocation_student_idx ON public.payment_allocation USING btree (organization_id, student_id);

--
-- Name: payment_journal_entry_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX payment_journal_entry_key ON public.payment USING btree (journal_entry_id);

--
-- Name: payment_listing_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payment_listing_idx ON public.payment USING btree (organization_id, paid_on DESC, created_at DESC);

--
-- Name: payment_payer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payment_payer_idx ON public.payment USING btree (organization_id, payer_guardian_id);

--
-- Name: payment_proof_file_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX payment_proof_file_key ON public.payment USING btree (proof_file_id) WHERE (proof_file_id IS NOT NULL);

--
-- Name: payment_provider_reference_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX payment_provider_reference_key ON public.payment USING btree (organization_id, provider_reference) WHERE (provider_reference IS NOT NULL);

--
-- Name: payment_void_journal_entry_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX payment_void_journal_entry_key ON public.payment_void USING btree (journal_entry_id) WHERE (journal_entry_id IS NOT NULL);

--
-- Name: payment_void_listing_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payment_void_listing_idx ON public.payment_void USING btree (organization_id, created_at DESC);

--
-- Name: payment_void_open_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX payment_void_open_key ON public.payment_void USING btree (payment_id) WHERE (status = ANY (ARRAY['submitted'::text, 'approved'::text]));

--
-- Name: payment_void_waiting_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payment_void_waiting_idx ON public.payment_void USING btree (organization_id, status) WHERE (status = 'submitted'::text);

--
-- Name: session_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "session_userId_idx" ON public.session USING btree ("userId");

--
-- Name: staff_leave_requester_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_leave_requester_idx ON public.staff_leave USING btree (organization_id, created_by, starts_on);

--
-- Name: staff_leave_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX staff_leave_status_idx ON public.staff_leave USING btree (organization_id, status);

--
-- Name: stock_count_journal_entry_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX stock_count_journal_entry_key ON public.stock_count USING btree (journal_entry_id) WHERE (journal_entry_id IS NOT NULL);

--
-- Name: stock_count_line_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_count_line_item_idx ON public.stock_count_line USING btree (organization_id, item_id);

--
-- Name: stock_count_listing_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_count_listing_idx ON public.stock_count USING btree (organization_id, created_at DESC);

--
-- Name: stock_count_waiting_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_count_waiting_idx ON public.stock_count USING btree (organization_id, status) WHERE (status = 'submitted'::text);

--
-- Name: stock_count_waiting_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX stock_count_waiting_key ON public.stock_count USING btree (store_id) WHERE (status = 'submitted'::text);

--
-- Name: stock_delivery_journal_entry_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX stock_delivery_journal_entry_key ON public.stock_delivery USING btree (journal_entry_id);

--
-- Name: stock_delivery_line_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_delivery_line_item_idx ON public.stock_delivery_line USING btree (organization_id, item_id);

--
-- Name: stock_delivery_listing_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_delivery_listing_idx ON public.stock_delivery USING btree (organization_id, received_on DESC, created_at DESC);

--
-- Name: stock_delivery_opening_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX stock_delivery_opening_key ON public.stock_delivery USING btree (store_id) WHERE is_opening;

--
-- Name: stock_movement_stock_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_movement_stock_idx ON public.stock_movement USING btree (organization_id, store_id, item_id);

--
-- Name: store_sale_line_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX store_sale_line_item_idx ON public.store_sale_line USING btree (organization_id, item_id);

--
-- Name: store_sale_store_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX store_sale_store_idx ON public.store_sale USING btree (organization_id, store_id, sold_on);

--
-- Name: store_sale_student_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX store_sale_student_idx ON public.store_sale USING btree (organization_id, student_id);

--
-- Name: student_discount_ledger_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX student_discount_ledger_account_idx ON public.student_discount USING btree (organization_id, ledger_account_id);

--
-- Name: student_discount_student_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX student_discount_student_idx ON public.student_discount USING btree (organization_id, student_id, status);

--
-- Name: student_discount_waiting_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX student_discount_waiting_idx ON public.student_discount USING btree (organization_id, status) WHERE (status = 'submitted'::text);

--
-- Name: student_duplicate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX student_duplicate_idx ON public.student USING btree (organization_id, lower(last_name), lower(first_name), date_of_birth);

--
-- Name: student_enrollment_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX student_enrollment_session_idx ON public.student_enrollment USING btree (organization_id, session_id);

--
-- Name: student_fee_option_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX student_fee_option_org_idx ON public.student_fee_option USING btree (organization_id, ledger_account_id);

--
-- Name: student_organization_campus_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX student_organization_campus_idx ON public.student USING btree (organization_id, campus_id);

--
-- Name: student_organization_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX student_organization_name_idx ON public.student USING btree (organization_id, last_name, first_name);

--
-- Name: student_subject_subject_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX student_subject_subject_idx ON public.student_subject USING btree (organization_id, subject_id);

--
-- Name: subject_teacher_arm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subject_teacher_arm_idx ON public.subject_teacher USING btree (organization_id, class_arm_id, term_id);

--
-- Name: subject_teacher_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subject_teacher_scope_idx ON public.subject_teacher USING btree (organization_id, term_id, user_id);

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
-- Name: adjustment adjustment_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER adjustment_immutable BEFORE DELETE OR UPDATE ON public.adjustment FOR EACH ROW EXECUTE FUNCTION public.approval_record_immutable();

--
-- Name: audit_log audit_log_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_log_append_only BEFORE DELETE OR UPDATE ON public.audit_log FOR EACH ROW EXECUTE FUNCTION public.audit_log_refuse_change();

--
-- Name: fee_line fee_line_fee_income_child; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER fee_line_fee_income_child BEFORE INSERT ON public.fee_line FOR EACH ROW EXECUTE FUNCTION public.fee_line_fee_income_child();

--
-- Name: invoice invoice_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER invoice_immutable BEFORE DELETE OR UPDATE ON public.invoice FOR EACH ROW EXECUTE FUNCTION public.invoice_immutable();

--
-- Name: invoice_line invoice_line_draft_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER invoice_line_draft_only BEFORE INSERT OR DELETE OR UPDATE ON public.invoice_line FOR EACH ROW EXECUTE FUNCTION public.invoice_line_draft_only();

--
-- Name: item item_never_deleted; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER item_never_deleted BEFORE DELETE ON public.item FOR EACH ROW EXECUTE FUNCTION public.item_never_deleted();

--
-- Name: item_price_change item_price_change_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER item_price_change_append_only BEFORE DELETE OR UPDATE ON public.item_price_change FOR EACH ROW EXECUTE FUNCTION public.item_price_change_append_only();

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
-- Name: payment_allocation payment_allocation_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER payment_allocation_immutable BEFORE DELETE OR UPDATE ON public.payment_allocation FOR EACH ROW EXECUTE FUNCTION public.payment_allocation_immutable();

--
-- Name: payment payment_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER payment_immutable BEFORE DELETE OR UPDATE ON public.payment FOR EACH ROW EXECUTE FUNCTION public.payment_immutable();

--
-- Name: payment payment_store_sale_stays_posted; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER payment_store_sale_stays_posted BEFORE UPDATE ON public.payment FOR EACH ROW EXECUTE FUNCTION public.payment_store_sale_stays_posted();

--
-- Name: payment_void payment_void_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER payment_void_immutable BEFORE DELETE OR UPDATE ON public.payment_void FOR EACH ROW EXECUTE FUNCTION public.approval_record_immutable();

--
-- Name: staff_leave staff_leave_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER staff_leave_immutable BEFORE DELETE OR UPDATE ON public.staff_leave FOR EACH ROW EXECUTE FUNCTION public.approval_record_immutable();

--
-- Name: stock_count stock_count_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER stock_count_immutable BEFORE DELETE OR UPDATE ON public.stock_count FOR EACH ROW EXECUTE FUNCTION public.approval_record_immutable();

--
-- Name: stock_count_line stock_count_line_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER stock_count_line_append_only BEFORE DELETE OR UPDATE ON public.stock_count_line FOR EACH ROW EXECUTE FUNCTION public.store_record_append_only();

--
-- Name: stock_count stock_count_not_empty; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER stock_count_not_empty AFTER INSERT ON public.stock_count DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.stock_count_not_empty();

--
-- Name: stock_delivery stock_delivery_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER stock_delivery_append_only BEFORE DELETE OR UPDATE ON public.stock_delivery FOR EACH ROW EXECUTE FUNCTION public.store_record_append_only();

--
-- Name: stock_delivery_line stock_delivery_line_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER stock_delivery_line_append_only BEFORE DELETE OR UPDATE ON public.stock_delivery_line FOR EACH ROW EXECUTE FUNCTION public.store_record_append_only();

--
-- Name: stock_delivery stock_delivery_not_empty; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER stock_delivery_not_empty AFTER INSERT ON public.stock_delivery DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.stock_delivery_not_empty();

--
-- Name: stock_movement stock_movement_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER stock_movement_append_only BEFORE DELETE OR UPDATE ON public.stock_movement FOR EACH ROW EXECUTE FUNCTION public.stock_movement_append_only();

--
-- Name: store_sale store_sale_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER store_sale_append_only BEFORE DELETE OR UPDATE ON public.store_sale FOR EACH ROW EXECUTE FUNCTION public.store_record_append_only();

--
-- Name: store_sale_line store_sale_line_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER store_sale_line_append_only BEFORE DELETE OR UPDATE ON public.store_sale_line FOR EACH ROW EXECUTE FUNCTION public.store_record_append_only();

--
-- Name: store_sale store_sale_not_empty; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER store_sale_not_empty AFTER INSERT ON public.store_sale DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.store_sale_not_empty();

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
-- Name: adjustment adjustment_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adjustment
    ADD CONSTRAINT adjustment_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public."user"(id) ON DELETE SET NULL;

--
-- Name: adjustment adjustment_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adjustment
    ADD CONSTRAINT adjustment_created_by_fkey FOREIGN KEY (created_by) REFERENCES public."user"(id) ON DELETE SET NULL;

--
-- Name: adjustment adjustment_invoice_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adjustment
    ADD CONSTRAINT adjustment_invoice_id_organization_id_fkey FOREIGN KEY (invoice_id, organization_id) REFERENCES public.invoice(id, organization_id) ON DELETE RESTRICT;

--
-- Name: adjustment adjustment_journal_entry_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adjustment
    ADD CONSTRAINT adjustment_journal_entry_id_organization_id_fkey FOREIGN KEY (journal_entry_id, organization_id) REFERENCES public.journal_entry(id, organization_id) ON DELETE RESTRICT;

--
-- Name: adjustment adjustment_ledger_account_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adjustment
    ADD CONSTRAINT adjustment_ledger_account_id_organization_id_fkey FOREIGN KEY (ledger_account_id, organization_id) REFERENCES public.ledger_account(id, organization_id) ON DELETE RESTRICT;

--
-- Name: adjustment adjustment_money_account_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adjustment
    ADD CONSTRAINT adjustment_money_account_id_organization_id_fkey FOREIGN KEY (money_account_id, organization_id) REFERENCES public.money_account(id, organization_id) ON DELETE RESTRICT;

--
-- Name: adjustment adjustment_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adjustment
    ADD CONSTRAINT adjustment_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE RESTRICT;

--
-- Name: adjustment adjustment_rejected_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adjustment
    ADD CONSTRAINT adjustment_rejected_by_fkey FOREIGN KEY (rejected_by) REFERENCES public."user"(id) ON DELETE SET NULL;

--
-- Name: adjustment adjustment_student_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adjustment
    ADD CONSTRAINT adjustment_student_id_organization_id_fkey FOREIGN KEY (student_id, organization_id) REFERENCES public.student(id, organization_id) ON DELETE RESTRICT;

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
-- Name: billing_run billing_run_cancelled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_run
    ADD CONSTRAINT billing_run_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES public."user"(id) ON DELETE SET NULL;

--
-- Name: billing_run billing_run_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_run
    ADD CONSTRAINT billing_run_created_by_fkey FOREIGN KEY (created_by) REFERENCES public."user"(id) ON DELETE SET NULL;

--
-- Name: billing_run billing_run_issued_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_run
    ADD CONSTRAINT billing_run_issued_by_fkey FOREIGN KEY (issued_by) REFERENCES public."user"(id) ON DELETE SET NULL;

--
-- Name: billing_run billing_run_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_run
    ADD CONSTRAINT billing_run_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE RESTRICT;

--
-- Name: billing_run billing_run_scope_campus_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_run
    ADD CONSTRAINT billing_run_scope_campus_id_organization_id_fkey FOREIGN KEY (scope_campus_id, organization_id) REFERENCES public.campus(team_id, organization_id) ON DELETE RESTRICT;

--
-- Name: billing_run billing_run_scope_class_level_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_run
    ADD CONSTRAINT billing_run_scope_class_level_id_organization_id_fkey FOREIGN KEY (scope_class_level_id, organization_id) REFERENCES public.class_level(id, organization_id) ON DELETE RESTRICT;

--
-- Name: billing_run billing_run_term_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_run
    ADD CONSTRAINT billing_run_term_id_organization_id_fkey FOREIGN KEY (term_id, organization_id) REFERENCES public.term(id, organization_id) ON DELETE RESTRICT;

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
-- Name: fee_line fee_line_campus_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_line
    ADD CONSTRAINT fee_line_campus_id_organization_id_fkey FOREIGN KEY (campus_id, organization_id) REFERENCES public.campus(team_id, organization_id) ON DELETE RESTRICT;

--
-- Name: fee_line fee_line_class_level_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_line
    ADD CONSTRAINT fee_line_class_level_id_organization_id_fkey FOREIGN KEY (class_level_id, organization_id) REFERENCES public.class_level(id, organization_id) ON DELETE RESTRICT;

--
-- Name: fee_line fee_line_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_line
    ADD CONSTRAINT fee_line_created_by_fkey FOREIGN KEY (created_by) REFERENCES public."user"(id) ON DELETE SET NULL;

--
-- Name: fee_line fee_line_ledger_account_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_line
    ADD CONSTRAINT fee_line_ledger_account_id_organization_id_fkey FOREIGN KEY (ledger_account_id, organization_id) REFERENCES public.ledger_account(id, organization_id) ON DELETE RESTRICT;

--
-- Name: fee_line fee_line_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_line
    ADD CONSTRAINT fee_line_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE RESTRICT;

--
-- Name: fee_line fee_line_term_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_line
    ADD CONSTRAINT fee_line_term_id_organization_id_fkey FOREIGN KEY (term_id, organization_id) REFERENCES public.term(id, organization_id) ON DELETE RESTRICT;

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
-- Name: invoice invoice_billing_run_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice
    ADD CONSTRAINT invoice_billing_run_id_organization_id_fkey FOREIGN KEY (billing_run_id, organization_id) REFERENCES public.billing_run(id, organization_id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

--
-- Name: invoice invoice_campus_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice
    ADD CONSTRAINT invoice_campus_id_organization_id_fkey FOREIGN KEY (campus_id, organization_id) REFERENCES public.campus(team_id, organization_id) ON DELETE RESTRICT;

--
-- Name: invoice invoice_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice
    ADD CONSTRAINT invoice_created_by_fkey FOREIGN KEY (created_by) REFERENCES public."user"(id) ON DELETE SET NULL;

--
-- Name: invoice invoice_issued_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice
    ADD CONSTRAINT invoice_issued_by_fkey FOREIGN KEY (issued_by) REFERENCES public."user"(id) ON DELETE SET NULL;

--
-- Name: invoice invoice_journal_entry_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice
    ADD CONSTRAINT invoice_journal_entry_id_organization_id_fkey FOREIGN KEY (journal_entry_id, organization_id) REFERENCES public.journal_entry(id, organization_id) ON DELETE RESTRICT;

--
-- Name: invoice_line invoice_line_fee_line_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_line
    ADD CONSTRAINT invoice_line_fee_line_id_organization_id_fkey FOREIGN KEY (fee_line_id, organization_id) REFERENCES public.fee_line(id, organization_id) ON DELETE RESTRICT;

--
-- Name: invoice_line invoice_line_invoice_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_line
    ADD CONSTRAINT invoice_line_invoice_id_organization_id_fkey FOREIGN KEY (invoice_id, organization_id) REFERENCES public.invoice(id, organization_id) ON DELETE RESTRICT;

--
-- Name: invoice_line invoice_line_ledger_account_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_line
    ADD CONSTRAINT invoice_line_ledger_account_id_organization_id_fkey FOREIGN KEY (ledger_account_id, organization_id) REFERENCES public.ledger_account(id, organization_id) ON DELETE RESTRICT;

--
-- Name: invoice_line invoice_line_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_line
    ADD CONSTRAINT invoice_line_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE RESTRICT;

--
-- Name: invoice_line invoice_line_student_discount_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_line
    ADD CONSTRAINT invoice_line_student_discount_id_organization_id_fkey FOREIGN KEY (student_discount_id, organization_id) REFERENCES public.student_discount(id, organization_id) ON DELETE RESTRICT;

--
-- Name: invoice invoice_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice
    ADD CONSTRAINT invoice_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE RESTRICT;

--
-- Name: invoice invoice_student_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice
    ADD CONSTRAINT invoice_student_id_organization_id_fkey FOREIGN KEY (student_id, organization_id) REFERENCES public.student(id, organization_id) ON DELETE RESTRICT;

--
-- Name: invoice invoice_term_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice
    ADD CONSTRAINT invoice_term_id_organization_id_fkey FOREIGN KEY (term_id, organization_id) REFERENCES public.term(id, organization_id) ON DELETE RESTRICT;

--
-- Name: item item_class_level_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item
    ADD CONSTRAINT item_class_level_id_organization_id_fkey FOREIGN KEY (class_level_id, organization_id) REFERENCES public.class_level(id, organization_id);

--
-- Name: item item_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item
    ADD CONSTRAINT item_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;

--
-- Name: item_price_change item_price_change_item_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_price_change
    ADD CONSTRAINT item_price_change_item_id_organization_id_fkey FOREIGN KEY (item_id, organization_id) REFERENCES public.item(id, organization_id);

--
-- Name: item_price_change item_price_change_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_price_change
    ADD CONSTRAINT item_price_change_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;

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
-- Name: level_subject level_subject_class_level_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.level_subject
    ADD CONSTRAINT level_subject_class_level_id_organization_id_fkey FOREIGN KEY (class_level_id, organization_id) REFERENCES public.class_level(id, organization_id) ON DELETE RESTRICT;

--
-- Name: level_subject level_subject_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.level_subject
    ADD CONSTRAINT level_subject_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE RESTRICT;

--
-- Name: level_subject level_subject_subject_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.level_subject
    ADD CONSTRAINT level_subject_subject_id_organization_id_fkey FOREIGN KEY (subject_id, organization_id) REFERENCES public.subject(id, organization_id) ON DELETE RESTRICT;

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
-- Name: payment_allocation payment_allocation_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_allocation
    ADD CONSTRAINT payment_allocation_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE RESTRICT;

--
-- Name: payment_allocation payment_allocation_payment_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_allocation
    ADD CONSTRAINT payment_allocation_payment_id_organization_id_fkey FOREIGN KEY (payment_id, organization_id) REFERENCES public.payment(id, organization_id) ON DELETE RESTRICT;

--
-- Name: payment_allocation payment_allocation_student_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_allocation
    ADD CONSTRAINT payment_allocation_student_id_organization_id_fkey FOREIGN KEY (student_id, organization_id) REFERENCES public.student(id, organization_id) ON DELETE RESTRICT;

--
-- Name: payment payment_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT payment_created_by_fkey FOREIGN KEY (created_by) REFERENCES public."user"(id) ON DELETE SET NULL;

--
-- Name: payment payment_journal_entry_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT payment_journal_entry_id_organization_id_fkey FOREIGN KEY (journal_entry_id, organization_id) REFERENCES public.journal_entry(id, organization_id) ON DELETE RESTRICT;

--
-- Name: payment payment_money_account_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT payment_money_account_id_organization_id_fkey FOREIGN KEY (money_account_id, organization_id) REFERENCES public.money_account(id, organization_id) ON DELETE RESTRICT;

--
-- Name: payment payment_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT payment_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE RESTRICT;

--
-- Name: payment payment_payer_guardian_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT payment_payer_guardian_id_organization_id_fkey FOREIGN KEY (payer_guardian_id, organization_id) REFERENCES public.guardian(id, organization_id) ON DELETE RESTRICT;

--
-- Name: payment payment_proof_file_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT payment_proof_file_id_organization_id_fkey FOREIGN KEY (proof_file_id, organization_id) REFERENCES public.file_object(id, organization_id) ON DELETE RESTRICT;

--
-- Name: payment_void payment_void_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_void
    ADD CONSTRAINT payment_void_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public."user"(id) ON DELETE SET NULL;

--
-- Name: payment_void payment_void_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_void
    ADD CONSTRAINT payment_void_created_by_fkey FOREIGN KEY (created_by) REFERENCES public."user"(id) ON DELETE SET NULL;

--
-- Name: payment_void payment_void_journal_entry_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_void
    ADD CONSTRAINT payment_void_journal_entry_id_organization_id_fkey FOREIGN KEY (journal_entry_id, organization_id) REFERENCES public.journal_entry(id, organization_id) ON DELETE RESTRICT;

--
-- Name: payment_void payment_void_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_void
    ADD CONSTRAINT payment_void_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE RESTRICT;

--
-- Name: payment_void payment_void_payment_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_void
    ADD CONSTRAINT payment_void_payment_id_organization_id_fkey FOREIGN KEY (payment_id, organization_id) REFERENCES public.payment(id, organization_id) ON DELETE RESTRICT;

--
-- Name: payment_void payment_void_rejected_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_void
    ADD CONSTRAINT payment_void_rejected_by_fkey FOREIGN KEY (rejected_by) REFERENCES public."user"(id) ON DELETE SET NULL;

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
-- Name: staff_leave staff_leave_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_leave
    ADD CONSTRAINT staff_leave_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public."user"(id) ON DELETE RESTRICT;

--
-- Name: staff_leave staff_leave_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_leave
    ADD CONSTRAINT staff_leave_created_by_fkey FOREIGN KEY (created_by) REFERENCES public."user"(id) ON DELETE RESTRICT;

--
-- Name: staff_leave staff_leave_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_leave
    ADD CONSTRAINT staff_leave_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE RESTRICT;

--
-- Name: staff_leave staff_leave_rejected_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_leave
    ADD CONSTRAINT staff_leave_rejected_by_fkey FOREIGN KEY (rejected_by) REFERENCES public."user"(id) ON DELETE RESTRICT;

--
-- Name: stock_count stock_count_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_count
    ADD CONSTRAINT stock_count_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public."user"(id) ON DELETE SET NULL;

--
-- Name: stock_count stock_count_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_count
    ADD CONSTRAINT stock_count_created_by_fkey FOREIGN KEY (created_by) REFERENCES public."user"(id) ON DELETE SET NULL;

--
-- Name: stock_count stock_count_journal_entry_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_count
    ADD CONSTRAINT stock_count_journal_entry_id_organization_id_fkey FOREIGN KEY (journal_entry_id, organization_id) REFERENCES public.journal_entry(id, organization_id) ON DELETE RESTRICT;

--
-- Name: stock_count_line stock_count_line_item_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_count_line
    ADD CONSTRAINT stock_count_line_item_id_organization_id_fkey FOREIGN KEY (item_id, organization_id) REFERENCES public.item(id, organization_id) ON DELETE RESTRICT;

--
-- Name: stock_count_line stock_count_line_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_count_line
    ADD CONSTRAINT stock_count_line_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE RESTRICT;

--
-- Name: stock_count_line stock_count_line_stock_count_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_count_line
    ADD CONSTRAINT stock_count_line_stock_count_id_organization_id_fkey FOREIGN KEY (stock_count_id, organization_id) REFERENCES public.stock_count(id, organization_id) ON DELETE RESTRICT;

--
-- Name: stock_count stock_count_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_count
    ADD CONSTRAINT stock_count_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE RESTRICT;

--
-- Name: stock_count stock_count_rejected_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_count
    ADD CONSTRAINT stock_count_rejected_by_fkey FOREIGN KEY (rejected_by) REFERENCES public."user"(id) ON DELETE SET NULL;

--
-- Name: stock_count stock_count_store_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_count
    ADD CONSTRAINT stock_count_store_id_organization_id_fkey FOREIGN KEY (store_id, organization_id) REFERENCES public.store(id, organization_id) ON DELETE RESTRICT;

--
-- Name: stock_delivery stock_delivery_journal_entry_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_delivery
    ADD CONSTRAINT stock_delivery_journal_entry_id_organization_id_fkey FOREIGN KEY (journal_entry_id, organization_id) REFERENCES public.journal_entry(id, organization_id) ON DELETE RESTRICT;

--
-- Name: stock_delivery_line stock_delivery_line_item_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_delivery_line
    ADD CONSTRAINT stock_delivery_line_item_id_organization_id_fkey FOREIGN KEY (item_id, organization_id) REFERENCES public.item(id, organization_id) ON DELETE RESTRICT;

--
-- Name: stock_delivery_line stock_delivery_line_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_delivery_line
    ADD CONSTRAINT stock_delivery_line_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE RESTRICT;

--
-- Name: stock_delivery_line stock_delivery_line_stock_delivery_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_delivery_line
    ADD CONSTRAINT stock_delivery_line_stock_delivery_id_organization_id_fkey FOREIGN KEY (stock_delivery_id, organization_id) REFERENCES public.stock_delivery(id, organization_id) ON DELETE RESTRICT;

--
-- Name: stock_delivery stock_delivery_money_account_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_delivery
    ADD CONSTRAINT stock_delivery_money_account_id_organization_id_fkey FOREIGN KEY (money_account_id, organization_id) REFERENCES public.money_account(id, organization_id) ON DELETE RESTRICT;

--
-- Name: stock_delivery stock_delivery_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_delivery
    ADD CONSTRAINT stock_delivery_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE RESTRICT;

--
-- Name: stock_delivery stock_delivery_store_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_delivery
    ADD CONSTRAINT stock_delivery_store_id_organization_id_fkey FOREIGN KEY (store_id, organization_id) REFERENCES public.store(id, organization_id) ON DELETE RESTRICT;

--
-- Name: stock_movement stock_movement_item_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movement
    ADD CONSTRAINT stock_movement_item_id_organization_id_fkey FOREIGN KEY (item_id, organization_id) REFERENCES public.item(id, organization_id) ON DELETE RESTRICT;

--
-- Name: stock_movement stock_movement_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movement
    ADD CONSTRAINT stock_movement_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE RESTRICT;

--
-- Name: stock_movement stock_movement_store_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movement
    ADD CONSTRAINT stock_movement_store_id_organization_id_fkey FOREIGN KEY (store_id, organization_id) REFERENCES public.store(id, organization_id) ON DELETE RESTRICT;

--
-- Name: store store_campus_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store
    ADD CONSTRAINT store_campus_id_organization_id_fkey FOREIGN KEY (campus_id, organization_id) REFERENCES public.campus(team_id, organization_id) ON DELETE CASCADE;

--
-- Name: store store_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store
    ADD CONSTRAINT store_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;

--
-- Name: store_sale store_sale_invoice_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_sale
    ADD CONSTRAINT store_sale_invoice_id_organization_id_fkey FOREIGN KEY (invoice_id, organization_id) REFERENCES public.invoice(id, organization_id) ON DELETE RESTRICT;

--
-- Name: store_sale_line store_sale_line_item_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_sale_line
    ADD CONSTRAINT store_sale_line_item_id_organization_id_fkey FOREIGN KEY (item_id, organization_id) REFERENCES public.item(id, organization_id) ON DELETE RESTRICT;

--
-- Name: store_sale_line store_sale_line_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_sale_line
    ADD CONSTRAINT store_sale_line_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE RESTRICT;

--
-- Name: store_sale_line store_sale_line_store_sale_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_sale_line
    ADD CONSTRAINT store_sale_line_store_sale_id_organization_id_fkey FOREIGN KEY (store_sale_id, organization_id) REFERENCES public.store_sale(id, organization_id) ON DELETE RESTRICT;

--
-- Name: store_sale store_sale_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_sale
    ADD CONSTRAINT store_sale_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE RESTRICT;

--
-- Name: store_sale store_sale_payment_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_sale
    ADD CONSTRAINT store_sale_payment_id_organization_id_fkey FOREIGN KEY (payment_id, organization_id) REFERENCES public.payment(id, organization_id) ON DELETE RESTRICT;

--
-- Name: store_sale store_sale_sold_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_sale
    ADD CONSTRAINT store_sale_sold_by_fkey FOREIGN KEY (sold_by) REFERENCES public."user"(id) ON DELETE SET NULL;

--
-- Name: store_sale store_sale_store_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_sale
    ADD CONSTRAINT store_sale_store_id_organization_id_fkey FOREIGN KEY (store_id, organization_id) REFERENCES public.store(id, organization_id) ON DELETE RESTRICT;

--
-- Name: store_sale store_sale_student_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_sale
    ADD CONSTRAINT store_sale_student_id_organization_id_fkey FOREIGN KEY (student_id, organization_id) REFERENCES public.student(id, organization_id) ON DELETE RESTRICT;

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
-- Name: student_discount student_discount_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_discount
    ADD CONSTRAINT student_discount_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public."user"(id) ON DELETE SET NULL;

--
-- Name: student_discount student_discount_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_discount
    ADD CONSTRAINT student_discount_created_by_fkey FOREIGN KEY (created_by) REFERENCES public."user"(id) ON DELETE SET NULL;

--
-- Name: student_discount student_discount_ended_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_discount
    ADD CONSTRAINT student_discount_ended_by_fkey FOREIGN KEY (ended_by) REFERENCES public."user"(id) ON DELETE SET NULL;

--
-- Name: student_discount student_discount_from_term_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_discount
    ADD CONSTRAINT student_discount_from_term_id_organization_id_fkey FOREIGN KEY (from_term_id, organization_id) REFERENCES public.term(id, organization_id) ON DELETE RESTRICT;

--
-- Name: student_discount student_discount_ledger_account_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_discount
    ADD CONSTRAINT student_discount_ledger_account_id_organization_id_fkey FOREIGN KEY (ledger_account_id, organization_id) REFERENCES public.ledger_account(id, organization_id) ON DELETE RESTRICT;

--
-- Name: student_discount student_discount_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_discount
    ADD CONSTRAINT student_discount_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE RESTRICT;

--
-- Name: student_discount student_discount_rejected_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_discount
    ADD CONSTRAINT student_discount_rejected_by_fkey FOREIGN KEY (rejected_by) REFERENCES public."user"(id) ON DELETE SET NULL;

--
-- Name: student_discount student_discount_student_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_discount
    ADD CONSTRAINT student_discount_student_id_organization_id_fkey FOREIGN KEY (student_id, organization_id) REFERENCES public.student(id, organization_id) ON DELETE RESTRICT;

--
-- Name: student_discount student_discount_to_term_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_discount
    ADD CONSTRAINT student_discount_to_term_id_organization_id_fkey FOREIGN KEY (to_term_id, organization_id) REFERENCES public.term(id, organization_id) ON DELETE RESTRICT;

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
-- Name: student_fee_option student_fee_option_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_fee_option
    ADD CONSTRAINT student_fee_option_created_by_fkey FOREIGN KEY (created_by) REFERENCES public."user"(id) ON DELETE SET NULL;

--
-- Name: student_fee_option student_fee_option_enrollment_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_fee_option
    ADD CONSTRAINT student_fee_option_enrollment_id_organization_id_fkey FOREIGN KEY (enrollment_id, organization_id) REFERENCES public.student_enrollment(id, organization_id) ON DELETE RESTRICT;

--
-- Name: student_fee_option student_fee_option_ledger_account_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_fee_option
    ADD CONSTRAINT student_fee_option_ledger_account_id_organization_id_fkey FOREIGN KEY (ledger_account_id, organization_id) REFERENCES public.ledger_account(id, organization_id) ON DELETE RESTRICT;

--
-- Name: student_fee_option student_fee_option_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_fee_option
    ADD CONSTRAINT student_fee_option_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE RESTRICT;

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
-- Name: student_subject student_subject_enrollment_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_subject
    ADD CONSTRAINT student_subject_enrollment_id_organization_id_fkey FOREIGN KEY (enrollment_id, organization_id) REFERENCES public.student_enrollment(id, organization_id) ON DELETE RESTRICT;

--
-- Name: student_subject student_subject_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_subject
    ADD CONSTRAINT student_subject_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE RESTRICT;

--
-- Name: student_subject student_subject_subject_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_subject
    ADD CONSTRAINT student_subject_subject_id_organization_id_fkey FOREIGN KEY (subject_id, organization_id) REFERENCES public.subject(id, organization_id) ON DELETE RESTRICT;

--
-- Name: student student_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student
    ADD CONSTRAINT student_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE SET NULL;

--
-- Name: subject subject_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subject
    ADD CONSTRAINT subject_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE RESTRICT;

--
-- Name: subject subject_retired_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subject
    ADD CONSTRAINT subject_retired_by_fkey FOREIGN KEY (retired_by) REFERENCES public."user"(id) ON DELETE SET NULL;

--
-- Name: subject_teacher subject_teacher_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subject_teacher
    ADD CONSTRAINT subject_teacher_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public."user"(id) ON DELETE SET NULL;

--
-- Name: subject_teacher subject_teacher_class_arm_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subject_teacher
    ADD CONSTRAINT subject_teacher_class_arm_id_organization_id_fkey FOREIGN KEY (class_arm_id, organization_id) REFERENCES public.class_arm(id, organization_id) ON DELETE RESTRICT;

--
-- Name: subject_teacher subject_teacher_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subject_teacher
    ADD CONSTRAINT subject_teacher_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE RESTRICT;

--
-- Name: subject_teacher subject_teacher_subject_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subject_teacher
    ADD CONSTRAINT subject_teacher_subject_id_organization_id_fkey FOREIGN KEY (subject_id, organization_id) REFERENCES public.subject(id, organization_id) ON DELETE RESTRICT;

--
-- Name: subject_teacher subject_teacher_term_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subject_teacher
    ADD CONSTRAINT subject_teacher_term_id_organization_id_fkey FOREIGN KEY (term_id, organization_id) REFERENCES public.term(id, organization_id) ON DELETE RESTRICT;

--
-- Name: subject_teacher subject_teacher_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subject_teacher
    ADD CONSTRAINT subject_teacher_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;

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
    ('20261012090000'),
    ('20261013090000'),
    ('20261013090100'),
    ('20261013090200'),
    ('20261015090000'),
    ('20261016085900'),
    ('20261016090000'),
    ('20261016090100'),
    ('20261016090200'),
    ('20261016090300'),
    ('20261017090000'),
    ('20261017090100'),
    ('20261017090200'),
    ('20261017090300'),
    ('20261017100000'),
    ('20261017110000'),
    ('20261017110100');
