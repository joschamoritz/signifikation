-- Android-Push über Firebase Cloud Messaging: Registrierungstoken je Gerät.
-- Gegenstück zu apns_token (iOS); Zeilen mit platform = 'android' tragen nur
-- fcm_token, endpoint/p256dh/auth/apns_token bleiben NULL.
ALTER TABLE push_subscriptions ADD COLUMN fcm_token TEXT;
CREATE UNIQUE INDEX idx_push_fcm ON push_subscriptions(fcm_token) WHERE fcm_token IS NOT NULL;
