-- App-Store-Erstattungsmeldungen (REFUND / REFUND_REVERSED): je Kauf (originalTransactionId) das
-- signedDate der zuletzt verarbeiteten Meldung. Apple wiederholt Meldungen und liefert sie nicht
-- garantiert in Reihenfolge; ohne Stand könnte ein verspätetes REFUND ein schon verarbeitetes
-- REFUND_REVERSED überschreiben (Security-Audit 2026-10-30). Kein Fremdschlüssel: Der Stand gilt
-- auch für Sperreinträge und bleibt, wenn das Konto gelöscht wird.
CREATE TABLE app_store_meldung_stand (
  kauf_id      TEXT PRIMARY KEY,
  signed_date  INTEGER NOT NULL
);
