// Dispatcher: rendert je Aufgaben-Format (F1–F5) die passende interaktive
// Komponente. Das Item ist bereits serverseitig aufgelöst (resolve=interactive).

import MatchingTask   from './MatchingTask'
import MarkingTask    from './MarkingTask'
import LabelTask      from './LabelTask'
import VerschiebeTask from './VerschiebeTask'
import VariantTask    from './VariantTask'
import GapTask        from './GapTask'
import DataTask       from './DataTask'
import KwicTask       from './KwicTask'
import AnnotateTask   from './AnnotateTask'

const REGISTRY = {
  F1:         MatchingTask,   // Zuordnen
  F2:         MarkingTask,    // Markieren
  F3:         VariantTask,    // Variantenvergleich
  F4:         GapTask,        // Lücke + Begründung
  F5:         DataTask,       // Datenblick
  LABEL:      LabelTask,      // Funktion zuweisen (S/P/O, Kopf/Dependent, Wortart)
  VERSCHIEBE: VerschiebeTask, // Verschiebeprobe am topologischen Feld
  KWIC:       KwicTask,       // Konkordanz lesen (echte Belegzeilen) → Partner finden
  ANNOTATE:   AnnotateTask,   // automatische Annotation: den Maschinenfehler finden
}

// Markier-Aufgaben mit Funktionszuweisung (S/P/O, Kopf/Dependent, Wortart)
// brauchen die LabelTask – unabhängig vom Format. Sonst landet z. B. die als F3
// geführte Kopf/Dependent-Aufgabe fälschlich im VariantTask (keine Varianten → leer).
const LABEL_MARK_TASKS = new Set(['S-P-O', 'kopf-dependent', 'felder', 'wortart'])

// Registry-Schlüssel je Aufgabe wählen (Payload-Form hat Vorrang vor Format-
// Etikett). Station ④ führt Datenblick-Aufgaben (Tabelle + Fragen) teils als F2;
// ohne diese Korrektur landen sie im MarkingTask (erwartet sentence) → leer.
function registryKey(task) {
  const p = task?.payload ?? {}
  const mt = p.markTask
  if (mt && LABEL_MARK_TASKS.has(mt)) return 'LABEL'
  if (mt === 'kollokation') return 'F2'
  // Annotation-Fehler finden (automatische Annotation, Station ④).
  if (Array.isArray(p.annotations)) return 'ANNOTATE'
  // KWIC/Konkordanz: echte Belegzeilen als Aufgabenkörper.
  if (Array.isArray(p.lines)) return 'KWIC'
  // Verschiebeprobe (Feldermodell): Chunks + festes Verb.
  if (Array.isArray(p.chunks) && p.verb) return 'VERSCHIEBE'
  // Tabellen-/Frage-Aufgabe → Datenblick (DataTask), egal wie etikettiert.
  if (Array.isArray(p.table) && Array.isArray(p.questions)) return 'F5'
  return task?.format
}

// onChecked: optional, wird bei „Prüfen" mit dem Ergebnis (true|false|null)
//   ausgelöst — Pager-Zählung + Persistenz (TaskGate) hängen daran.
// canRetry/lockedNote: von TaskGate gesetzt — false sperrt „Nochmal" nach Abgabe.
export default function TaskPlayer({ task, index, onChecked, canRetry = true, lockedNote = null }) {
  const Comp = REGISTRY[registryKey(task)]
  if (!Comp) {
    return (
      <div className="course-task">
        <p className="course-muted">Format {task?.format ?? '?'} wird noch nicht unterstützt.</p>
      </div>
    )
  }
  return <Comp task={task} index={index} onChecked={onChecked} canRetry={canRetry} lockedNote={lockedNote} />
}
