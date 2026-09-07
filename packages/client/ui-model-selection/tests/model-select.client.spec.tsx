// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ModelSelection } from '@deepseek-ai/dsh-api-remotes/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ComponentProps } from 'react'
import { RECENT_STORAGE_KEY } from '../src/client/recent.ts'
import type { ModelDirectoryState } from '../src/client/directory.ts'
import { ModelSelect } from '../src/client/ModelSelect.tsx'
import { zh } from '../src/client/locales.ts'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'

const t: ComponentProps<typeof ModelSelect>['t'] = (key, params) => {
  const template = (zh as Record<string, string>)[key]
    ?? (commonZh as Record<string, string>)[key]
    ?? key
  return params === undefined
    ? template
    : template.replace(/\{(\w+)\}/g, (match, name: string) => name in params ? String(params[name]) : match)
}

const reasoning = {
  efforts: [
    { id: 'off', name: 'Off' },
    { id: 'high', name: 'High' },
    { id: 'max', name: 'Max', description: 'Largest budget' },
  ],
  defaultEffort: 'high',
}

function state(overrides: Partial<ModelDirectoryState> = {}): ModelDirectoryState {
  return {
    current: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
    routable: true,
    groups: [{
      id: 'deepseek-official',
      name: 'DeepSeek',
      models: [{
        id: 'deepseek-v4-flash',
        name: 'DeepSeek-V4-Flash',
        description: 'Fast catalog description',
        reasoning,
      }],
    }],
    failures: [],
    status: 'ready',
    error: null,
    ...overrides,
  }
}

/** Two-provider fixture: DeepSeek has two models, Anthropic a single one. */
function multiGroupState(): ModelDirectoryState {
  return state({
    groups: [
      {
        id: 'deepseek-official',
        name: 'DeepSeek',
        models: [
          { id: 'deepseek-v4-flash', name: 'DeepSeek-V4-Flash', reasoning },
          { id: 'deepseek-v4-pro', name: 'DeepSeek-V4-Pro' },
        ],
      },
      {
        id: 'anthropic',
        name: 'Anthropic',
        models: [{ id: 'claude-sonnet', name: 'Claude Sonnet' }],
      },
    ],
  })
}

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

function openMenu(): void {
  fireEvent.click(screen.getByRole('button', { name: /选择模型|当前/ }))
}

describe('ModelSelect inline fly-out menu', () => {
  it('opens straight into a provider/model fly-out split without drilling', () => {
    const directory = createSnapshotStore<ModelDirectoryState>(multiGroupState())
    render(<ModelSelect
      locked={false}
      available
      directory={directory}
      load={vi.fn()}
      select={vi.fn()}
      t={t}
    />)

    openMenu()
    // Provider column shows both providers as radio rows. The provider row
    // text carries its model count (no space before the zh count), so match
    // that instead of the bare name (which the fly-out model rows also start
    // with).
    expect(screen.getByRole('menuitemradio', { name: /^DeepSeek共/ })).toBeTruthy()
    expect(screen.getByRole('menuitemradio', { name: /^Anthropic共/ })).toBeTruthy()
    // The current provider's models appear in the fly-out column immediately.
    expect(screen.getByRole('menuitemradio', { name: /DeepSeek-V4-Flash/ })).toBeTruthy()
    expect(screen.getByRole('menuitemradio', { name: /DeepSeek-V4-Pro/ })).toBeTruthy()
  })

  it('switches the fly-out column when another provider is focused', () => {
    const directory = createSnapshotStore<ModelDirectoryState>(multiGroupState())
    render(<ModelSelect
      locked={false}
      available
      directory={directory}
      load={vi.fn()}
      select={vi.fn()}
      t={t}
    />)

    openMenu()
    const anthropic = screen.getByRole('menuitemradio', { name: /Anthropic/ })
    fireEvent.focus(anthropic)
    // Fly-out column now shows Anthropic's single model.
    expect(screen.getByRole('menuitemradio', { name: 'Claude Sonnet' })).toBeTruthy()
    expect(screen.queryByRole('menuitemradio', { name: /DeepSeek-V4-Flash/ })).toBeNull()
  })

  it('selects a single-model provider directly on click', async () => {
    const directory = createSnapshotStore<ModelDirectoryState>(multiGroupState())
    const select = vi.fn(async (selection: ModelSelection) => {
      directory.set(state({ ...multiGroupState(), current: selection }))
      return true
    })
    render(<ModelSelect
      locked={false}
      available
      directory={directory}
      load={vi.fn()}
      select={select}
      t={t}
    />)

    openMenu()
    const anthropic = screen.getByRole('menuitemradio', { name: /Anthropic/ })
    fireEvent.click(anthropic)
    await waitFor(() => {
      expect(select).toHaveBeenCalledWith({ provider: 'anthropic', model: 'claude-sonnet' })
    })
  })

  it('selects a model from the fly-out column and records it as recent', async () => {
    const directory = createSnapshotStore<ModelDirectoryState>(multiGroupState())
    const select = vi.fn(async (selection: ModelSelection) => {
      directory.set(state({ ...multiGroupState(), current: selection }))
      return true
    })
    render(<ModelSelect
      locked={false}
      available
      directory={directory}
      load={vi.fn()}
      select={select}
      t={t}
    />)

    openMenu()
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'DeepSeek-V4-Pro' }))
    await waitFor(() => {
      expect(select).toHaveBeenCalledWith({ provider: 'deepseek-official', model: 'deepseek-v4-pro' })
    })
    // The successful pick is recorded to localStorage as most-recent.
    const stored = window.localStorage.getItem(RECENT_STORAGE_KEY)
    expect(stored).toContain('deepseek-v4-pro')
  })

  it('does not record a rejected model switch', async () => {
    const directory = createSnapshotStore<ModelDirectoryState>(multiGroupState())
    const select = vi.fn(async () => false)
    render(<ModelSelect
      locked={false}
      available
      directory={directory}
      load={vi.fn()}
      select={select}
      t={t}
    />)

    openMenu()
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'DeepSeek-V4-Pro' }))
    await waitFor(() => { expect(select).toHaveBeenCalled() })
    expect(window.localStorage.getItem(RECENT_STORAGE_KEY)).toBeNull()
  })

  it('shows the durable model id when the catalog has no matching display name', () => {
    const directory = createSnapshotStore<ModelDirectoryState>(state({
      current: { provider: 'unknown-provider', model: 'model-x' },
    }))
    render(<ModelSelect
      locked={false}
      available
      directory={directory}
      load={vi.fn()}
      select={vi.fn()}
      t={t}
    />)
    const trigger = screen.getByRole('button', { name: /选择模型|current|unknown-provider/ })
    expect(trigger.textContent).toContain('unknown-provider')
    expect(trigger.textContent).toContain('model-x')
  })

  it('drills to effort levels from the root and submits a chosen effort', async () => {
    const directory = createSnapshotStore<ModelDirectoryState>(state())
    const select = vi.fn(async (selection: ModelSelection) => {
      directory.set(state({ current: selection }))
      return true
    })
    render(<ModelSelect
      locked={false}
      available
      directory={directory}
      load={vi.fn()}
      select={select}
      t={t}
    />)

    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /推理等级/ }))
    expect(screen.getByRole('menuitemradio', { name: 'Off' })).toBeTruthy()
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Max' }))
    await waitFor(() => {
      expect(select).toHaveBeenCalledWith({
        provider: 'deepseek-official',
        model: 'deepseek-v4-flash',
        reasoningEffort: 'max',
      })
    })
  })

  it('surfaces persisted recent models for direct picks and drops missing ones', () => {
    const directory = createSnapshotStore<ModelDirectoryState>(multiGroupState())
    render(<ModelSelect
      locked={false}
      available
      directory={directory}
      load={vi.fn()}
      select={vi.fn()}
      t={t}
    />)

    // Write recents before opening (open reads them in a passive effect).
    window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify([
      { provider: 'deepseek-official', model: 'deepseek-v4-pro' },
      { provider: 'gone', model: 'gone-model' },
    ]))
    openMenu()
    // The resolvable recent appears as a direct pick (fly-out model column also
    // lists it since DeepSeek is the active provider); the missing one is dropped.
    expect(screen.getAllByRole('menuitemradio', { name: 'DeepSeek-V4-Pro' }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('menuitemradio', { name: 'gone-model' })).toBeNull()
  })
})
