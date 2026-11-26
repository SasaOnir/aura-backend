-- Aura — hardening del database (eseguito dopo schema.sql).
-- 1) audit_logs append-only A LIVELLO DB: nemmeno un'app compromessa (o un bug)
--    può alterare o cancellare la storia. L'unica modifica ammessa è actor_id -> NULL,
--    effetto della FK ON DELETE SET NULL (cancellazione fisica GDPR di un utente).

CREATE OR REPLACE FUNCTION audit_logs_immutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'audit_logs è append-only: DELETE non consentito';
  END IF;
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'audit_logs è append-only: TRUNCATE non consentito';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.actor_id IS NULL
       AND (NEW.id, NEW.action, NEW.resource_type, NEW.resource_id, NEW.previous_value_reference,
            NEW.new_value_reference, NEW.reason, NEW.result, NEW.ip, NEW.user_agent, NEW.session_id, NEW.created_at)
           IS NOT DISTINCT FROM
           (OLD.id, OLD.action, OLD.resource_type, OLD.resource_id, OLD.previous_value_reference,
            OLD.new_value_reference, OLD.reason, OLD.result, OLD.ip, OLD.user_agent, OLD.session_id, OLD.created_at)
    THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'audit_logs è append-only: UPDATE non consentito';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_logs_no_update_delete ON audit_logs;
CREATE TRIGGER audit_logs_no_update_delete
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();

DROP TRIGGER IF EXISTS audit_logs_no_truncate ON audit_logs;
CREATE TRIGGER audit_logs_no_truncate
  BEFORE TRUNCATE ON audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_immutable();

-- 2) Indici per il rilevamento abusi (login falliti per IP/utente)
CREATE INDEX IF NOT EXISTS audit_logs_action_created_idx ON audit_logs(action, created_at DESC);
