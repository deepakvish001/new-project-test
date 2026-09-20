-- Bakaya — PostgreSQL 16 schema
-- Money: BIGINT paise. Time: timestamptz, business logic in Asia/Kolkata.
-- Multi-tenant: org_id on every tenant table, enforced by RLS at the bottom.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- ─────────────────────────────────────────── enums

CREATE TYPE invoice_status   AS ENUM ('OPEN','PARTIALLY_PAID','PAID','DISPUTED','WRITTEN_OFF','ON_HOLD');
CREATE TYPE promise_status   AS ENUM ('PENDING','KEPT','BROKEN','SUPERSEDED');
CREATE TYPE dispute_status   AS ENUM ('OPEN','RESOLVED','ESCALATED');
CREATE TYPE message_status   AS ENUM ('QUEUED','SENT','DELIVERED','READ','FAILED');
CREATE TYPE inbound_intent   AS ENUM ('PROMISE_TO_PAY','ALREADY_PAID','DISPUTE','NEEDS_DOCUMENT',
                                      'PARTIAL_PAYMENT','WRONG_NUMBER','HOSTILE','UNCLEAR','OTHER');
CREATE TYPE legal_doc_kind   AS ENUM ('SEC_43BH_INTIMATION','MSMED_INTEREST_CLAIM',
                                      'SAMADHAAN_DRAFT','LEDGER_CONFIRMATION');
CREATE TYPE sync_source      AS ENUM ('TALLY_CONNECTOR','CSV_UPLOAD','GSTR1_IMPORT','MANUAL');
CREATE TYPE sync_status      AS ENUM ('RUNNING','SUCCESS','PARTIAL','FAILED');
CREATE TYPE ladder_tone      AS ENUM ('GENTLE','STANDARD','FIRM');
CREATE TYPE user_role        AS ENUM ('OWNER','ACCOUNTANT','CA_PARTNER','READONLY');

-- ─────────────────────────────────────────── tenant root

CREATE TABLE org (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name          TEXT NOT NULL,
  trade_name          TEXT,
  gstin               CHAR(15),
  udyam_number        TEXT,                    -- required for 43B(h)/MSMED escalation
  pan                 CHAR(10),
  address             JSONB NOT NULL DEFAULT '{}'::jsonb,
  letterhead_s3_key   TEXT,
  default_language    TEXT NOT NULL DEFAULT 'hi',   -- ISO 639-1: hi, gu, mr, ta, pa, en
  wa_phone_number_id  TEXT,                    -- Meta phone number id used for this org
  timezone            TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  ca_partner_id       UUID,                    -- referring CA, drives commission
  plan                TEXT NOT NULL DEFAULT 'STARTER',
  onboarded_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);
COMMENT ON COLUMN org.udyam_number IS
  'Without a valid Udyam registration the org is not a "micro or small enterprise" under '
  'MSMED s.2(n), so rungs 5-6 must stay disabled. Validate before enabling legal escalation.';

CREATE TABLE app_user (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  phone_e164    TEXT NOT NULL,
  email         CITEXT,
  role          user_role NOT NULL DEFAULT 'OWNER',
  receives_digest BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, phone_e164)
);

CREATE TABLE org_policy (
  org_id                 UUID PRIMARY KEY REFERENCES org(id) ON DELETE CASCADE,
  tone                   ladder_tone NOT NULL DEFAULT 'STANDARD',
  -- days relative to due_date at which each rung fires; NULL disables the rung
  rung_offsets_days      INTEGER[] NOT NULL DEFAULT ARRAY[-3, 0, 7, 15, 30, 45],
  max_auto_rung          SMALLINT NOT NULL DEFAULT 4,   -- rungs above this need approval
  -- IST hours during which we do NOT send. Two columns, not a range: the window wraps
  -- midnight (21:00 -> 09:00) and int4range cannot express lower > upper.
  quiet_start_hour_ist   SMALLINT NOT NULL DEFAULT 21 CHECK (quiet_start_hour_ist BETWEEN 0 AND 23),
  quiet_end_hour_ist     SMALLINT NOT NULL DEFAULT 9  CHECK (quiet_end_hour_ist BETWEEN 0 AND 23),
  send_on_weekends       BOOLEAN NOT NULL DEFAULT false,
  min_invoice_paise      BIGINT NOT NULL DEFAULT 100000, -- ignore under ₹1,000
  pause_on_hostile       BOOLEAN NOT NULL DEFAULT true,
  digest_hour_ist        SMALLINT NOT NULL DEFAULT 19,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON COLUMN org_policy.max_auto_rung IS
  'Hard product rule: legal rungs (5,6) never auto-fire. Enforced in code AND here.';

-- ─────────────────────────────────────────── buyers

CREATE TABLE buyer (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  legal_name        TEXT NOT NULL,
  normalised_name   TEXT NOT NULL,          -- lowercased, suffixes stripped, for dedupe
  gstin             CHAR(15),
  address           JSONB NOT NULL DEFAULT '{}'::jsonb,
  preferred_language TEXT,                  -- overrides org.default_language
  credit_days       SMALLINT NOT NULL DEFAULT 45,
  -- per-buyer escalation ceiling: e.g. never escalate the dominant OEM past rung 3
  max_rung_override SMALLINT,
  is_paused         BOOLEAN NOT NULL DEFAULT false,
  pause_reason      TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_buyer_gstin ON buyer (org_id, gstin) WHERE gstin IS NOT NULL;
CREATE INDEX idx_buyer_norm ON buyer (org_id, normalised_name);

-- every Tally ledger name we have ever seen mapped to this buyer
CREATE TABLE buyer_alias (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  buyer_id    UUID NOT NULL REFERENCES buyer(id) ON DELETE CASCADE,
  source      sync_source NOT NULL,
  raw_name    TEXT NOT NULL,
  UNIQUE (org_id, source, raw_name)
);

CREATE TABLE buyer_contact (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  buyer_id       UUID NOT NULL REFERENCES buyer(id) ON DELETE CASCADE,
  name           TEXT,
  designation    TEXT,                       -- 'Accounts', 'Proprietor', 'Purchase'
  whatsapp_e164  TEXT NOT NULL,
  is_primary     BOOLEAN NOT NULL DEFAULT false,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  opted_out_at   TIMESTAMPTZ,                -- STOP received; never message again
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, buyer_id, whatsapp_e164)
);
CREATE INDEX idx_contact_phone ON buyer_contact (whatsapp_e164) WHERE is_active;

-- ─────────────────────────────────────────── invoices

CREATE TABLE invoice (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  buyer_id           UUID NOT NULL REFERENCES buyer(id) ON DELETE RESTRICT,

  -- from the source system; Tally wins on conflict
  source_system      sync_source NOT NULL,
  external_ref       TEXT NOT NULL,          -- Tally voucher GUID
  source_hash        TEXT NOT NULL,          -- detect upstream edits cheaply
  invoice_number     TEXT NOT NULL,
  invoice_date       DATE NOT NULL,
  due_date           DATE NOT NULL,
  amount_paise       BIGINT NOT NULL CHECK (amount_paise > 0),
  paid_paise         BIGINT NOT NULL DEFAULT 0 CHECK (paid_paise >= 0),
  currency           CHAR(3) NOT NULL DEFAULT 'INR',
  pdf_s3_key         TEXT,

  -- ours; never overwritten by a sync
  status             invoice_status NOT NULL DEFAULT 'OPEN',
  current_rung       SMALLINT NOT NULL DEFAULT 0,
  next_action_at     TIMESTAMPTZ,
  ladder_paused_until TIMESTAMPTZ,
  legal_approved_at  TIMESTAMPTZ,            -- owner approval for rungs 5-6
  legal_approved_by  UUID REFERENCES app_user(id),

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, source_system, external_ref),
  CHECK (paid_paise <= amount_paise)
);
CREATE INDEX idx_invoice_next_action ON invoice (org_id, next_action_at)
  WHERE status IN ('OPEN','PARTIALLY_PAID');
CREATE INDEX idx_invoice_due ON invoice (org_id, due_date) WHERE status <> 'PAID';
CREATE INDEX idx_invoice_buyer ON invoice (org_id, buyer_id, status);

-- ─────────────────────────────────────────── collections state

CREATE TABLE promise (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  invoice_id    UUID NOT NULL REFERENCES invoice(id) ON DELETE CASCADE,
  promised_date DATE NOT NULL,
  promised_paise BIGINT,                     -- NULL = full outstanding
  status        promise_status NOT NULL DEFAULT 'PENDING',
  -- Which rung the ladder was on when this promise was made. The engine caps promise-
  -- driven pauses at two per rung; without this column a buyer can re-promise forever
  -- and the ladder never advances. See packages/ladder MAX_PROMISE_PAUSES_PER_RUNG.
  created_at_rung SMALLINT NOT NULL DEFAULT 0,
  source_message_id UUID,                    -- the inbound_message it came from
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at   TIMESTAMPTZ
);
CREATE INDEX idx_promise_open ON promise (org_id, promised_date) WHERE status = 'PENDING';

CREATE TABLE dispute (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  invoice_id    UUID NOT NULL REFERENCES invoice(id) ON DELETE CASCADE,
  reason        TEXT NOT NULL,
  disputed_paise BIGINT,
  status        dispute_status NOT NULL DEFAULT 'OPEN',
  raised_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at   TIMESTAMPTZ,
  resolution_note TEXT
);

CREATE TABLE payment (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  invoice_id      UUID NOT NULL REFERENCES invoice(id) ON DELETE CASCADE,
  amount_paise    BIGINT NOT NULL CHECK (amount_paise > 0),
  paid_at         TIMESTAMPTZ NOT NULL,
  method          TEXT,                      -- 'razorpay_link','neft','upi','cheque'
  provider_ref    TEXT,                      -- razorpay payment_id
  attributed      BOOLEAN NOT NULL DEFAULT false, -- collected via our link?
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, provider_ref)
);

-- ─────────────────────────────────────────── evidence (append-only)

CREATE TABLE ladder_event (
  id            BIGSERIAL PRIMARY KEY,
  org_id        UUID NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  invoice_id    UUID NOT NULL REFERENCES invoice(id) ON DELETE CASCADE,
  from_rung     SMALLINT NOT NULL,
  to_rung       SMALLINT NOT NULL,
  reason        TEXT NOT NULL,               -- 'due_date_passed','promise_broken','owner_approved'
  decided_by    TEXT NOT NULL DEFAULT 'ENGINE',
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ladder_event_invoice ON ladder_event (invoice_id, occurred_at);

CREATE TABLE message_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  invoice_id        UUID REFERENCES invoice(id) ON DELETE SET NULL,
  buyer_contact_id  UUID REFERENCES buyer_contact(id) ON DELETE SET NULL,
  rung              SMALLINT,
  template_name     TEXT,                    -- Meta-approved template used
  language          TEXT NOT NULL,
  body_rendered     TEXT NOT NULL,           -- exactly what the buyer saw
  payment_link      TEXT,
  wa_message_id     TEXT,
  status            message_status NOT NULL DEFAULT 'QUEUED',
  failure_code      TEXT,
  cost_paise        INTEGER,                 -- Meta per-message charge, for COGS tracking
  idempotency_key   TEXT NOT NULL,
  sent_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, idempotency_key)
);
CREATE INDEX idx_message_log_invoice ON message_log (invoice_id, created_at);

CREATE TABLE inbound_message (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  buyer_contact_id UUID REFERENCES buyer_contact(id) ON DELETE SET NULL,
  wa_message_id   TEXT NOT NULL,
  from_e164       TEXT NOT NULL,
  body            TEXT,
  media_s3_key    TEXT,                      -- payment screenshot / UTR photo
  raw_payload     JSONB NOT NULL,
  intent          inbound_intent,
  confidence      NUMERIC(4,3),
  extracted       JSONB,                     -- { promised_date, amount_paise, ... }
  classified_at   TIMESTAMPTZ,
  needs_human     BOOLEAN NOT NULL DEFAULT false,
  received_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_inbound_wa_id ON inbound_message (wa_message_id);
CREATE INDEX idx_inbound_needs_human ON inbound_message (org_id, received_at) WHERE needs_human;

-- ─────────────────────────────────────────── legal + ops

CREATE TABLE legal_document (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  invoice_id    UUID NOT NULL REFERENCES invoice(id) ON DELETE CASCADE,
  kind          legal_doc_kind NOT NULL,
  s3_key        TEXT NOT NULL,
  -- frozen inputs so the PDF can always be re-derived and defended
  computation   JSONB NOT NULL,              -- { rbi_bank_rate, days_overdue, interest_paise }
  approved_by   UUID NOT NULL REFERENCES app_user(id),
  approved_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at       TIMESTAMPTZ
);

CREATE TABLE sync_run (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  source        sync_source NOT NULL,
  status        sync_status NOT NULL DEFAULT 'RUNNING',
  invoices_seen INTEGER NOT NULL DEFAULT 0,
  invoices_new  INTEGER NOT NULL DEFAULT 0,
  invoices_updated INTEGER NOT NULL DEFAULT 0,
  error         TEXT,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ
);

CREATE TABLE digest (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  for_date      DATE NOT NULL,
  payload       JSONB NOT NULL,              -- the numbers we reported
  sent_at       TIMESTAMPTZ,
  UNIQUE (org_id, for_date)
);

CREATE TABLE ca_partner (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_name       TEXT NOT NULL,
  contact_name    TEXT NOT NULL,
  phone_e164      TEXT NOT NULL UNIQUE,
  membership_no   TEXT,
  commission_pct  NUMERIC(4,2) NOT NULL DEFAULT 25.00,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE org ADD CONSTRAINT fk_org_ca
  FOREIGN KEY (ca_partner_id) REFERENCES ca_partner(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────── row-level security
-- App connects as bakaya_app (NOBYPASSRLS) and does:
--   SET LOCAL app.current_org_id = '<uuid>';
-- per transaction. Application WHERE clauses are defence-in-depth, not the control.

CREATE OR REPLACE FUNCTION current_org() RETURNS UUID
  LANGUAGE sql STABLE AS $$ SELECT current_setting('app.current_org_id', true)::uuid $$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'app_user','org_policy','buyer','buyer_alias','buyer_contact','invoice','promise',
    'dispute','payment','ladder_event','message_log','inbound_message','legal_document',
    'sync_run','digest'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (org_id = current_org()) '
      'WITH CHECK (org_id = current_org())', t);
  END LOOP;
END $$;

ALTER TABLE org ENABLE ROW LEVEL SECURITY;
ALTER TABLE org FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON org USING (id = current_org()) WITH CHECK (id = current_org());

-- ─────────────────────────────────────────── app role + grants
-- The append-only guarantee comes from NOT GRANTING update/delete on the evidence
-- tables. The REVOKE below is belt-and-braces against a default PUBLIC grant; it is
-- not the control on its own.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bakaya_app') THEN
    CREATE ROLE bakaya_app LOGIN NOBYPASSRLS;   -- password set out of band
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO bakaya_app;
GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA public TO bakaya_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO bakaya_app;

-- mutable tables only; message_log / inbound_message / ladder_event deliberately absent
GRANT UPDATE, DELETE ON
  org, app_user, org_policy, buyer, buyer_alias, buyer_contact, invoice,
  promise, dispute, payment, legal_document, sync_run, digest
TO bakaya_app;

REVOKE UPDATE, DELETE ON message_log, inbound_message, ladder_event FROM PUBLIC;

-- Verified behaviour (see docs/03-data-model.md §5):
--   SET LOCAL app.current_org_id = '<org A>';
--   SELECT count(*) FROM buyer;                      -> only org A's rows
--   INSERT INTO buyer (org_id, ...) VALUES ('<org B>', ...);
--       -> ERROR: new row violates row-level security policy for table "buyer"
--   UPDATE message_log SET body_rendered = '...';
--       -> ERROR: permission denied for table message_log
