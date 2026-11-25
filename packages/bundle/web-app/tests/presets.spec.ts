/** Shipped agent-preset declarations: which skill rows a preset mounts and how it configures them. */

import { fileURLToPath } from 'node:url'
import { loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'
import { expect, it } from 'vitest'

/** One row of a shipped preset declaration. */
interface PresetRow {
  readonly id: string
  readonly name: string
  readonly config?: Record<string, unknown>
}

/** Plugin rows of one shipped preset, in declaration order. */
function presetPlugins(preset: string): PresetRow[] {
  const [row] = loadOverlayPatches(preset, fileURLToPath(new URL(`../presets/${preset}.patch.yml`, import.meta.url)))
    .flatMap(patch => patch.insert ?? [])
  return (row!.config as { plugins: PresetRow[] }).plugins
}

it('keeps the minimal preset shell-only while mounting user-explicit skill loading', () => {
  const minimal = presetPlugins('minimal')
  // Discovery populates the input's `/` menu; the loader supplies the user
  // gesture, and its model-facing half stays off so the preset keeps its
  // one-tool contract.
  expect(minimal.filter(row => row.name === '@deepseek-ai/dsh-skill-filesystem').map(row => row.id))
    .toEqual(['skill-filesystem'])
  expect(minimal.filter(row => row.name === '@deepseek-ai/dsh-tool-skill')).toEqual([
    { id: 'tool-skill', name: '@deepseek-ai/dsh-tool-skill', config: { modelInvocation: false } },
  ])
})

it('leaves model-side skill invocation enabled in the standard preset', () => {
  const toolSkillRow = presetPlugins('standard').find(row => row.name === '@deepseek-ai/dsh-tool-skill')
  expect(toolSkillRow?.config?.modelInvocation).toBeUndefined()
})
