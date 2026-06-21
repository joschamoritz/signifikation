// Dispatcher: rendert je Aufgaben-Format (F1–F5) die passende interaktive
// Komponente. Das Item ist bereits serverseitig aufgelöst (resolve=interactive).

import MatchingTask from './MatchingTask'
import MarkingTask  from './MarkingTask'
import VariantTask  from './VariantTask'
import GapTask      from './GapTask'
import DataTask     from './DataTask'

const REGISTRY = {
  F1: MatchingTask, // Zuordnen
  F2: MarkingTask,  // Markieren
  F3: VariantTask,  // Variantenvergleich
  F4: GapTask,      // Lücke + Begründung
  F5: DataTask,     // Datenblick
}

export default function TaskPlayer({ task, index }) {
  const Comp = REGISTRY[task?.format]
  if (!Comp) {
    return (
      <div className="course-task">
        <p className="course-muted">Format {task?.format ?? '?'} wird noch nicht unterstützt.</p>
      </div>
    )
  }
  return <Comp task={task} index={index} />
}
