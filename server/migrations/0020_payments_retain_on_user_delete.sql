-- 0020_payments_retain_on_user_delete.sql
-- Backlog "Rechtlich – braucht deine Entscheidung" (§147 AO vs. Code, 2026-08-10):
-- Die Datenschutzerklaerung verspricht 10 Jahre Aufbewahrung des Zahlungsstatus
-- als Lizenz-/Steuernachweis (§147 AO). payments.user_id stand aber NOT NULL mit
-- FOREIGN KEY ... ON DELETE CASCADE auf user(id) -- eine Kontoloeschung riss den
-- Zahlungsnachweis vorzeitig mit raus, noch bevor die 10 Jahre um sind.
--
-- Fix: user_id wird nullable, CASCADE wird zu SET NULL. Der Zahlungsnachweis
-- (Betrag, Status, Produkt, Zeitpunkt) bleibt bestehen, verliert bei einer
-- Kontoloeschung nur den Personenbezug -- passt zum Zweck (Buchhaltung/
-- Belegpflicht), ohne Daten laenger an eine geloeschte Person zu binden als
-- noetig (Art. 5 Abs. 1 lit. e DSGVO, Speicherbegrenzung).
--
-- SQLite kennt kein ALTER TABLE fuer FK-Aktionen -> Tabelle wird per
-- Rename-Copy-Drop neu aufgebaut. payments ist reines Blattobjekt (keine
-- andere Tabelle hat eine FK auf payments), das Rebuild ist daher gefahrlos.
--
-- server/routes/iap.js (getTransactionStmt/insertPaymentStmt) und
-- server/routes/payments.js sind im selben Commit auf das neue Schema
-- angepasst -- siehe dortige Kommentare zum Restore-Pfad.

ALTER TABLE payments RENAME TO payments_old_0020;

CREATE TABLE payments (
  id           TEXT PRIMARY KEY,
  user_id      TEXT,
  amount       TEXT NOT NULL,
  currency     TEXT NOT NULL DEFAULT 'EUR',
  status       TEXT NOT NULL,
  product      TEXT NOT NULL,
  processed_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE SET NULL
);

INSERT INTO payments (id, user_id, amount, currency, status, product, processed_at)
  SELECT id, user_id, amount, currency, status, product, processed_at
  FROM payments_old_0020;

DROP TABLE payments_old_0020;

CREATE INDEX IF NOT EXISTS idx_payments_user_product
  ON payments(user_id, product, status);
