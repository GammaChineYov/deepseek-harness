/**
 * Incremental session-log fingerprint for index change detection.
 *
 * @module @deepseek-ai/dsh-session-query-sqlite/fingerprint
 */

import { createHash } from 'node:crypto'
import type { SessionEvent, SessionHeader, SessionLogOffset } from '@deepseek-ai/dsh-session'

/**
 * Hash one stored log without encoding the whole payload as a single string.
 *
 * `JSON.stringify({ header, inheritedEventCount, events })` must materialize one
 * V8 string, so a log past the engine's string limit fails the observation
 * before any document is indexed. The pieces hashed here concatenate to that
 * exact byte stream, while each event is encoded and absorbed on its own.
 * @param header - detached session header.
 * @param inheritedEventCount - exact fork-inherited event count paired with the header.
 * @param events - detached contiguous event log.
 * @returns the base64url SHA-256 of the equivalent whole-payload JSON encoding.
 */
export function fingerprintSessionLog(
  header: SessionHeader,
  inheritedEventCount: SessionLogOffset,
  events: readonly SessionEvent[],
): string {
  const hash = createHash('sha256')
  hash.update('{"header":')
  hash.update(JSON.stringify(header))
  hash.update(',"inheritedEventCount":')
  hash.update(JSON.stringify(inheritedEventCount))
  hash.update(',"events":[')
  for (const [index, event] of events.entries()) {
    if (index > 0) hash.update(',')
    hash.update(JSON.stringify(event))
  }
  hash.update(']}')
  return hash.digest('base64url')
}
