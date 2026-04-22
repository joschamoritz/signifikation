export default function ClassroomRaster({ rasterStatus }) {
  return (
    <nav className="test-raster cr-raster" aria-label="Klassenraum-Übersicht">
      <span className="test-raster-label cr-raster-label" aria-hidden="true">Klassenraum</span>
      <div className="test-raster-words">
        <span
          className={`test-raster-word cr-raster-center${rasterStatus.isRunning ? ' cr-raster-center--running' : ''}`}
          aria-live="polite"
          aria-atomic="true"
        >
          {rasterStatus.center}
        </span>
      </div>
      <div className="test-raster-end">
        <span className="test-raster-folio cr-raster-right">{rasterStatus.right}</span>
      </div>
    </nav>
  )
}
