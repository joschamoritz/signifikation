-- 0001_audit_log_index_status.sql
-- Erste versionierte Migration. Index auf audit_log(status) fuer schnellere
-- Filter-Queries beim Security-Audit (LOGIN_FAIL, PAYMENT_REJECT, ...).

CREATE INDEX IF NOT EXISTS idx_audit_log_status
  ON audit_log(status);

CREATE INDEX IF NOT EXISTS idx_audit_log_action_timestamp
  ON audit_log(action, timestamp DESC);
