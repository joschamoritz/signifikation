/*
  HANDELSREISE – Regeln und Daten (Geschichte 8a/8e, G8.1, ASGSG Marl)

  Reines ES-Modul ohne DOM: Das Spiel im Gerät und später der Klassenmarkt auf
  dem Server rechnen mit denselben Funktionen, damit beide nie auseinanderlaufen.

  ALLE ZAHLEN SIND SPIELWERTE. Belegt ist nur die Richtung (welche Ware wo
  gefragt ist, welcher Schutz wo hilft), nie der Betrag. Belegt nach
  Geschichte und Geschehen 2 (Klett), S. 24–33; Pest nach Praxis Geschichte
  4/2021 und 2/2023. Konzept: Arbeits-Vault, „G8.1 Handelsreise – Spielkonzept“.
*/

export const VERSION = 1
export const RUNDEN = 5
export const START_SILBER = 30
export const START_LADERAUM = 8

/* ================= Handelsräume ================= */

export const RAEUME = {
  seide: {
    name: 'Seidenstraße',
    untertitel: 'Von Venedig bis nach China',
    startorte: ['venedig'],
    intro: 'Ihr seid ein Handelshaus aus Venedig. Europäer schätzen Seide, Gewürze und Porzellan aus dem fernen Osten als Luxus. In Richtung China gehen Glas und Fertigwaren. Der Weg ist weit – aber die Mongolen schützen Reisende in ihrem Reich.',
    introBeleg: 'S. 28 VT1, VT2',
    waren: {
      seide:     { name: 'Seide' },
      gewuerze:  { name: 'Gewürze' },
      porzellan: { name: 'Porzellan' },
      glas:      { name: 'Glas' },
      fertig:    { name: 'Fertigwaren' },
    },
    orte: {
      venedig: { name: 'Venedig', x: 50, y: 100, angebot: ['glas', 'fertig'],
        text: 'Italienische Kaufleute bringen Waren aus Asien nach Europa.', beleg: 'S. 28 VT1' },
      bagdad: { name: 'Bagdad · Damaskus', x: 185, y: 175, angebot: ['gewuerze'],
        text: 'Bis hierher segeln die Italiener, an die Ostküste des Mittelmeers.', beleg: 'S. 28 VT1' },
      quinsai: { name: 'Quinsai', x: 345, y: 95, angebot: ['seide', 'porzellan'],
        text: 'Hangzhou in China. Marco Polo nennt sie die glanzvollste Stadt der Welt.', beleg: 'S. 29 Q2' },
    },
    // Spielwerte. ★ = Angebot (hier kann man kaufen).
    preise: {
      venedig: { seide: 9, gewuerze: 8, porzellan: 9, glas: 2, fertig: 3 },
      bagdad:  { seide: 6, gewuerze: 4, porzellan: 6, glas: 5, fertig: 5 },
      quinsai: { seide: 3, gewuerze: 6, porzellan: 3, glas: 8, fertig: 7 },
    },
    strecken: [
      { a: 'venedig', b: 'bagdad', risiko: 0.2, art: 'see', name: 'übers Mittelmeer' },
      { a: 'bagdad', b: 'quinsai', risiko: 0.35, art: 'land', name: 'über die Seidenstraße' },
    ],
    schutz: {
      id: 'geleit', name: 'Geleitbrief der Mongolen', kosten: 5, dauer: 'spiel',
      text: 'Mit dem Geleitbrief steht ihr unter dem Schutz der Mongolen. Gilt bis Spielende.',
      beleg: 'S. 28 VT2: Die Mongolen boten ausländischen Reisenden und Kaufleuten Schutz.',
    },
    karten: ['s1', 's2', 's3', 's4'],
  },

  hanse: {
    name: 'Hanse',
    untertitel: 'Nord- und Ostsee',
    startorte: ['luebeck', 'koeln'],
    intro: 'Ihr seid ein Handelshaus an Nord- und Ostsee. Pelze und Wachs kommen aus dem Osten, Salz aus Lübeck, Tuche aus England, Wein und Metallwaren aus Köln. Kaufleute, die sich zusammenschließen, reisen sicherer.',
    introBeleg: 'S. 24 VT1, D1; S. 30 VT2',
    waren: {
      pelze:  { name: 'Pelze' },
      wachs:  { name: 'Wachs' },
      salz:   { name: 'Salz' },
      wein:   { name: 'Wein' },
      tuche:  { name: 'Tuche' },
      metall: { name: 'Metallwaren' },
    },
    orte: {
      london:   { name: 'London', x: 45, y: 160, angebot: ['tuche'],
        text: 'Hier liegt der Stalhof, ein Kontor der Hanse.', beleg: 'S. 24 VT1, D1' },
      koeln:    { name: 'Köln', x: 140, y: 225, angebot: ['wein', 'metall'],
        text: 'Mächtige Handelsstadt am Rhein. Hier gilt das Stapelrecht.', beleg: 'S. 30 VT1–VT3' },
      luebeck:  { name: 'Lübeck', x: 200, y: 120, angebot: ['salz'],
        text: 'Die mächtigste Hansestadt an der Ostsee. Salz kommt aus dem nahen Lüneburg.', beleg: 'S. 24 D1' },
      nowgorod: { name: 'Nowgorod', x: 355, y: 55, angebot: ['pelze', 'wachs'],
        text: 'Hier liegt der Peterhof, ein Kontor der Hanse. Pelze und Wachs kommen aus dem Osten.', beleg: 'S. 24 VT1, D1' },
    },
    preise: {
      london:   { pelze: 7, wachs: 6, salz: 5, wein: 6, tuche: 2, metall: 5 },
      koeln:    { pelze: 6, wachs: 5, salz: 6, wein: 2, tuche: 4, metall: 2 },
      luebeck:  { pelze: 5, wachs: 4, salz: 2, wein: 6, tuche: 5, metall: 5 },
      nowgorod: { pelze: 2, wachs: 2, salz: 7, wein: 8, tuche: 8, metall: 7 },
    },
    strecken: [
      { a: 'london', b: 'luebeck', risiko: 0.2, art: 'see', name: 'über die Nordsee' },
      { a: 'london', b: 'koeln', risiko: 0.15, art: 'see', name: 'über Nordsee und Rhein' },
      { a: 'koeln', b: 'luebeck', risiko: 0.2, art: 'land', name: 'über Land' },
      { a: 'luebeck', b: 'nowgorod', risiko: 0.25, art: 'see', name: 'über die Ostsee' },
    ],
    schutz: {
      id: 'hanse', name: 'Mitglied der Hanse', kosten: 6, dauer: 'spiel',
      text: 'Mitglieder reisen gemeinsam. Je mehr Handelshäuser Mitglied sind, desto sicherer. Gilt bis Spielende.',
      beleg: 'S. 24 VT1: Kaufleute organisierten gemeinsame Handelsreisen, so konnten sie sich besser vor Gefahren schützen.',
    },
    karten: ['h1', 'h2', 'h3', 'h4', 'h5'],
  },

  sahara: {
    name: 'Sahara',
    untertitel: 'Salz gegen Gold',
    startorte: ['timbuktu', 'taghaza'],   // verteilt, sonst drücken alle denselben Markt (Simulation Klassenmarkt 2026-10-07)
    intro: 'Ihr seid ein Handelshaus am Rand der Sahara. Salz aus Taghaza wird gegen Gold aus dem Süden getauscht. Aus dem Norden kommen Tuche und Kupfer. Wer die Wüste durchquert, braucht Wasser – und eine Karawane.',
    introBeleg: 'S. 30 VT5, S. 31 VT7, D1',
    waren: {
      salz:      { name: 'Salz' },
      gold:      { name: 'Gold' },
      elfenbein: { name: 'Elfenbein' },
      tuche:     { name: 'Tuche' },
      kupfer:    { name: 'Kupfer' },
    },
    orte: {
      taghaza:  { name: 'Taghaza', x: 175, y: 40, angebot: ['salz', 'tuche', 'kupfer'],
        text: 'Salz aus der Wüste. Karawanen aus dem Norden bringen Tuche und Kupfer mit (Spielabstraktion).', beleg: 'S. 31 VT7, S. 32 Q2' },
      timbuktu: { name: 'Timbuktu', x: 220, y: 185, angebot: ['gold'],
        text: 'Zentrum des Handels und der Bildung, am Rand der Wüste und nahe dem Niger.', beleg: 'S. 30 VT5' },
      djenne:   { name: 'Djenné', x: 120, y: 235, angebot: ['gold', 'elfenbein'],
        text: 'Von hier kommt das Gold. Salz ist hier besonders gefragt.', beleg: 'S. 31 VT7' },
    },
    preise: {
      taghaza:  { salz: 2, gold: 9, elfenbein: 8, tuche: 3, kupfer: 3 },
      timbuktu: { salz: 7, gold: 4, elfenbein: 6, tuche: 7, kupfer: 7 },
      djenne:   { salz: 9, gold: 3, elfenbein: 3, tuche: 8, kupfer: 8 },
    },
    strecken: [
      { a: 'taghaza', b: 'timbuktu', risiko: 0.32, art: 'wueste', name: 'durch die Wüste' },
      { a: 'timbuktu', b: 'djenne', risiko: 0.1, art: 'fluss', name: 'auf dem Niger' },
    ],
    schutz: {
      id: 'karawane', name: 'Mit einer Karawane reisen', kosten: 2, dauer: 'reise',
      text: 'Ihr schließt euch einer großen Karawane an. Gilt nur für diese Reise.',
      beleg: 'S. 30 VT5: Timbuktu lag an wichtigen Handelsrouten, sodass dort zahlreiche Karawanen mit ihren Kamelen hielten.',
    },
    karten: ['a1', 'a2', 'a3'],
  },
}

/* ================= Entscheidungskarten ================= */
// Folgen: silber, flag, risikoReise (Faktor, optional nurArt), verkaufRunde
// (Faktor auf Verkäufe dieser Runde), laderaum (dauerhaft), laderaumRunde,
// koelnFrei, info. „bedingt“ prüft einen Schutz-Flag.

export const KARTEN = {
  h1: {
    titel: 'Der Hanse beitreten?',
    text: 'In Lübeck haben sich Kaufleute zusammengeschlossen. Sie reisen gemeinsam und dürfen die Kontore in London und Nowgorod nutzen – mit Lagerhaus, Hafen und eigenem Gericht. Der Beitrag kostet 6 Silber.',
    a: { text: 'Wir treten bei', folgen: { silber: -6, flag: 'hanse' },
      folgeText: 'Ihr seid Mitglied der Hanse. Eure Reisen werden sicherer – umso mehr, je mehr Handelshäuser mitmachen.' },
    b: { text: 'Wir bleiben unabhängig', folgen: {},
      folgeText: 'Ihr spart das Geld und reist auf eigene Faust. Beitreten könnt ihr später noch.' },
    beleg: 'S. 24 VT1: Kaufleute schlossen sich zu Vereinigungen zusammen, organisierten gemeinsame Handelsreisen und unterhielten Kontore wie den Stalhof in London und den Peterhof in Nowgorod.',
    spielregel: 'Höhe des Beitrags und Stärke des Schutzes sind Spielwerte.',
  },
  h2: {
    titel: 'Im Konvoi oder allein?',
    text: 'Mehrere Schiffe wollen gemeinsam auslaufen. Im Konvoi seid ihr sicherer, müsst aber euren Anteil am bewaffneten Begleitschiff bezahlen: 2 Silber.',
    a: { text: 'Mit dem Konvoi', folgen: { silber: -2, risikoReise: 0.5 },
      folgeText: 'Die Gefahr auf eurer nächsten Reise sinkt um die Hälfte.' },
    b: { text: 'Allein, dafür billiger', folgen: {},
      folgeText: 'Ihr spart das Geld. Die Gefahr bleibt, wie sie ist.' },
    beleg: 'S. 24 VT1: Gemeinsame Handelsreisen – „so konnten sie sich besser vor Gefahren schützen“.',
    spielregel: 'Kosten und Wirkung sind Spielwerte.',
  },
  h3: {
    titel: 'Neuigkeiten im Kontor',
    text: 'Abends im Kontor erzählen sich die Kaufleute, wo welche Ware gerade gefragt ist. Wer mitreden will, muss aber auch von seinen eigenen Plänen erzählen.',
    a: { text: 'Wir reden mit', folgen: { info: true },
      folgeText: 'Ihr erfahrt die aktuellen Preise in allen Städten eures Handelsraums – die anderen erfahren dafür eure Pläne.' },
    b: { text: 'Wir schweigen', folgen: {},
      folgeText: 'Eure Pläne bleiben geheim. Ihr kennt nur die Preise des Ortes, an dem ihr seid.' },
    beleg: 'S. 24 VT1: In den Kontoren tauschte man außer Waren auch Informationen aus – über Geschäftsideen ebenso wie über Lebensweise und Kultur.',
    spielregel: 'Was die anderen mit euren Plänen machen, bildet das Spiel nicht ab.',
  },
  h4: {
    titel: 'Köln umgehen?',
    text: 'Wer Waren den Rhein hinauf bringt, muss in Köln halten. Die Waren werden auf andere Schiffe umgeladen und müssen drei Tage in der Stadt zum Verkauf angeboten werden. Ihr könntet Fuhrleute bezahlen und Köln über Land umgehen: 3 Silber.',
    a: { text: 'Wir halten uns an das Stapelrecht', folgen: {},
      folgeText: 'Kommt ihr nach Köln, verkauft ihr dort die Hälfte eurer Ladung zum Kölner Preis.' },
    b: { text: 'Wir umgehen Köln', folgen: { silber: -3, koelnFrei: true, risikoReise: 1.3 },
      folgeText: 'Beim nächsten Besuch in Köln gilt das Stapelrecht für euch nicht. Der Umweg über Land macht eure nächste Reise aber gefährlicher.' },
    beleg: 'S. 30 VT3: 1259 erhielt Köln das Stapelrecht – alle über Köln transportierten Waren mussten drei Tage in der Stadt zum Verkauf angeboten werden.',
    spielregel: 'Ob und wie man Köln umgehen konnte, steht nicht im Buch. Kosten und Gefahr sind Spielwerte.',
  },
  h5: {
    titel: 'Streit im Stalhof',
    text: 'Ein Londoner Händler behauptet, ihr hättet ihm schlechte Ware verkauft. Er verlangt 4 Silber. Mitglieder der Hanse können vor das Gericht des Kontors gehen.',
    a: { text: 'Vor das Gericht des Kontors', folgen: { bedingt: { flag: 'hanse', ja: {}, nein: { silber: -4 } } },
      folgeText: 'Mitglieder: Das Kontor gibt euch recht, ihr zahlt nichts. Nicht-Mitglieder: Das Kontor ist nicht zuständig, ihr müsst trotzdem zahlen.' },
    b: { text: 'Wir zahlen, damit Ruhe ist', folgen: { silber: -4 },
      folgeText: 'Ihr zahlt 4 Silber.' },
    beleg: 'S. 24 VT1: Die Kontore hatten Lagerhallen, manchmal eigene Hafenanlagen und ein eigenes Gericht.',
    spielregel: 'Der Streitfall ist erfunden, das Gericht im Kontor ist belegt.',
  },

  s1: {
    titel: 'Ein Geleitbrief der Mongolen',
    text: 'Die Mongolen beherrschen die Gegenden rund um die Seidenstraße. Für 5 Silber bekommt ihr einen Geleitbrief, der euch unter ihren Schutz stellt.',
    a: { text: 'Wir kaufen den Geleitbrief', folgen: { silber: -5, flag: 'geleit' },
      folgeText: 'Ihr reist unter dem Schutz der Mongolen. Eure Reisen werden sicherer.' },
    b: { text: 'Wir sparen das Geld', folgen: {},
      folgeText: 'Ihr reist ohne Schutzbrief. Kaufen könnt ihr ihn später noch.' },
    beleg: 'S. 28 VT2: Die Mongolen zeigten sich gastfreundlich gegenüber ausländischen Reisenden und Kaufleuten und boten ihnen Schutz. Das ließ den Handel aufblühen.',
    spielregel: 'Das Buch nennt keine Kosten. Preis und Wirkung sind Spielwerte.',
  },
  s2: {
    titel: 'Ein Mönch berichtet',
    text: 'Ein Mönch kommt von den Mongolen zurück. Er erzählt: Dort gebe es keine Räuber und keine Diebe. Die Leute schlössen nicht einmal ihre Karren ab. Ihr könntet die Wachen sparen (2 Silber).',
    a: { text: 'Wir glauben ihm und sparen die Wachen', folgen: { silber: 2, risikoReise: 1.4 },
      folgeText: 'Ihr spart 2 Silber. Ohne Wachen ist eure nächste Reise gefährlicher – egal, was der Mönch erzählt.' },
    b: { text: 'Wir nehmen trotzdem Wachen mit', folgen: { risikoReise: 0.8 },
      folgeText: 'Die Wachen machen eure nächste Reise etwas sicherer.' },
    beleg: 'S. 29 Q3: Johannes von Plano Carpini, 1247 vom Papst zu den Mongolen geschickt. Er schreibt, Räuber und Diebe gebe es dort nicht – und im selben Bericht, die Mongolen äßen in Notlagen Menschenfleisch. Ein Bericht mit Standpunkt.',
    spielregel: 'Wie gefährlich die Reise wirklich war, bestimmt im Spiel die Spielregel, nicht der Bericht.',
  },
  s3: {
    titel: 'Glaubt ihr Marco Polo?',
    text: 'Ein venezianischer Kaufmann erzählt von Quinsai: die glanzvollste Stadt der Welt, unglaubliche Mengen an Waren. Wer ihm glaubt, kauft für 3 Silber zusätzliche Lasttiere und kann mehr laden.',
    a: { text: 'Wir glauben ihm und rüsten auf', folgen: { silber: -3, laderaum: 2 },
      folgeText: 'Ihr könnt ab jetzt 2 Ladungen mehr transportieren.' },
    b: { text: 'Klingt übertrieben', folgen: {},
      folgeText: 'Ihr spart das Geld und bleibt vorsichtig.' },
    beleg: 'S. 29 Q2: Marco Polo über Quinsai (1298). S. 28, Randspalte: Ob Marco Polo wirklich selbst nach China reiste oder sich nur davon erzählen ließ, wissen wir nicht.',
    spielregel: 'Lasttiere und Laderaum sind Spielwerte.',
  },
  s4: {
    titel: 'Ein Dolmetscher?',
    text: 'Auf der Seidenstraße begegnen sich viele Sprachen und Schriften. Ein Dolmetscher bietet euch für 2 Silber seine Hilfe beim Verhandeln an.',
    a: { text: 'Wir nehmen den Dolmetscher', folgen: { silber: -2, verkaufRunde: 1.2 },
      folgeText: 'In dieser Runde verkauft ihr eure Waren teurer.' },
    b: { text: 'Wir verhandeln mit Händen und Füßen', folgen: { verkaufRunde: 0.9 },
      folgeText: 'In dieser Runde verkauft ihr eure Waren etwas billiger.' },
    beleg: 'S. 28 VT3: Der Handel auf der Seidenstraße verband Kulturen. Schriften unterschiedlicher Sprachen und Religionen verbreiteten sich.',
    spielregel: 'Dass ein Dolmetscher bessere Preise bringt, ist eine Spielregel.',
  },

  a1: {
    titel: 'Kamele kaufen?',
    text: 'Karawanen ziehen mit ihren Kamelen durch die Wüste. Für 5 Silber kauft ihr eigene Kamele und könnt mehr laden.',
    a: { text: 'Wir kaufen Kamele', folgen: { silber: -5, laderaum: 3 },
      folgeText: 'Ihr könnt ab jetzt 3 Ladungen mehr transportieren.' },
    b: { text: 'Wir kommen so zurecht', folgen: {},
      folgeText: 'Ihr spart das Geld.' },
    beleg: 'S. 30 VT5: In Timbuktu hielten zahlreiche Karawanen mit ihren Kamelen.',
    spielregel: 'Preis und Laderaum sind Spielwerte.',
  },
  a2: {
    titel: 'Wasser oder Salz?',
    text: 'Vor der Wüstenstrecke müsst ihr entscheiden: Mehr Wasserschläuche kosten 2 Silber. Oder ihr ladet statt Wasser lieber 2 Ladungen mehr Ware.',
    a: { text: 'Mehr Wasser', folgen: { silber: -2, risikoReise: 0.5, nurArt: 'wueste' },
      folgeText: 'Auf eurer nächsten Reise durch die Wüste ist die Gefahr nur halb so groß.' },
    b: { text: 'Mehr Ware', folgen: { laderaumRunde: 2, risikoReise: 1.5, nurArt: 'wueste' },
      folgeText: 'In dieser Runde könnt ihr 2 Ladungen mehr kaufen. Führt eure nächste Reise durch die Wüste, ist sie gefährlicher.' },
    beleg: 'S. 32 Q2: Ibn Battuta verbrachte zehn Tage in Taghaza. Das Wasser dort ist salzig. Man nimmt einen Wasservorrat für die Wüstenstrecke mit, für die man zehn Tage braucht und auf der man selten Wasser findet.',
    spielregel: 'Kosten und Wirkung sind Spielwerte.',
  },
  a3: {
    titel: 'Ein Laden in Timbuktu?',
    text: 'Ein Reisender erzählt, in Timbuktu würden vor allem die Fremden reich. Für 5 Silber könntet ihr dort einen Laden mieten und eure Waren besser verkaufen.',
    a: { text: 'Wir mieten den Laden', folgen: { silber: -5, flag: 'laden' },
      folgeText: 'Ab jetzt verkauft ihr in Timbuktu teurer.' },
    b: { text: 'Wir trauen dem Bericht nicht', folgen: {},
      folgeText: 'Ihr spart das Geld.' },
    beleg: 'S. 33 Q4: Leo Africanus über Timbuktu – die Bewohner seien sehr reich, vor allem die Ausländer. Achtung: Leo schreibt um 1510, viel später als unser Spiel.',
    spielregel: 'Der Laden und sein Vorteil sind Spielregeln.',
  },
}

/* ================= Ereignisse ================= */
// mod.preis: [{ orte|'alle', waren|'alle', faktor }]
// mod.risiko: [{ art?, strecke? ['a','b'], faktor, ohne?: flag, mit?: flag }]
// mod.ankunft: [{ orte, silber, mitglied? }]   Abgabe bei Ankunft

export const EREIGNISSE = {
  ruhe: { titel: 'Ruhige Zeiten', raum: 'alle', text: 'Keine besonderen Nachrichten. Die Märkte laufen wie gewohnt.', mod: {} },
  e1: {
    titel: 'Geleit der Mongolen', raum: 'seide',
    text: 'Die Mongolen sichern die Straßen. Wer einen Geleitbrief hat, reist jetzt besonders sicher. Wer keinen hat, fällt auf.',
    beleg: 'S. 28 VT2, S. 29 Q3',
    mod: { risiko: [{ faktor: 0.6, mit: 'geleit' }, { faktor: 1.3, ohne: 'geleit' }] },
  },
  e2: {
    titel: 'Stapelrecht in Köln', raum: 'hanse',
    text: 'Köln besteht auf seinem Recht: Wer ankommt, muss die Hälfte seiner Ladung in der Stadt verkaufen.',
    beleg: 'S. 30 VT3 (1259)',
    mod: {},
  },
  e3: {
    titel: 'Die Hanse sichert ihre Kontore', raum: 'hanse',
    text: 'Auf den Strecken nach London und Nowgorod reisen Mitglieder der Hanse jetzt in großen Gruppen.',
    beleg: 'S. 24 VT1, VT2',
    mod: { risiko: [{ strecke: ['london', 'luebeck'], faktor: 0.5, mit: 'hanse' }, { strecke: ['london', 'koeln'], faktor: 0.5, mit: 'hanse' }, { strecke: ['luebeck', 'nowgorod'], faktor: 0.5, mit: 'hanse' }] },
  },
  e4: {
    titel: 'Die Hanse greift zu den Waffen', raum: 'hanse',
    text: 'Der Städtebund verteidigt den freien Handel seiner Kaufleute. Wer nicht Mitglied ist, zahlt in jeder Hansestadt 4 Silber.',
    beleg: 'S. 24 VT2: Die Städte führten sogar Kriege, wenn der freie Handel bedroht war. Die Abgabe für Nicht-Mitglieder ist eine Spielabstraktion.',
    mod: { ankunft: [{ orte: 'alle', silber: 4, mitglied: 0 }] },
  },
  e5: {
    titel: 'Zehn Tage Wüste', raum: 'sahara',
    text: 'Die Brunnen auf dem Weg sind fast leer. Wer ohne Karawane durch die Wüste zieht, riskiert alles.',
    beleg: 'S. 32 Q2 (Ibn Battuta)',
    mod: { risiko: [{ art: 'wueste', faktor: 1.5, ohne: 'karawane' }] },
  },
  e6: {
    titel: 'Salz gegen Gold', raum: 'sahara',
    text: 'Im Süden wird das Salz knapp. In Timbuktu und Djenné ist es jetzt besonders gefragt.',
    beleg: 'S. 31 VT7: Salz aus Taghaza wurde gegen Gold aus Djenné getauscht.',
    mod: { preis: [{ orte: ['timbuktu', 'djenne'], waren: ['salz'], faktor: 1.5 }] },
  },
  e7: {
    titel: 'Der König von Mali baut', raum: 'sahara',
    text: 'Der König lässt in Timbuktu eine große Moschee bauen. Kostbare Tuche und Kupfer sind dort jetzt sehr gefragt.',
    beleg: 'S. 33 Q3: Mansa Musa soll die Djinger-ber-Moschee 1325 in Auftrag gegeben haben. Die höhere Nachfrage ist eine Spielabstraktion.',
    mod: { preis: [{ orte: ['timbuktu'], waren: ['tuche', 'kupfer'], faktor: 1.4 }] },
  },
  e8: {
    titel: 'Gerücht aus Quinsai', raum: 'seide',
    text: 'In Venedig erzählt man sich, in Quinsai werde mehr gehandelt als irgendwo sonst. Glas und Fertigwaren seien dort begehrt.',
    beleg: 'S. 29 Q2 (Marco Polo). Ob das Gerücht stimmt, entscheidet ihr.',
    mod: { preis: [{ orte: ['quinsai'], waren: ['glas', 'fertig'], faktor: 1.2 }] },
  },
  e9: {
    titel: 'Hafenzoll', raum: 'hanse',
    text: 'In London und Lübeck verlangen die Zollherren eine Abgabe: 3 Silber. Mitglieder der Hanse zahlen nur 1 Silber.',
    beleg: 'S. 24 Q1: Hafenszene in Hamburg mit Zollherr und Schreiber. Zollrecht als Vorrecht der Städte: Praxis Geschichte 2/2023. Die Abstufung ist eine Spielabstraktion.',
    mod: { ankunft: [{ orte: ['london', 'luebeck'], silber: 3, mitglied: 1 }] },
  },
  e10: {
    titel: 'Die Pest kommt über die Handelswege', raum: 'alle',
    text: 'Eine Seuche breitet sich entlang der Handelswege aus. Jede Reise wird gefährlicher, und in den Städten kaufen die Menschen weniger.',
    beleg: 'Praxis Geschichte 4/2021 und 2/2023: Die Pest kam im 14. Jahrhundert aus China entlang der Handelswege nach Europa. Nicht im Schulbuch.',
    mod: { risiko: [{ faktor: 1.3 }], preis: [{ orte: 'alle', waren: 'alle', faktor: 0.85 }] },
  },
}

// Ablauf ohne Spielleitung (und Vorschlag für die Lehrkraft): Runde → Raum → Ereignis
export const STANDARD_PLAN = [
  { seide: 'e1',   hanse: 'e2', sahara: 'e5' },
  { seide: 'e8',   hanse: 'e3', sahara: 'e6' },
  { seide: 'ruhe', hanse: 'e9', sahara: 'e7' },
  { seide: 'e10',  hanse: 'e10', sahara: 'e10' },
  { seide: 'ruhe', hanse: 'e4', sahara: 'ruhe' },
]

export const HYPOTHESEN = {
  lage:   'die Lage der Stadt',
  ware:   'die wertvollste Ware',
  schutz: 'Schutz und Zusammenarbeit',
  glueck: 'Glück',
}

/* ================= Zufall (reproduzierbar) ================= */

export function hash(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// mulberry32: gleicher Seed → gleiche Zahl, auf Gerät und Server
export function zufall(seedText) {
  let a = hash(String(seedText))
  a = (a + 0x6D2B79F5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/* ================= Hilfsfunktionen ================= */

export function ereignisFuer(raumId, runde, plan) {
  const zeile = (plan || STANDARD_PLAN)[runde - 1] || {}
  const id = zeile[raumId] || 'ruhe'
  return { id, ...(EREIGNISSE[id] || EREIGNISSE.ruhe) }
}

export function nachbarn(raumId, ortId) {
  return RAEUME[raumId].strecken
    .filter((s) => s.a === ortId || s.b === ortId)
    .map((s) => ({ ort: s.a === ortId ? s.b : s.a, strecke: s }))
}

export function strecke(raumId, a, b) {
  return RAEUME[raumId].strecken.find((s) => (s.a === a && s.b === b) || (s.a === b && s.b === a)) || null
}

function passtOrt(orte, ort) { return orte === 'alle' || (Array.isArray(orte) && orte.includes(ort)) }
function passtWare(waren, ware) { return waren === 'alle' || (Array.isArray(waren) && waren.includes(ware)) }

/**
 * Preis einer Ware an einem Ort in dieser Runde.
 * marktFaktor: vom Klassenmarkt (Sättigung), sonst 1.
 */
export function preis(raumId, ortId, wareId, ereignis, marktFaktor = 1) {
  const basis = RAEUME[raumId].preise[ortId][wareId]
  let f = marktFaktor
  for (const p of (ereignis && ereignis.mod && ereignis.mod.preis) || []) {
    if (passtOrt(p.orte, ortId) && passtWare(p.waren, wareId)) f *= p.faktor
  }
  return Math.max(1, Math.round(basis * f))
}

export function verkaufspreis(team, wareId, ereignis, marktFaktor = 1) {
  let p = preis(team.raum, team.ort, wareId, ereignis, marktFaktor)
  let f = team.mods.verkaufRunde || 1
  if (team.flags.laden && team.ort === 'timbuktu') f *= 1.25
  return Math.max(1, Math.round(p * f))
}

export function ladungSumme(team) {
  return Object.values(team.ladung).reduce((s, n) => s + n, 0)
}

export function laderaum(team) {
  return team.laderaum + (team.mods.laderaumRunde || 0)
}

/**
 * Wirkung des Hanse-Schutzes: je mehr Teams Mitglied sind, desto stärker.
 * anteil = Mitglieder / Teams im Raum Hanse (ohne Klassenmarkt: 0.5 angenommen).
 */
export function hanseFaktor(anteil) {
  const a = Math.max(0, Math.min(1, anteil))
  return 0.75 - 0.4 * a   // allein Mitglied ≈ 0.7, alle Mitglied ≈ 0.35
}

/**
 * Gefahr einer Reise (0–0.9). schutzReise: Schutz, der nur für diese Reise gekauft wurde.
 */
export function risiko(team, zielOrt, ereignis, kontext = {}) {
  if (zielOrt === team.ort) return 0
  const s = strecke(team.raum, team.ort, zielOrt)
  if (!s) return 0
  const flags = { ...team.flags, ...(team.reise && team.reise.karawane ? { karawane: true } : {}) }
  let r = s.risiko

  if (team.raum === 'hanse' && flags.hanse) r *= hanseFaktor(kontext.hanseAnteil ?? 0.5)
  if (team.raum === 'seide' && flags.geleit) r *= 0.5
  if (team.raum === 'sahara' && flags.karawane) r *= s.art === 'wueste' ? 0.35 : 0.8

  const m = team.mods
  if (m.risikoReise && (!m.nurArt || m.nurArt === s.art)) r *= m.risikoReise

  for (const x of (ereignis && ereignis.mod && ereignis.mod.risiko) || []) {
    if (x.art && x.art !== s.art) continue
    if (x.strecke && !((x.strecke[0] === s.a && x.strecke[1] === s.b) || (x.strecke[0] === s.b && x.strecke[1] === s.a))) continue
    if (x.mit && !flags[x.mit]) continue
    if (x.ohne && flags[x.ohne]) continue
    r *= x.faktor
  }
  // Klassenmarkt: Wo viele ohne Schutz dieselbe Strecke fahren, wird es gefährlicher
  if (kontext.verkehr && !hatSchutz({ ...team, flags })) r *= kontext.verkehr[streckenSchluessel(s.a, s.b)] || 1
  return Math.min(0.9, Math.max(0, r))
}

export function streckenSchluessel(a, b) { return a < b ? `${a}|${b}` : `${b}|${a}` }

/** Hat das Team den Schutz seines Raums (Hanse, Geleit, Karawane für diese Reise)? */
export function hatSchutz(team) {
  const id = RAEUME[team.raum].schutz.id
  if (id === 'karawane') return !!((team.reise && team.reise.karawane) || (team.flags && team.flags.karawane))
  return !!(team.flags && team.flags[id])
}

/* ================= Klassenmarkt (Server) ================= */
// Rechnet aus den Abgaben einer Runde den Kontext der Abrechnung und die
// Marktfaktoren der nächsten Runde. abgaben: [{ raum, ort, ziel, schutz, verkaeufe: { ware: menge } }]
export const SAETTIGUNG = 0.5        // alle Teams eines Raums verkaufen dieselbe Ware am selben Ort → Preis × 0.5
export const ERHOLUNG = 0.2          // je Runde erholt sich ein gedrückter Preis um 0.2 Richtung 1
export const VERKEHR_JE_TEAM = 0.15  // jedes weitere unbeschützte Team auf derselben Strecke: Gefahr × 1.15

export function abrechnungsKontext(abgaben, teamsJeRaum) {
  const kontext = {}
  for (const raumId of Object.keys(RAEUME)) {
    const imRaum = abgaben.filter((a) => a.raum === raumId)
    const zahl = teamsJeRaum[raumId] || 0
    const mitglieder = imRaum.filter((a) => a.schutz).length
    const verkehr = {}
    const ohne = {}
    for (const a of imRaum) {
      if (a.schutz || !a.ziel || a.ziel === a.ort) continue
      const k = streckenSchluessel(a.ort, a.ziel)
      ohne[k] = (ohne[k] || 0) + 1
    }
    for (const [k, n] of Object.entries(ohne)) if (n > 1) verkehr[k] = Math.min(1.6, 1 + VERKEHR_JE_TEAM * (n - 1))
    kontext[raumId] = { hanseAnteil: raumId === 'hanse' && zahl ? mitglieder / zahl : 0.5, verkehr }
  }
  return kontext
}

export function neueFaktoren(alt, abgaben, teamsJeRaum) {
  const neu = {}
  for (const [raumId, R] of Object.entries(RAEUME)) {
    neu[raumId] = {}
    for (const ort of Object.keys(R.orte)) {
      neu[raumId][ort] = {}
      for (const w of Object.keys(R.waren)) {
        const f = ((alt[raumId] || {})[ort] || {})[w] ?? 1
        neu[raumId][ort][w] = Math.min(1, Math.round((f + ERHOLUNG) * 100) / 100)
      }
    }
    const zahl = teamsJeRaum[raumId] || 0
    if (!zahl) continue
    const verkaeufer = {}
    for (const a of abgaben.filter((x) => x.raum === raumId)) {
      for (const [w, n] of Object.entries(a.verkaeufe || {})) {
        if (n > 0 && neu[raumId][a.ort] && w in neu[raumId][a.ort]) {
          const k = `${a.ort}|${w}`
          verkaeufer[k] = (verkaeufer[k] || 0) + 1
        }
      }
    }
    for (const [k, n] of Object.entries(verkaeufer)) {
      const [ort, w] = k.split('|')
      neu[raumId][ort][w] = Math.max(0.5, Math.round(neu[raumId][ort][w] * (1 - SAETTIGUNG * (n / zahl)) * 100) / 100)
    }
  }
  return neu
}

export function gefahrStufe(r) {
  if (r <= 0) return 0
  if (r < 0.12) return 1
  if (r < 0.25) return 2
  return 3
}

/* ================= Zustand eines Handelshauses ================= */

export function neuesTeam({ team, haus, raum, ort }) {
  return {
    version: VERSION,
    team, haus, raum, ort,
    runde: 1,
    phase: 'raum',
    silber: START_SILBER,
    laderaum: START_LADERAUM,
    ladung: {},
    flags: {},
    mods: {},
    karten: {},
    reise: null,
    hypothese: { wahl: null, text: '' },
    bericht: { f1: '', f2: '', f3: '' },
    log: [],
    verlauf: [{ runde: 0, silber: START_SILBER, ort }],
    abgegeben: false,
  }
}

export function karteFuer(team) {
  const id = RAEUME[team.raum].karten[team.runde - 1]
  return id ? { id, ...KARTEN[id] } : null
}

/** Folgen einer Entscheidungskarte anwenden. Gibt den Kontorbuch-Eintrag zurück. */
export function karteAnwenden(team, kartenId, wahl) {
  const k = KARTEN[kartenId]
  let f = k[wahl].folgen
  if (f.bedingt) f = team.flags[f.bedingt.flag] ? f.bedingt.ja : f.bedingt.nein
  const vorher = team.silber
  if (f.silber) team.silber = Math.max(0, team.silber + f.silber)
  if (f.flag) team.flags[f.flag] = true
  if (f.laderaum) team.laderaum += f.laderaum
  if (f.laderaumRunde) team.mods.laderaumRunde = (team.mods.laderaumRunde || 0) + f.laderaumRunde
  if (f.verkaufRunde) team.mods.verkaufRunde = f.verkaufRunde
  if (f.risikoReise) { team.mods.risikoReise = f.risikoReise; team.mods.nurArt = k[wahl].folgen.nurArt || null }
  if (f.koelnFrei) team.flags.koelnFrei = true
  if (f.info) team.mods.info = true
  team.karten[kartenId] = wahl
  return { art: 'karte', karte: kartenId, wahl, text: `Entscheidung „${k.titel}“ – ${k[wahl].text}`, silber: team.silber - vorher }
}

/** Kaufen (+n) oder verkaufen (−n). Gibt Fehlertext oder null zurück. */
export function handeln(team, wareId, menge, ereignis, marktFaktoren = {}) {
  const raum = RAEUME[team.raum]
  const mf = marktFaktoren[wareId] || 1
  if (menge > 0) {
    if (!raum.orte[team.ort].angebot.includes(wareId)) return 'Diese Ware gibt es hier nicht zu kaufen.'
    const p = preis(team.raum, team.ort, wareId, ereignis, mf)
    if (team.silber < p * menge) return 'Dafür reicht euer Silber nicht.'
    if (ladungSumme(team) + menge > laderaum(team)) return 'Euer Laderaum ist voll.'
    team.silber -= p * menge
    team.ladung[wareId] = (team.ladung[wareId] || 0) + menge
    buchen(team, wareId, menge, -p * menge)
  } else if (menge < 0) {
    const n = Math.min(-menge, team.ladung[wareId] || 0)
    if (!n) return 'Davon habt ihr nichts geladen.'
    const p = verkaufspreis(team, wareId, ereignis, mf)
    team.silber += p * n
    team.ladung[wareId] -= n
    if (!team.ladung[wareId]) delete team.ladung[wareId]
    buchen(team, wareId, -n, p * n)
  }
  return null
}

// Handel einer Runde im Kontorbuch zusammenfassen (eine Zeile je Ware und Richtung)
function buchen(team, wareId, menge, silber) {
  const art = menge > 0 ? 'kauf' : 'verkauf'
  const e = team.log.find((x) => x.runde === team.runde && x.art === art && x.ware === wareId && x.ort === team.ort)
  if (e) { e.menge += Math.abs(menge); e.silber += silber }
  else team.log.push({ runde: team.runde, art, ware: wareId, ort: team.ort, menge: Math.abs(menge), silber })
}

/**
 * Reise abrechnen: Gefahr würfeln, ankommen, Ankunftsregeln (Stapelrecht, Zoll).
 * seed: auf dem Server je Runde fest; im Gerät aus Team und Runde.
 * Gibt die Kontorbuch-Einträge der Reise zurück.
 */
export function reiseAbrechnen(team, ereignis, seed, kontext = {}) {
  const raum = RAEUME[team.raum]
  const ziel = team.reise ? team.reise.ziel : team.ort
  const eintraege = []
  const r = risiko(team, ziel, ereignis, kontext)
  const s = strecke(team.raum, team.ort, ziel)

  if (ziel !== team.ort) {
    const wurf = zufall(`${seed}|${team.team}|${team.runde}`)
    if (wurf < r) {
      const verloren = {}
      for (const [w, n] of Object.entries(team.ladung)) {
        const weg = Math.ceil(n / 2)
        verloren[w] = weg
        team.ladung[w] = n - weg
        if (!team.ladung[w]) delete team.ladung[w]
      }
      let silberWeg = 0
      if (!Object.keys(verloren).length) { silberWeg = Math.min(team.silber, 4); team.silber -= silberWeg }
      eintraege.push({ art: 'unglueck', strecke: s.art, verloren, silber: -silberWeg, risiko: r, text: unglueckText(s.art, ereignis) })
    } else {
      eintraege.push({ art: 'reise', text: `Sicher angekommen in ${raum.orte[ziel].name} (${s.name}).`, risiko: r })
    }
    team.ort = ziel
    eintraege.push(...ankunft(team, ereignis))
  } else {
    eintraege.push({ art: 'reise', text: `Ihr bleibt in ${raum.orte[ziel].name}.`, risiko: 0 })
  }

  for (const e of eintraege) team.log.push({ runde: team.runde, ...e })
  return eintraege
}

function unglueckText(art, ereignis) {
  if (ereignis && ereignis.id === 'e10') return 'Unterwegs bricht die Seuche aus. Ein Teil eurer Ladung ist verloren.'
  return ({
    see: 'Ein Sturm! Ihr müsst einen Teil der Ladung über Bord werfen.',
    land: 'Überfall auf der Straße! Räuber nehmen einen Teil eurer Ladung.',
    wueste: 'Das Wasser geht aus, Kamele brechen zusammen. Ein Teil eurer Ladung bleibt in der Wüste.',
    fluss: 'Ein Boot kentert auf dem Niger. Ein Teil eurer Ladung ist verloren.',
  })[art] || 'Unglück unterwegs. Ein Teil eurer Ladung ist verloren.'
}

function ankunft(team, ereignis) {
  const e = []
  // Stapelrecht Köln (gilt immer, S. 30 VT3)
  if (team.raum === 'hanse' && team.ort === 'koeln' && Object.keys(team.ladung).length) {
    if (team.flags.koelnFrei) {
      delete team.flags.koelnFrei
      e.push({ art: 'regel', text: 'Ihr habt Köln umgangen: Das Stapelrecht gilt diesmal nicht für euch.' })
    } else {
      let erloes = 0
      const verkauft = {}
      for (const [w, n] of Object.entries(team.ladung)) {
        const k = Math.ceil(n / 2)
        const p = preis('hanse', 'koeln', w, ereignis)
        erloes += k * p
        verkauft[w] = k
        team.ladung[w] = n - k
        if (!team.ladung[w]) delete team.ladung[w]
      }
      team.silber += erloes
      e.push({ art: 'regel', verkauft, silber: erloes,
        text: `Stapelrecht: Ihr musstet die Hälfte eurer Ladung in Köln anbieten. Kölner Kaufleute zahlen ${erloes} Silber.` })
    }
  }
  for (const a of (ereignis && ereignis.mod && ereignis.mod.ankunft) || []) {
    if (!passtOrt(a.orte, team.ort)) continue
    const betrag = team.flags.hanse && a.mitglied != null ? a.mitglied : a.silber
    if (!betrag) continue
    const zahl = Math.min(team.silber, betrag)
    team.silber -= zahl
    e.push({ art: 'abgabe', silber: -zahl, text: `${ereignis.titel}: Ihr zahlt ${zahl} Silber.` })
  }
  return e
}

/** Nach der Abrechnung: Runde abschließen, Rundenwirkungen zurücksetzen. */
export function rundeAbschliessen(team) {
  // wert = Kasse + Ladung zum Basispreis am Ort (sonst sieht jeder Einkauf wie ein Verlust aus)
  team.verlauf.push({ runde: team.runde, silber: team.silber, wert: team.silber + ladungWert(team, null), ort: team.ort, ladung: ladungSumme(team) })
  team.mods = {}
  team.reise = null
  team.runde += 1
}

/** Wert der Ladung am aktuellen Ort (für die Bilanz). */
export function ladungWert(team, ereignis) {
  return Object.entries(team.ladung).reduce((s, [w, n]) => s + n * preis(team.raum, team.ort, w, ereignis), 0)
}
