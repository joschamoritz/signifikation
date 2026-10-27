-- Sign in with Apple: Refresh-Token aus dem nativen Login (Guideline 5.1.1(v)).
-- Apple verlangt, dass eine Kontolöschung die Anmeldung über
-- appleid.apple.com/auth/revoke widerruft. Der native Login liefert dafür nur
-- einen kurzlebigen authorizationCode; der Server tauscht ihn gegen ein
-- Refresh-Token und legt es hier ab. client_id merkt sich, für welche Kennung
-- der Code ausgestellt wurde (Bundle-ID nativ, Services-ID im Web) – der
-- Widerruf muss mit derselben Kennung laufen.
-- Der Web-Login legt seine Tokens weiter selbst in account.refreshToken ab.
CREATE TABLE apple_token (
  user_id       TEXT PRIMARY KEY,
  refresh_token TEXT NOT NULL,
  client_id     TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);
