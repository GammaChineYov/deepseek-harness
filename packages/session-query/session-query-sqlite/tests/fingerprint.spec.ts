import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SESSION_FORMAT_VERSION, SessionId, SessionLogOffset, SessionSeq } from '@deepseek-ai/dsh-session'
import type { SessionEvent, SessionHeader } from '@deepseek-ai/dsh-session'
import { fingerprintSessionLog } from '../src/fingerprint.ts'

function header(id: string): SessionHeader {
  return {
    version: SESSION_FORMAT_VERSION,
    id: SessionId(id),
    createdAt: 1,
    isSeeded: false,
    cwd: '/workspace',
  }
}

function messageEvent(seq: number, text: string): SessionEvent {
  return {
    type: 'user/message',
    seq: SessionSeq(seq),
    time: seq + 1,
    data: createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }),
    surfaceOp: 'append',
  }
}

/** The single-string encoding the incremental fingerprint must reproduce byte for byte. */
function wholePayloadFingerprint(
  sessionHeader: SessionHeader,
  inheritedEventCount: SessionLogOffset,
  events: readonly SessionEvent[],
): string {
  return createHash('sha256')
    .update(JSON.stringify({ header: sessionHeader, inheritedEventCount, events }))
    .digest('base64url')
}

describe('session log fingerprint', () => {
  it('matches the whole-payload encoding for an empty log', () => {
    const sessionHeader = header('s')
    expect(fingerprintSessionLog(sessionHeader, SessionLogOffset(0), []))
      .toBe(wholePayloadFingerprint(sessionHeader, SessionLogOffset(0), []))
  })

  it('matches the whole-payload encoding across header, count, and event boundaries', () => {
    const sessionHeader = header('s')
    const events = [messageEvent(0, 'alpha'), messageEvent(1, 'beta'), messageEvent(2, 'gamma')]
    expect(fingerprintSessionLog(sessionHeader, SessionLogOffset(2), events))
      .toBe(wholePayloadFingerprint(sessionHeader, SessionLogOffset(2), events))
  })

  it('keeps the header and inherited count inside the hashed bytes', () => {
    const events = [messageEvent(0, 'alpha')]
    const base = fingerprintSessionLog(header('s'), SessionLogOffset(0), events)
    expect(fingerprintSessionLog(header('other'), SessionLogOffset(0), events)).not.toBe(base)
    expect(fingerprintSessionLog(header('s'), SessionLogOffset(1), events)).not.toBe(base)
    expect(fingerprintSessionLog(header('s'), SessionLogOffset(0), [...events, messageEvent(1, 'beta')])).not.toBe(base)
  })

  it('reproduces embedded quotes and newlines exactly as the whole-payload encoding escapes them', () => {
    const sessionHeader = header('s')
    const events = [messageEvent(0, 'quote " backslash \\ newline \n tab \t')]
    expect(fingerprintSessionLog(sessionHeader, SessionLogOffset(0), events))
      .toBe(wholePayloadFingerprint(sessionHeader, SessionLogOffset(0), events))
  })

  it('hashes a log whose joined payload exceeds the single-string limit', () => {
    const sessionHeader = header('s')
    // Each piece is a legal string on its own, but the payload-level encoding has
    // to join them into one, which is exactly what the incremental form avoids.
    // Two 257 MiB pieces land just 2 MiB past the 512 MiB ceiling, so the case
    // stays under the memory a parallel test file budget can spare.
    const chunk = 'x'.repeat(0x10100000)
    const events = [messageEvent(0, chunk), messageEvent(1, chunk)]
    const payload = { header: sessionHeader, inheritedEventCount: SessionLogOffset(0), events }
    expect(() => JSON.stringify(payload)).toThrow(RangeError)

    const fingerprint = fingerprintSessionLog(sessionHeader, SessionLogOffset(0), events)
    expect(fingerprint).toHaveLength(43)

    // The same byte stream remains checkable when it is hashed in pieces.
    const hash = createHash('sha256')
    hash.update('{"header":')
    hash.update(JSON.stringify(sessionHeader))
    hash.update(',"inheritedEventCount":')
    hash.update(JSON.stringify(SessionLogOffset(0)))
    hash.update(',"events":[')
    hash.update(JSON.stringify(events[0]))
    hash.update(',')
    hash.update(JSON.stringify(events[1]))
    hash.update(']}')
    expect(fingerprint).toBe(hash.digest('base64url'))
  }, 30_000)
})
