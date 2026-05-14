export function ClassroomExplanationCard({ isTeacher = false, isLoggedIn = false, onNavigateToKonto = () => {} }) {
  return (
    <li className="test-entry test-drop-cap">
      <div className="test-entry-number" aria-hidden="true">
        <span className="test-entry-num-glyph">①</span>
        <span className="test-entry-marginalia">ERKL.</span>
        <span className="test-entry-premium" aria-label="Teil der Gesamtausgabe">Gesamtausgabe</span>
      </div>
      <div className="test-entry-body">
        <div className="test-entry-head">
          <span className="test-dropcap-k" aria-hidden="true">K</span>
          <span className="test-headword" aria-label="Klassenraum">lassenraum</span>
          <span className="test-ipa">[ˈklasənˌʀaʊ̯m]</span>
        </div>
        <div className="test-entry-grammar">
          <span className="test-pos">Bereich</span>
          <span className="test-pos-rule" />
          <span className="test-entry-category">Lehrkräfte</span>
        </div>
        <p className="cr-definition">
          Kollaborative Spielsitzungen für Gruppen und Schulklassen. Lehrkräfte öffnen eine Sitzung und steuern den Ablauf im eigenen Takt — Lernende treten anonym mit einem Zugangscode bei und spielen gleichzeitig auf ihrem Gerät.
        </p>
        <ul className="cr-feature-list">
          <li>Echtzeit-Überblick über Beteiligung und Abgaben während der Sitzung.</li>
          <li>Spielergebnisse aller vier Modi werden automatisch übertragen.</li>
          <li>Nach der Sitzung: Auswertung nach Spielmodus, Export als CSV oder PDF.</li>
        </ul>
        {!isTeacher && (
          <div className="cr-teacher-prompt">
            <p className="cr-teacher-prompt-text">
              {isLoggedIn
                ? 'Klasse leiten · Für Lehrkräfte mit Gesamtausgabe.'
                : 'Klasse leiten · Bitte anmelden, um Sitzungen zu erstellen.'}
            </p>
            <button type="button" className="test-cta" onClick={onNavigateToKonto}>
              {isLoggedIn ? 'Zum Konto →' : 'Anmelden →'}
            </button>
          </div>
        )}
      </div>
    </li>
  )
}

export function TeacherSessionCard({
  sessionNameInput,
  setSessionNameInput,
  createSession,
  creating,
  createNotice,
  lastJoinCode,
  codeCopied,
  onCopyJoinCode,
  activeSession,
  mapSessionState,
  formatDateTime,
  updateSessionState,
}) {
  return (
    <li className="test-entry">
      <div className="test-entry-number" aria-hidden="true">
        <span className="test-entry-num-glyph">②</span>
        <span className="test-entry-marginalia">SITZG.</span>
      </div>
      <div className="test-entry-body">
        <div className="test-entry-head">
          <span className="test-headword">Sitzung</span>
          <span className="test-ipa">[ˈzɪt͡sʊŋ]</span>
        </div>
        <div className="test-entry-grammar">
          <span className="test-pos">Verwaltung</span>
          <span className="test-pos-rule" />
          <span className="test-entry-category">Vorbereitung</span>
        </div>

        <div className="cr-section">
          <div className="cr-create-row">
            <input
              className="cr-input"
              value={sessionNameInput}
              onChange={(e) => setSessionNameInput(e.target.value)}
              placeholder="Klasse oder Kurs (optional)"
              maxLength={60}
              aria-label="Name der Session"
            />
            <button className="test-cta" type="button" onClick={createSession} disabled={creating}>
              Erstellen →
            </button>
          </div>
          {createNotice && <p className="cr-note">{createNotice}</p>}

          {lastJoinCode && (
            <div className="cr-code-block" aria-live="polite">
              <span className="cr-section-label">Zugangscode</span>
              <div className="cr-code-row">
                <span className="cr-code-value">{lastJoinCode}</span>
                <button type="button" className="cr-code-copy" onClick={onCopyJoinCode}>
                  {codeCopied ? 'Kopiert' : 'Kopieren'}
                </button>
              </div>
            </div>
          )}

          {activeSession && (
            <div className="cr-active-controls">
              <p className="cr-session-meta">
                <span className={activeSession.state === 'running' ? 'cr-state-running' : ''}>
                  {mapSessionState(activeSession.state)}
                </span>
                {activeSession.startedAt && (
                  <><span className="cr-meta-sep">·</span><span>gestartet {formatDateTime(activeSession.startedAt)}</span></>
                )}
                {activeSession.finishedAt && (
                  <><span className="cr-meta-sep">·</span><span>beendet {formatDateTime(activeSession.finishedAt)}</span></>
                )}
              </p>
              <p className="cr-action-row">
                <button
                  className="test-cta"
                  type="button"
                  onClick={() => updateSessionState('start')}
                  disabled={activeSession.state === 'running' || activeSession.state === 'finished' || activeSession.state === 'archived'}
                >
                  Starten
                </button>
                <span className="cr-action-sep">·</span>
                <button
                  className="test-cta"
                  type="button"
                  onClick={() => updateSessionState('finish')}
                  disabled={activeSession.state === 'finished' || activeSession.state === 'archived'}
                >
                  Beenden
                </button>
              </p>
            </div>
          )}
        </div>
      </div>
    </li>
  )
}

export function StudentJoinCard({
  participantInfo,
  joinSession,
  joining,
  joinCodeInput,
  setJoinCodeInput,
  sanitizeJoinCodeInput,
  joinNotice,
  participantSession,
  socketConnected,
  requestJoinRefresh,
  socketError,
  hostCountdown,
  leaveSession,
}) {
  return (
    <li className="test-entry">
      <div className="test-entry-number" aria-hidden="true">
        <span className="test-entry-num-glyph">②</span>
        <span className="test-entry-marginalia">BEITR.</span>
      </div>
      <div className="test-entry-body">
        <div className="test-entry-head">
          <span className="test-headword">Beitritt</span>
          <span className="test-ipa">[ˈbaɪ̯tʁɪt]</span>
        </div>
        <div className="test-entry-grammar">
          <span className="test-pos">Teilnahme</span>
          <span className="test-pos-rule" />
          <span className="test-entry-category">Vorbereitung</span>
        </div>

        <div className="cr-section">
          {!participantInfo ? (
            <>
              <form className="cr-join-form" onSubmit={(e) => { e.preventDefault(); joinSession() }}>
                <input
                  className="cr-input"
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(sanitizeJoinCodeInput(e.target.value))}
                  placeholder="zugangscode"
                  maxLength={20}
                  autoComplete="off"
                  aria-label="Zugangscode"
                />
                <button className="test-cta" type="submit" disabled={joining}>Beitreten →</button>
              </form>
              {joinNotice && <p className="cr-note">{joinNotice}</p>}
            </>
          ) : (
            <div className="cr-joined-status">
              <p className="cr-session-meta">
                {participantSession?.settings?.name && (
                  <><span className="cr-session-name-it">{participantSession.settings.name}</span><span className="cr-meta-sep">·</span></>
                )}
                <span className={participantSession?.state === 'running' ? 'cr-state-running' : ''}>
                  {socketConnected
                    ? (participantSession?.state === 'running' ? 'Läuft' : 'Verbunden')
                    : participantSession?.state || ''}
                </span>
              </p>
              {(participantSession?.state === 'lobby' || participantSession?.state === 'created') && socketConnected && (
                <p className="cr-hint">
                  Warte auf den Start durch die Lehrkraft.{' '}
                  <button type="button" className="cr-refresh-btn" onClick={requestJoinRefresh}>Aktualisieren</button>
                </p>
              )}
              {socketError && <p className="cr-error">{socketError}</p>}
              {hostCountdown > 0 && (
                <p className="cr-error">Verbindung unterbrochen. Sitzung endet in {hostCountdown}s.</p>
              )}
              <p className="cr-action-row" style={{ marginTop: '12px' }}>
                <button type="button" className="test-cta" onClick={leaveSession}>
                  Sitzung verlassen
                </button>
              </p>
            </div>
          )}
        </div>
      </div>
    </li>
  )
}

export function TeacherLiveCard({ activeSession, timerTick, formatElapsed, dashboard, formatStagnation, roundGameName, gameLabels }) {
  return (
    <li className={`test-entry${!activeSession || activeSession.state === 'created' ? ' test-entry--disabled' : ''}`}>
      <div className="test-entry-number" aria-hidden="true">
        <span className="test-entry-num-glyph">③</span>
        <span className="test-entry-marginalia">LIVE</span>
      </div>
      <div className="test-entry-body">
        <div className="test-entry-head">
          <span className="test-headword">Live</span>
          <span className="test-ipa">[laɪ̯f]</span>
        </div>
        <div className="test-entry-grammar">
          <span className="test-pos">Echtzeit</span>
          <span className="test-pos-rule" />
          <span className="test-entry-category">Durchführung</span>
        </div>
        {!activeSession || activeSession.state === 'created' ? (
          <p className="cr-hint">Starte eine Sitzung unter ②.</p>
        ) : (
          <div className="cr-section">
            {activeSession.startedAt && (
              <p className="cr-timer" aria-live="polite" aria-atomic="true">
                {timerTick >= 0 && formatElapsed(activeSession.startedAt)}
                {activeSession.state === 'running' && <span className="cr-timer-running"> läuft</span>}
              </p>
            )}
            {dashboard?.metrics && (
              <p className="cr-metric-line">
                <span className="cr-metric-value">{dashboard.metrics.submitted_count}</span>
                <span className="cr-metric-of"> von </span>
                <span className="cr-metric-value">{dashboard.metrics.total_count}</span>
                <span className="cr-metric-label"> abgegeben</span>
                <span className="cr-metric-dot"> · </span>
                <span className="cr-metric-value">{dashboard.metrics.connected_count}</span>
                <span className="cr-metric-label"> verbunden</span>
              </p>
            )}
            {dashboard?.metrics?.last_submission_at && activeSession.state === 'running' && (
              <p className="cr-stagnation">
                Letzte Abgabe {formatStagnation(dashboard.metrics.last_submission_at)}
              </p>
            )}
            {activeSession.startedAt && dashboard && (
              <ul className="cr-live-list" aria-label="Abgaben je Spielmodus">
                {[1, 2, 3, 4].map((roundNo) => {
                  const gameKey = roundGameName[roundNo]
                  const gameData = dashboard.perGame?.find((g) => g.roundNo === roundNo)
                  const count = gameData?.participantCount ?? 0
                  const total = dashboard.metrics?.total_count ?? 0
                  return (
                    <li key={roundNo} className="cr-live-row">
                      <span className="cr-live-game">{gameLabels[gameKey] ?? `Modus ${roundNo}`}</span>
                      <span className="cr-live-bar-wrap" aria-hidden="true">
                        <span className="cr-live-bar" style={{ width: total > 0 ? `${Math.round((count / total) * 100)}%` : '0%' }} />
                      </span>
                      <span className="cr-live-num">{count}</span>
                      <span className="cr-live-avg">
                        {gameData && count > 0 ? `⌀\u202f${gameData.avgScore}` : '—'}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </li>
  )
}

export function StudentSubmissionsCard({ participantInfo, participantSession, submittedGames, gameLabels }) {
  return (
    <li className={`test-entry${!participantInfo ? ' test-entry--disabled' : ''}`}>
      <div className="test-entry-number" aria-hidden="true">
        <span className="test-entry-num-glyph">③</span>
        <span className="test-entry-marginalia">ABGB.</span>
      </div>
      <div className="test-entry-body">
        <div className="test-entry-head">
          <span className="test-headword">Abgaben</span>
          <span className="test-ipa">[ˈapˌɡaːbən]</span>
        </div>
        <div className="test-entry-grammar">
          <span className="test-pos">Ergebnisse</span>
          <span className="test-pos-rule" />
          <span className="test-entry-category">Durchführung</span>
        </div>
        {!participantInfo ? (
          <p className="cr-hint">Tritt einer Sitzung unter ② bei, um zu spielen.</p>
        ) : (participantSession?.state === 'lobby' || participantSession?.state === 'created') ? (
          <p className="cr-hint">Die Sitzung hat noch nicht begonnen. Dein Ergebnis wird nach dem Start automatisch übertragen.</p>
        ) : (participantSession?.state === 'finished' || participantSession?.state === 'archived') ? (
          <>
            {submittedGames.length > 0 ? (
              <ul className="cr-submitted-list">
                {submittedGames.map(({ game, score, maxScore }) => (
                  <li key={game} className="cr-submitted-item">
                    <span className="cr-submitted-check">✓</span>
                    <span className="cr-submitted-name">{gameLabels[game] ?? game}</span>
                    {maxScore > 0 && <span className="cr-submitted-score">{score}&thinsp;/&thinsp;{maxScore}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="cr-hint">Sitzung beendet.</p>
            )}
          </>
        ) : submittedGames.length === 0 ? (
          <p className="cr-hint">Wechsel zu „Spielmodi" und spiele — dein Ergebnis wird automatisch übertragen.</p>
        ) : (
          <ul className="cr-submitted-list">
            {submittedGames.map(({ game, score, maxScore }) => (
              <li key={game} className="cr-submitted-item">
                <span className="cr-submitted-check">✓</span>
                <span className="cr-submitted-name">{gameLabels[game] ?? game}</span>
                {maxScore > 0 && <span className="cr-submitted-score">{score}&thinsp;/&thinsp;{maxScore}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  )
}

export function TeacherProtocolCard({ activeSession, dashboard, requestingExport, requestExport, exportsError, exportsList, formatDateTime, activeSessionId, api }) {
  return (
    <li className={`test-entry${activeSession?.state !== 'finished' ? ' test-entry--disabled' : ''}`}>
      <div className="test-entry-number" aria-hidden="true">
        <span className="test-entry-num-glyph">④</span>
        <span className="test-entry-marginalia">PROT.</span>
      </div>
      <div className="test-entry-body">
        <div className="test-entry-head">
          <span className="test-headword">Protokoll</span>
          <span className="test-ipa">[pʁotoˈkɔl]</span>
        </div>
        <div className="test-entry-grammar">
          <span className="test-pos">Auswertung</span>
          <span className="test-pos-rule" />
          <span className="test-entry-category">Nachbereitung</span>
        </div>
        {activeSession?.state !== 'finished' ? (
          <p className="cr-hint">Verfügbar nach Abschluss der Sitzung unter ②.</p>
        ) : (
          <div className="cr-section">
            {dashboard?.perGame?.length > 0 && (
              <div className="cr-per-game">
                <span className="cr-section-label">Spielmodus-Auswertung</span>
                <ul className="cr-per-game-list">
                  {dashboard.perGame.map((g) => (
                    <li key={g.roundNo} className="cr-per-game-row">
                      <span className="cr-per-game-name">{g.label}</span>
                      <span className="cr-per-game-bar-wrap">
                        <span className="cr-per-game-bar" style={{ width: `${Math.round((g.avgScore / Math.max(g.avgMaxScore, 1)) * 100)}%` }} />
                      </span>
                      <span className="cr-per-game-score">{g.avgScore}&thinsp;/&thinsp;{g.avgMaxScore}</span>
                      <span className="cr-per-game-count">{g.participantCount} Abg.</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="cr-export-block">
              <span className="cr-section-label">Exportieren</span>
              <p className="cr-action-row">
                <button className="test-cta" type="button" onClick={() => requestExport('csv')} disabled={requestingExport === 'csv'}>CSV</button>
                <span className="cr-action-sep">·</span>
                <button className="test-cta" type="button" onClick={() => requestExport('pdf')} disabled={requestingExport === 'pdf'}>PDF</button>
              </p>
              {exportsError && <p className="cr-error">{exportsError}</p>}
              {exportsList.length > 0 && (
                <ul className="cr-export-list">
                  {exportsList.map((e) => (
                    <li key={e.id} className="cr-export-item">
                      <span className="cr-export-type">{e.type.toUpperCase()}</span>
                      <span className="cr-export-status">{e.status}</span>
                      <span className="cr-export-date">{formatDateTime(e.createdAt)}</span>
                      {e.status === 'done' && (
                        <a className="cr-export-link" href={`${api}/classroom/sessions/${activeSessionId}/exports/${e.id}/download`} target="_blank" rel="noreferrer">
                          Download
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </li>
  )
}
