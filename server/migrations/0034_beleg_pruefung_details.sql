-- Belegprüfung: je bestandenem Satz die Relation (aus Sicht der Basis, „ATTR“ / „~ATTR“ …)
-- und die Zeichenposition des Kollokators. JSON: {"<satz_id>": {"rel": [...], "start": n, "ende": n}}.
-- Der Lückenfüller braucht beides (Satz mit genau seiner Relation, exakte Stelle der Lücke).
-- NULL bei Zeilen aus der Zeit vor dieser Migration; ein erneuter Prüflauf füllt sie.
ALTER TABLE beleg_pruefung ADD COLUMN details TEXT;
