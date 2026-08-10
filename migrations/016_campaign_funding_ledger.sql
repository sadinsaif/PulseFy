-- 016_campaign_funding_ledger.sql -- verified campaign funding and immutable spend ledger.
-- Apply after 015_submission_uniqueness.sql. Do not run from application code.
--
-- A declared campaigns.budget is not proof of payment. Existing approved
-- campaign rewards cannot be safely converted into verified funding without
-- operator-supplied evidence, so refuse the migration rather than inventing it.
BEGIN;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM submissions
    WHERE campaign_id IS NOT NULL
      AND (status = 'approved' OR (spotlighted = true AND spotlight_bonus > 0))
      AND (reward > 0 OR spotlight_bonus > 0)
  ) THEN
    RAISE EXCEPTION
      'Cannot add verified campaign funding ledger: historical campaign rewards exist without a funding audit trail. Reconcile verified funding and outstanding rewards before retrying migration 016.';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS campaign_funding_ledger (
  id text PRIMARY KEY,
  campaign_id text NOT NULL REFERENCES campaigns(id) ON DELETE RESTRICT,
  submission_id text REFERENCES submissions(id) ON DELETE RESTRICT,
  actor_id text REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('funding', 'reserve', 'release', 'spend', 'reversal')),
  amount integer NOT NULL CHECK (amount > 0),
  reference text,
  note text,
  created_at timestamp NOT NULL DEFAULT now(),
  CHECK (
    (action = 'funding' AND submission_id IS NULL AND reference IS NOT NULL)
    OR (action IN ('reserve', 'release', 'spend', 'reversal') AND submission_id IS NOT NULL)
  )
);

-- db:push may have created the table before this hand-authored migration. Add
-- every financial invariant without dropping or recreating data in that case.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campaign_funding_ledger_action_check' AND conrelid = 'campaign_funding_ledger'::regclass) THEN
    ALTER TABLE campaign_funding_ledger ADD CONSTRAINT campaign_funding_ledger_action_check CHECK (action IN ('funding', 'reserve', 'release', 'spend', 'reversal'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campaign_funding_ledger_amount_check' AND conrelid = 'campaign_funding_ledger'::regclass) THEN
    ALTER TABLE campaign_funding_ledger ADD CONSTRAINT campaign_funding_ledger_amount_check CHECK (amount > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campaign_funding_ledger_shape_check' AND conrelid = 'campaign_funding_ledger'::regclass) THEN
    ALTER TABLE campaign_funding_ledger ADD CONSTRAINT campaign_funding_ledger_shape_check CHECK (
      (action = 'funding' AND submission_id IS NULL AND reference IS NOT NULL)
      OR (action IN ('reserve', 'release', 'spend', 'reversal') AND submission_id IS NOT NULL)
    );
  END IF;
END $$;

-- Reconcile the structural guarantees as well when db:push created the table
-- before this numbered migration. Every ALTER validates existing data and will
-- fail rather than rewrite rows if the historical table is incompatible.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN unnest(c.conkey) AS key_col(attnum) ON true
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = key_col.attnum
    WHERE c.contype = 'p'
      AND c.conrelid = 'campaign_funding_ledger'::regclass
      AND array_length(c.conkey, 1) = 1
      AND a.attname = 'id'
  ) THEN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE contype = 'p' AND conrelid = 'campaign_funding_ledger'::regclass) THEN
      RAISE EXCEPTION 'Cannot reconcile campaign_funding_ledger primary key: an incompatible primary key already exists.';
    END IF;
    ALTER TABLE campaign_funding_ledger
      ADD CONSTRAINT campaign_funding_ledger_pkey PRIMARY KEY (id);
  END IF;

  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'campaign_funding_ledger'::regclass AND attname = 'id' AND NOT attnotnull) THEN
    ALTER TABLE campaign_funding_ledger ALTER COLUMN id SET NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'campaign_funding_ledger'::regclass AND attname = 'campaign_id' AND NOT attnotnull) THEN
    ALTER TABLE campaign_funding_ledger ALTER COLUMN campaign_id SET NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'campaign_funding_ledger'::regclass AND attname = 'action' AND NOT attnotnull) THEN
    ALTER TABLE campaign_funding_ledger ALTER COLUMN action SET NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'campaign_funding_ledger'::regclass AND attname = 'amount' AND NOT attnotnull) THEN
    ALTER TABLE campaign_funding_ledger ALTER COLUMN amount SET NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'campaign_funding_ledger'::regclass AND attname = 'created_at' AND NOT attnotnull) THEN
    ALTER TABLE campaign_funding_ledger ALTER COLUMN created_at SET NOT NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_attrdef d
    JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
    WHERE d.adrelid = 'campaign_funding_ledger'::regclass AND a.attname = 'created_at'
  ) THEN
    ALTER TABLE campaign_funding_ledger ALTER COLUMN created_at SET DEFAULT now();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN unnest(c.conkey) AS key_col(attnum) ON true
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = key_col.attnum
    WHERE c.contype = 'f' AND c.conrelid = 'campaign_funding_ledger'::regclass
      AND a.attname = 'campaign_id' AND c.confrelid = 'campaigns'::regclass AND c.confdeltype = 'r'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN unnest(c.conkey) AS key_col(attnum) ON true
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = key_col.attnum
      WHERE c.contype = 'f' AND c.conrelid = 'campaign_funding_ledger'::regclass AND a.attname = 'campaign_id'
    ) THEN
      RAISE EXCEPTION 'Cannot reconcile campaign_funding_ledger campaign_id FK: an incompatible foreign key already exists.';
    END IF;
    ALTER TABLE campaign_funding_ledger ADD CONSTRAINT campaign_funding_ledger_campaign_id_campaigns_id_fk
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN unnest(c.conkey) AS key_col(attnum) ON true
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = key_col.attnum
    WHERE c.contype = 'f' AND c.conrelid = 'campaign_funding_ledger'::regclass
      AND a.attname = 'submission_id' AND c.confrelid = 'submissions'::regclass AND c.confdeltype = 'r'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN unnest(c.conkey) AS key_col(attnum) ON true
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = key_col.attnum
      WHERE c.contype = 'f' AND c.conrelid = 'campaign_funding_ledger'::regclass AND a.attname = 'submission_id'
    ) THEN
      RAISE EXCEPTION 'Cannot reconcile campaign_funding_ledger submission_id FK: an incompatible foreign key already exists.';
    END IF;
    ALTER TABLE campaign_funding_ledger ADD CONSTRAINT campaign_funding_ledger_submission_id_submissions_id_fk
      FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN unnest(c.conkey) AS key_col(attnum) ON true
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = key_col.attnum
    WHERE c.contype = 'f' AND c.conrelid = 'campaign_funding_ledger'::regclass
      AND a.attname = 'actor_id' AND c.confrelid = 'users'::regclass AND c.confdeltype = 'n'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN unnest(c.conkey) AS key_col(attnum) ON true
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = key_col.attnum
      WHERE c.contype = 'f' AND c.conrelid = 'campaign_funding_ledger'::regclass AND a.attname = 'actor_id'
    ) THEN
      RAISE EXCEPTION 'Cannot reconcile campaign_funding_ledger actor_id FK: an incompatible foreign key already exists.';
    END IF;
    ALTER TABLE campaign_funding_ledger ADD CONSTRAINT campaign_funding_ledger_actor_id_users_id_fk
      FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- A verified payment/reference can be recorded only once, preventing retry
-- requests from double-funding a campaign.
CREATE UNIQUE INDEX IF NOT EXISTS campaign_funding_ledger_unique_funding_reference_idx
  ON campaign_funding_ledger (reference)
  WHERE action = 'funding';
CREATE INDEX IF NOT EXISTS campaign_funding_ledger_campaign_created_idx
  ON campaign_funding_ledger (campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS campaign_funding_ledger_submission_idx
  ON campaign_funding_ledger (submission_id, created_at DESC)
  WHERE submission_id IS NOT NULL;

-- A submission-backed ledger action must remain in the same campaign as its
-- submission. Do not repair historical rows: refuse the migration so an
-- operator can reconcile financial evidence explicitly.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM campaign_funding_ledger l
    LEFT JOIN submissions s ON s.id = l.submission_id
    WHERE l.action <> 'funding'
      AND (s.id IS NULL OR s.campaign_id IS DISTINCT FROM l.campaign_id)
  ) THEN
    RAISE EXCEPTION
      'Cannot add campaign_funding_ledger submission/campaign validation: incompatible historical ledger rows exist. Reconcile them before retrying migration 016.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION validate_campaign_funding_ledger_submission_campaign()
RETURNS trigger AS $$
DECLARE
  submission_campaign_id text;
BEGIN
  IF NEW.action = 'funding' THEN
    IF NEW.submission_id IS NOT NULL THEN
      RAISE EXCEPTION 'funding ledger entries cannot reference a submission';
    END IF;
    RETURN NEW;
  END IF;

  SELECT campaign_id INTO submission_campaign_id
  FROM submissions
  WHERE id = NEW.submission_id;

  IF submission_campaign_id IS NULL OR submission_campaign_id IS DISTINCT FROM NEW.campaign_id THEN
    RAISE EXCEPTION 'submission-backed ledger entries must reference the submission campaign';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'campaign_funding_ledger_submission_campaign_trigger'
      AND tgrelid = 'campaign_funding_ledger'::regclass
      AND tgfoid <> 'validate_campaign_funding_ledger_submission_campaign()'::regprocedure
  ) THEN
    RAISE EXCEPTION 'Cannot reconcile campaign_funding_ledger submission/campaign trigger: an incompatible trigger already exists.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'campaign_funding_ledger_submission_campaign_trigger'
      AND tgrelid = 'campaign_funding_ledger'::regclass
  ) THEN
    CREATE TRIGGER campaign_funding_ledger_submission_campaign_trigger
      BEFORE INSERT ON campaign_funding_ledger
      FOR EACH ROW EXECUTE FUNCTION validate_campaign_funding_ledger_submission_campaign();
  END IF;
END $$;

-- Corrections are represented by reversal entries; ledger rows themselves can
-- never be edited or deleted after posting.
CREATE OR REPLACE FUNCTION prevent_campaign_funding_ledger_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'campaign_funding_ledger is append-only; record a reversal instead';
END;
$$ LANGUAGE plpgsql;
DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'campaign_funding_ledger_immutable_trigger'
      AND tgrelid = 'campaign_funding_ledger'::regclass
      AND tgfoid <> 'prevent_campaign_funding_ledger_mutation()'::regprocedure
  ) THEN
    RAISE EXCEPTION 'Cannot reconcile campaign_funding_ledger immutable trigger: an incompatible trigger already exists.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'campaign_funding_ledger_immutable_trigger'
      AND tgrelid = 'campaign_funding_ledger'::regclass
  ) THEN
    CREATE TRIGGER campaign_funding_ledger_immutable_trigger
      BEFORE UPDATE OR DELETE ON campaign_funding_ledger
      FOR EACH ROW EXECUTE FUNCTION prevent_campaign_funding_ledger_mutation();
  END IF;
END $$;

COMMIT;
