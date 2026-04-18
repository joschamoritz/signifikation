import { describe, it, expect } from 'vitest'
import {
  createClassroomSession,
  startClassroomSession,
  finishClassroomSession,
  joinClassroomSession,
  submitClassroomRound,
  getExportRowsForSession,
} from '../classroom-store.js'

describe('classroom service', () => {
  it('erzwingt gueltige Lifecycle-Uebergaenge', () => {
    const teacherUserId = `teacher-lifecycle-${Date.now()}`
    const created = createClassroomSession({ teacherUserId })

    expect(created.session.state).toBe('lobby')

    const started = startClassroomSession({
      sessionId: created.session.id,
      teacherUserId,
      allowLateJoin: false,
    })
    expect(started.error).toBeUndefined()
    expect(started.session.state).toBe('running')

    const invalidSecondStart = startClassroomSession({
      sessionId: created.session.id,
      teacherUserId,
      allowLateJoin: true,
    })
    expect(invalidSecondStart.error).toBe('INVALID_STATE')

    const finished = finishClassroomSession({
      sessionId: created.session.id,
      teacherUserId,
    })
    expect(finished.error).toBeUndefined()
    expect(finished.session.state).toBe('finished')
  })

  it('schreibt Submissions idempotent per Upsert', () => {
    const teacherUserId = `teacher-idempotent-${Date.now()}`
    const created = createClassroomSession({ teacherUserId })
    const sessionId = created.session.id

    const started = startClassroomSession({
      sessionId,
      teacherUserId,
      allowLateJoin: true,
    })
    expect(started.error).toBeUndefined()

    const joined = joinClassroomSession({ code: created.joinCode })
    expect(joined.error).toBeUndefined()

    const firstSubmit = submitClassroomRound({
      sessionId,
      participantId: joined.participant.id,
      participantToken: joined.participant.token,
      roundNo: 1,
      payload: { source: 'first' },
      score: 4,
      maxScore: 10,
    })
    expect(firstSubmit.error).toBeUndefined()

    const secondSubmit = submitClassroomRound({
      sessionId,
      participantId: joined.participant.id,
      participantToken: joined.participant.token,
      roundNo: 1,
      payload: { source: 'second' },
      score: 9,
      maxScore: 10,
    })
    expect(secondSubmit.error).toBeUndefined()

    const rows = getExportRowsForSession({ sessionId })
    const submissionRows = rows.filter((row) => row.round_no != null)

    expect(submissionRows).toHaveLength(1)
    expect(submissionRows[0].score).toBe(9)
    expect(submissionRows[0].max_score).toBe(10)
  })
})
