export default function ClassroomRaster({ rasterStatus }) {
  return (
    <nav className="cr-raster" aria-label="Klassenraum-Übersicht">
      <div className="cr-raster-content">
        <span className="cr-raster-label" aria-hidden="true">Klassenraum</span>
        <span
          className={`cr-raster-center${rasterStatus.isRunning ? ' cr-raster-center--running' : ''}`}
          aria-live="polite"
          aria-atomic="true"
        >
          {rasterStatus.center}
        </span>
        <span className="cr-raster-right">{rasterStatus.right}</span>
      </div>
    </nav>
  )
}
