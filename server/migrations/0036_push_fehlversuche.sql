-- Push-Abos: Fehlversuche in Folge. Ab 5 löscht der Sender das Abo (Security-Audit run-2): Bisher wurden nur
-- Abos gelöscht, die der Anbieter ausdrücklich als abgemeldet meldet (410/404, UNREGISTERED, BadDeviceToken);
-- unzustellbare (kaputter Schlüssel, ungültiges Token, nicht erreichbarer Host) blieben für immer und wurden bei
-- jedem Versand erneut abgearbeitet. Ein erfolgreicher Versand setzt den Zähler zurück.
ALTER TABLE push_subscriptions ADD COLUMN fehlversuche INTEGER NOT NULL DEFAULT 0;
