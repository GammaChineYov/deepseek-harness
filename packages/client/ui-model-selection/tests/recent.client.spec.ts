// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  RECENT_LIMIT, RECENT_STORAGE_KEY,
  addRecentModel, defaultRecentStorage, persistRecentModels, readRecentModels,
  type RecentModel, type RecentStorage,
} from '../src/client/recent.ts'

/** In-memory RecentStorage double. */
function fake(): RecentStorage & { read(): string | null } {
  const store = new Map<string, string>()
  return {
    getItem: key => store.get(key) ?? null,
    setItem: (key, value) => { store.set(key, value) },
    read: () => store.get(RECENT_STORAGE_KEY) ?? null,
  }
}

function seeded(raw: unknown): RecentStorage & { read(): string | null } {
  const s = fake()
  s.setItem(RECENT_STORAGE_KEY, JSON.stringify(raw))
  return s
}

const a: RecentModel = { provider: 'p', model: 'a' }
const b: RecentModel = { provider: 'p', model: 'b' }

afterEach(() => { window.localStorage.clear() })

describe('recent MRU helpers', () => {
  it('reads an empty or missing storage as an empty list', () => {
    expect(readRecentModels(undefined)).toEqual([])
    expect(readRecentModels(fake())).toEqual([])
  })

  it('returns an empty list for corrupt JSON or a non-array value', () => {
    const bad = fake()
    bad.setItem(RECENT_STORAGE_KEY, '{not json')
    expect(readRecentModels(bad)).toEqual([])
    const nonArray = seeded({ provider: 'p', model: 'a' })
    expect(readRecentModels(nonArray)).toEqual([])
  })

  it('drops malformed entries but keeps valid ones in order', () => {
    const s = seeded([{ provider: 'p', model: 'a' }, { provider: 5, model: 'x' }, null, 'nope', { provider: 'p' }])
    expect(readRecentModels(s)).toEqual([a])
  })

  it('caps the read list at the limit', () => {
    const many = Array.from({ length: RECENT_LIMIT + 3 }, (_, i) => ({ provider: 'p', model: `m${i}` }))
    const s = seeded(many)
    const out = readRecentModels(s)
    expect(out).toHaveLength(RECENT_LIMIT)
    expect(out[0]).toEqual(many[0])
  })

  it('swallows storage read failures', () => {
    const s = fake()
    s.getItem = vi.fn(() => { throw new Error('quota') })
    expect(readRecentModels(s)).toEqual([])
  })

  it('adds newest first', () => {
    expect(addRecentModel([a], b)).toEqual([b, a])
  })

  it('deduplicates by provider+model, moving the existing entry to the front', () => {
    expect(addRecentModel([b, a], a)).toEqual([a, b])
    expect(addRecentModel([a], a)).toEqual([a])
  })

  it('caps the added list at the limit', () => {
    const many = Array.from({ length: RECENT_LIMIT }, (_, i) => ({ provider: 'p', model: `m${i}` }))
    const out = addRecentModel(many, { provider: 'p', model: 'fresh' })
    expect(out).toHaveLength(RECENT_LIMIT)
    expect(out[0]).toEqual({ provider: 'p', model: 'fresh' })
  })

  it('persists the trimmed list as JSON', () => {
    const s = fake()
    persistRecentModels(s, [b, a])
    expect(JSON.parse(s.read() ?? '[]')).toEqual([b, a])
  })

  it('swallows storage write failures and undefined storage', () => {
    const s = fake()
    s.setItem = vi.fn(() => { throw new Error('quota') })
    expect(() => persistRecentModels(s, [a])).not.toThrow()
    expect(() => persistRecentModels(undefined, [a])).not.toThrow()
  })

  it('defaults to window.localStorage in a DOM environment', () => {
    const storage = defaultRecentStorage()
    expect(storage).toBeTruthy()
    if (storage !== undefined) {
      persistRecentModels(storage, [a])
      expect(readRecentModels(storage)).toEqual([a])
    }
  })
})
