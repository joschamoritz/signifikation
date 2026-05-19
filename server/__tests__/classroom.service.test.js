import { describe, it, expect } from 'vitest'
import {
  createClassroomSession,
  startClassroomSession,
  finishClassroomSession,
  joinClassroomSession,
  submitClassroomRound,
  getExportRowsForSession,
} from '../classroom-store.js'

const SESSION_MAX_PARTICIPANTS = 50

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

  it('verweigert Join wenn Session voll ist (Limit atomisch geprüft)', () => {
    const teacherUserId = `teacher-full-${Date.now()}`
    const created = createClassroomSession({ teacherUserId })
    const sessionId = created.session.id

    for (let i = 0; i < SESSION_MAX_PARTICIPANTS; i++) {
      const result = joinClassroomSession({ code: created.joinCode })
      expect(result.error).toBeUndefined()
    }

    const overflow = joinClassroomSession({ code: created.joinCode })
    expect(overflow.error).toBe('SESSION_FULL')
  })

  it('verweigert Submit mit zu großem Payload', () => {
    const teacherUserId = `teacher-payload-${Date.now()}`
    const created = createClassroomSession({ teacherUserId })
    const sessionId = created.session.id

    startClassroomSession({ sessionId, teacherUserId, allowLateJoin: true })
    const joined = joinClassroomSession({ code: created.joinCode })

    const oversizedPayload = { data: 'x'.repeat(5000) }
    const result = submitClassroomRound({
      sessionId,
      participantId: joined.participant.id,
      participantToken: joined.participant.token,
      roundNo: 1,
      payload: oversizedPayload,
      score: 5,
      maxScore: 10,
    })
    expect(result.error).toBe('PAYLOAD_TOO_LARGE')
  })

  it('ignoriert Mehrfach-Submissions – erste Abgabe gilt', () => {
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
    // Zweite Abgabe wird ignoriert – erste Score bleibt erhalten
    expect(submissionRows[0].score).toBe(4)
    expect(submissionRows[0].max_score).toBe(10)
  })
})
