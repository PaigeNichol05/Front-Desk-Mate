// Additive, repeatable migration. No legacy status is promoted to an insurer response.
export function migrateClearinghouse(db) {
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS claims_org_identity ON claims(id,org_id);
    CREATE TABLE IF NOT EXISTS claim_outbox (
      id TEXT PRIMARY KEY, org_id TEXT NOT NULL, claim_id TEXT NOT NULL REFERENCES claims(id),
      revision INTEGER NOT NULL CHECK(revision>0), idempotency_key TEXT NOT NULL UNIQUE,
      request_key TEXT, snapshot TEXT NOT NULL, scenario TEXT CHECK(scenario IN ('PAID','REJECTED','DENIED')),
      state TEXT NOT NULL DEFAULT 'QUEUED' CHECK(state IN ('QUEUED','PROCESSING','RETRY','DONE','EXHAUSTED')),
      attempts INTEGER NOT NULL DEFAULT 0, next_attempt_ms INTEGER NOT NULL DEFAULT 0,
      lease_token TEXT, lease_until_ms INTEGER, last_error TEXT, created_at TEXT NOT NULL,
      UNIQUE(claim_id,revision), UNIQUE(org_id,request_key),
      FOREIGN KEY(claim_id,org_id) REFERENCES claims(id,org_id)
    );
    CREATE INDEX IF NOT EXISTS outbox_due ON claim_outbox(org_id,state,next_attempt_ms);
    CREATE TABLE IF NOT EXISTS simulated_claim_events (
      id TEXT PRIMARY KEY, outbox_id TEXT NOT NULL REFERENCES claim_outbox(id),
      sequence INTEGER NOT NULL, event_type TEXT NOT NULL, payload TEXT NOT NULL,
      source TEXT NOT NULL CHECK(source='FICTIONAL_CLEARINGHOUSE_V1'),
      received_at TEXT NOT NULL, UNIQUE(outbox_id,sequence)
    );
    CREATE TRIGGER IF NOT EXISTS outbox_snapshot_locked BEFORE UPDATE OF id,org_id,claim_id,revision,idempotency_key,request_key,snapshot,created_at ON claim_outbox
      BEGIN SELECT RAISE(ABORT,'Transmission identity and snapshot are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS outbox_scenario_locked BEFORE UPDATE OF scenario ON claim_outbox
      WHEN OLD.scenario IS NOT NULL AND NEW.scenario IS NOT OLD.scenario
      BEGIN SELECT RAISE(ABORT,'Simulation scenario is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS outbox_no_delete BEFORE DELETE ON claim_outbox
      BEGIN SELECT RAISE(ABORT,'Transmission history is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS simulated_events_no_update BEFORE UPDATE ON simulated_claim_events
      BEGIN SELECT RAISE(ABORT,'Claim events are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS simulated_events_no_delete BEFORE DELETE ON simulated_claim_events
      BEGIN SELECT RAISE(ABORT,'Claim events are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS claim_events_no_update BEFORE UPDATE ON claim_events
      BEGIN SELECT RAISE(ABORT,'Claim events are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS claim_events_no_delete BEFORE DELETE ON claim_events
      BEGIN SELECT RAISE(ABORT,'Claim events are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_log
      BEGIN SELECT RAISE(ABORT,'Audit records are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_log
      BEGIN SELECT RAISE(ABORT,'Audit records are immutable'); END;
  `);
}
