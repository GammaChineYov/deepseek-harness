/** Frame-wide dynamic Plugin inventory, approvals, versions, and lifecycle actions. */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ButtonHTMLAttributes, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import {
  IconCheckOutline16, IconCloseOutline16, IconCordisPluginOutline14, IconPlayOutline16,
  IconStopFill16, IconTrashOutline16, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { CordisRunActivity } from '@deepseek-ai/dsh-cordis-client-runner/client'
import type { SessionId } from '@deepseek-ai/dsh-client-connection/client'
import type { CordisInventoryRow } from './dynamic-port.ts'
import type { CordisPanelFace } from './slots.ts'
import type { CordisKey } from './locales.ts'
import type {
  ApprovalRequestId, CordisDynamicPackageId, CordisDynamicPluginId,
} from './events.ts'
import { cordisVisibleStatus, packageOf, type CordisVisibleStatus } from './status.ts'
import css from './CordisPanel.module.css'

/** Full panel props composed by the sidebar footer-action slot. */
export type CordisPanelProps =
  PropsRuntime<'sidebar.footer.action'> & InjectFace<CordisPanelFace> & PropsLocale<'cordis'>

type PanelStatus = CordisVisibleStatus | 'awaiting-approval' | 'failed'

const STATUS_LABELS = {
  idle: 'status.idle',
  'awaiting-approval': 'status.awaitingApproval',
  'client-pending': 'status.clientPending',
  running: 'status.running',
  failed: 'status.failed',
} as const satisfies Record<PanelStatus, CordisKey>

const RENDER_FAILURE_LABELS = {
  abdicated: 'render.failedAbdicated',
  held: 'render.failedHeld',
} as const satisfies Record<'abdicated' | 'held', CordisKey>

interface RowView {
  readonly pluginId: CordisDynamicPluginId
  readonly agentId: SessionId
  readonly listed?: CordisInventoryRow
  readonly activity?: CordisRunActivity
}

function selectedPackageIdOf(
  { pluginId, listed, activity }: RowView,
  selected: Readonly<Record<string, CordisDynamicPackageId>>,
): CordisDynamicPackageId | undefined {
  const selectedPackageId = selected[pluginId]
  if (selectedPackageId !== undefined
    && listed?.packages.some(pkg => pkg.packageId === selectedPackageId)) return selectedPackageId
  return listed?.nextPackageId
    ?? listed?.currentPackageId
    ?? listed?.packages.at(-1)?.packageId
    ?? activity?.packageId
}

function visiblePanelStatus(
  view: RowView,
  selectedPackageId: CordisDynamicPackageId | undefined,
  loaded: Parameters<typeof cordisVisibleStatus>[2],
): PanelStatus {
  const { listed, activity } = view
  const latest = listed?.latestRun
  if (activity?.phase === 'awaiting-approval' || latest?.status === 'awaiting-approval') {
    return 'awaiting-approval'
  }
  if (latest?.status === 'failed' && latest.packageId === selectedPackageId) return 'failed'
  if (listed?.activeRun === undefined) return 'idle'
  return cordisVisibleStatus(listed, listed.activeRun.packageId, loaded)
}

function blockingFirst(rows: readonly RowView[]): readonly RowView[] {
  return [
    ...rows.filter(row => row.activity?.phase === 'awaiting-approval'),
    ...rows.filter(row => row.activity?.phase !== 'awaiting-approval'),
  ]
}

function RowAction({ label, children, ...props }: {
  label: string
  children: ReactNode
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Tooltip label={label} side="bottom" delayMs={500}>
      <button type="button" className={css.actionButton} aria-label={label} {...props}>
        {children}
      </button>
    </Tooltip>
  )
}

function DoubleCheckIcon() {
  return (
    <span className={css.doubleCheck} aria-hidden>
      <IconCheckOutline16 size={12} />
      <IconCheckOutline16 size={12} />
    </span>
  )
}

/**
 * Version dropdown that replaces the native select: each option carries a
 * hover/focus tooltip with that Package's purpose, so switching the visible
 * version is a read of the version history, not a blind pick. The menu is
 * position:fixed off the trigger rect (re-measured on scroll/resize), because
 * the panel body scrolls and would clip an absolutely positioned list.
 */
function VersionPicker({
  packages,
  value,
  disabled,
  onChange,
  t,
}: {
  packages: CordisInventoryRow['packages']
  value: CordisDynamicPackageId
  disabled: boolean
  onChange: (packageId: CordisDynamicPackageId) => void
  t: CordisPanelProps['t']
}) {
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ left: number; top: number; width: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const measure = useCallback(() => {
    const el = triggerRef.current
    if (el === null) return
    const r = el.getBoundingClientRect()
    setMenuPos({
      left: r.left,
      top: r.bottom + 4,
      width: Math.min(r.width, window.innerWidth - r.left - 8),
    })
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    setMenuPos(null)
  }, [])

  useEffect(() => {
    if (!open) return
    measure()
    const onScroll = () => measure()
    const onResize = () => measure()
    const onDocMouseDown = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return
      if (triggerRef.current?.contains(e.target as Node)) return
      close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, measure, close])

  // Flip the menu above the trigger when it would run off the bottom edge.
  useLayoutEffect(() => {
    if (!open || menuPos === null) return
    const menu = menuRef.current
    if (menu === null) return
    const r = menu.getBoundingClientRect()
    if (r.bottom <= window.innerHeight - 8) return
    const btn = triggerRef.current
    if (btn === null) return
    const b = btn.getBoundingClientRect()
    const top = Math.max(8, b.top - 4 - r.height)
    if (top !== menuPos.top) {
      setMenuPos(prev => prev === null ? prev : { ...prev, top })
    }
  }, [open, menuPos])

  // A busy row (pending lifecycle action) disables the trigger; drop any open
  // menu so its stale options cannot be picked mid-operation.
  useEffect(() => {
    if (disabled) close()
  }, [disabled, close])

  const selected = packages.find(pkg => pkg.packageId === value)

  const onMenuKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const options = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[data-cordis-version-option]') ?? [],
    )
    if (options.length === 0) return
    const idx = options.indexOf(document.activeElement as HTMLButtonElement)
    const next = e.key === 'ArrowDown' ? Math.min(idx + 1, options.length - 1) : Math.max(idx - 1, 0)
    options[next]?.focus()
  }

  return (
    <span
      className={css.versionControl}
      onBlur={(e) => {
        const next = e.relatedTarget as Node | null
        if (next === null) return
        if (menuRef.current?.contains(next)) return
        if (triggerRef.current?.contains(next)) return
        close()
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className={css.versionButton}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-cordis-version-trigger
        onClick={() => setOpen(v => !v)}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
          e.preventDefault()
          setOpen(true)
        }}
      >
        <span className={css.versionButtonText}>
          {selected === undefined ? value : `${selected.name} · ${selected.packageId}`}
        </span>
        <span className={css.versionCaret} aria-hidden>▾</span>
      </button>
      {open && menuPos !== null && (
        <div
          ref={menuRef}
          className={css.versionMenu}
          role="listbox"
          aria-label={t('panel.version')}
          style={{ left: menuPos.left, top: menuPos.top, width: menuPos.width }}
          onKeyDown={onMenuKeyDown}
        >
          {packages.map(pkg => (
            <Tooltip
              key={pkg.packageId}
              label={pkg.purpose || t('purpose.missing')}
              side="right"
              maxWidth={360}
            >
              <button
                type="button"
                role="option"
                aria-selected={pkg.packageId === value}
                className={css.versionOption}
                data-cordis-version-option={pkg.packageId}
                onClick={() => {
                  onChange(pkg.packageId)
                  close()
                }}
              >
                <span className={css.versionOptionName}>{pkg.name}</span>
                <span className={css.versionOptionId}>{pkg.packageId}</span>
                {pkg.packageId === value && (
                  <span className={css.versionCheck} aria-hidden>
                    <IconCheckOutline16 size={12} />
                  </span>
                )}
              </button>
            </Tooltip>
          ))}
        </div>
      )}
    </span>
  )
}

/** Render the inventory panel and its unified footer action. */
export function CordisPanel({
  wide,
  useSessions, useInventory, useActiveRuns, useRunErrors, useLoaded, useRenderFailures,
  onApprove, onDecline, onRun, onStop, onRemove, onRefresh, t,
}: CordisPanelProps) {
  const inventory = useInventory(snapshot => snapshot)
  const activeRuns = useActiveRuns(snapshot => snapshot)
  const errors = useRunErrors(snapshot => snapshot)
  const loaded = useLoaded(snapshot => snapshot)
  const renderFailures = useRenderFailures(snapshot => snapshot)
  const current = useSessions(state => state.current)
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Record<string, CordisDynamicPackageId>>({})
  const [pending, setPending] = useState<ReadonlySet<CordisDynamicPluginId>>(new Set())
  const [actionErrors, setActionErrors] = useState<ReadonlyMap<CordisDynamicPluginId, string>>(new Map())
  const visibleRequests = useRef<Set<ApprovalRequestId>>(new Set())

  useEffect(() => {
    const now = new Set<ApprovalRequestId>()
    for (const activity of activeRuns.values()) {
      if (activity.phase === 'awaiting-approval') now.add(activity.requestId)
    }
    const discovered = [...now].some(requestId => !visibleRequests.current.has(requestId))
    visibleRequests.current = now
    if (discovered) setOpen(true)
  }, [activeRuns])

  useEffect(() => { onRefresh() }, [onRefresh])
  useEffect(() => { if (open) onRefresh() }, [onRefresh, open])

  const byPlugin = new Map<CordisDynamicPluginId, RowView>()
  for (const listed of inventory.rows) {
    const activity = activeRuns.get(listed.pluginId)
    byPlugin.set(listed.pluginId, {
      pluginId: listed.pluginId,
      agentId: activity?.agentId ?? listed.agentId,
      listed,
      ...activity === undefined ? {} : { activity },
    })
  }
  for (const [pluginId, activity] of activeRuns) {
    if (byPlugin.has(pluginId)) continue
    byPlugin.set(pluginId, { pluginId, agentId: activity.agentId, activity })
  }
  const all = [...byPlugin.values()]
  const mine = blockingFirst(all.filter(row => current !== undefined && row.agentId === current))
  const theirs = blockingFirst(all.filter(row => current === undefined || row.agentId !== current))
  const approvals = [...activeRuns.values()].filter(activity => activity.phase === 'awaiting-approval').length
  const running = all.filter(view => visiblePanelStatus(
    view,
    selectedPackageIdOf(view, selected),
    loaded,
  ) === 'running').length

  if (all.length === 0) return null

  const runAction = async (pluginId: CordisDynamicPluginId, action: () => Promise<void | { ok: boolean; message?: string }>) => {
    if (pending.has(pluginId)) return
    setPending(currentPending => new Set(currentPending).add(pluginId))
    setActionErrors((currentErrors) => {
      const next = new Map(currentErrors)
      next.delete(pluginId)
      return next
    })
    try {
      const result = await action()
      if (result !== undefined && !result.ok) {
        setActionErrors(currentErrors => new Map(currentErrors).set(pluginId, result.message ?? 'operation failed'))
      }
    } catch (error) {
      setActionErrors(currentErrors => new Map(currentErrors).set(
        pluginId,
        error instanceof Error ? error.message : String(error),
      ))
    } finally {
      setPending((currentPending) => {
        const next = new Set(currentPending)
        next.delete(pluginId)
        return next
      })
      onRefresh()
    }
  }

  const renderRow = (view: RowView) => {
    const { pluginId, listed, activity } = view
    const selectedPackageId = selectedPackageIdOf(view, selected)
    const selectedPackage = listed !== undefined && selectedPackageId !== undefined
      ? packageOf(listed, selectedPackageId)
      : undefined
    const activePackage = listed?.activeRun === undefined
      ? undefined
      : packageOf(listed, listed.activeRun.packageId)
    const name = selectedPackage?.name
      ?? (activity?.phase === 'awaiting-approval' ? activity.name : pluginId)
    const purpose = selectedPackage?.purpose
      ?? (activity?.phase === 'awaiting-approval' ? activity.purpose : '')
    const latest = listed?.latestRun
    const awaiting = activity?.phase === 'awaiting-approval'
      ? activity.requestId
      : latest?.status === 'awaiting-approval' ? latest.approvalRequestId : undefined
    const status = visiblePanelStatus(view, selectedPackageId, loaded)
    const busy = pending.has(pluginId) || activity?.phase === 'orchestrating'
    const failure = errors.get(pluginId)
    const hostFailure = latest?.status === 'failed' ? latest.error : undefined
    const renderFailure = renderFailures.get(pluginId)
    const actionError = actionErrors.get(pluginId)
    const nextPackageId = listed?.nextPackageId !== undefined
      && listed.nextPackageId !== listed.currentPackageId ? listed.nextPackageId : undefined
    const currentPackageId = listed?.currentPackageId
    const runMode = listed?.currentPackageId !== undefined
      && selectedPackageId !== listed.currentPackageId ? 'update' as const : 'run' as const

    return (
      <li
        key={pluginId}
        className={css.row}
        data-cordis-row={pluginId}
        data-cordis-status={status}
        data-cordis-awaiting={awaiting !== undefined || undefined}
      >
        <div className={css.rowHead}>
          <span className={css.rowId}>{pluginId}</span>
          <span className={css.rowName}>{name}</span>
          <span className={css.rowStatus}>{t(STATUS_LABELS[status])}</span>
        </div>
        {listed !== undefined && listed.packages.length > 1 && selectedPackageId !== undefined && (
          <label className={css.versionPicker}>
            <span>{t('panel.version')}</span>
            <VersionPicker
              packages={listed.packages}
              value={selectedPackageId}
              disabled={busy}
              onChange={(packageId) => {
                setSelected(currentSelected => ({
                  ...currentSelected,
                  [pluginId]: packageId,
                }))
              }}
              t={t}
            />
          </label>
        )}
        <div className={css.rowDetail}>
          <span className={css.rowPurpose}>{purpose}</span>
          <div className={css.rowActions}>
            {awaiting !== undefined && (
              <>
                <RowAction
                  label={t('action.approveOnce')}
                  data-cordis-approve={awaiting}
                  disabled={busy}
                  onClick={() => { void runAction(pluginId, async () => {
                    await onApprove(awaiting, false)
                    setOpen(false)
                  }) }}
                >
                  <IconCheckOutline16 size={14} />
                </RowAction>
                <RowAction
                  label={t('action.approvePlugin')}
                  data-cordis-approve-plugin={awaiting}
                  disabled={busy}
                  onClick={() => { void runAction(pluginId, async () => {
                    await onApprove(awaiting, true)
                    setOpen(false)
                  }) }}
                >
                  <DoubleCheckIcon />
                </RowAction>
                <RowAction
                  label={t('action.decline')}
                  data-cordis-decline={awaiting}
                  disabled={busy}
                  onClick={() => { void runAction(pluginId, async () => {
                    await onDecline(awaiting)
                    setOpen(false)
                  }) }}
                >
                  <IconCloseOutline16 size={14} />
                </RowAction>
              </>
            )}
            {awaiting === undefined && listed !== undefined
              && selectedPackageId !== undefined && listed.activeRun === undefined && (
              <RowAction
                label={t('action.run')}
                data-cordis-switch="run"
                disabled={busy}
                onClick={() => { void runAction(pluginId, () => onRun({
                  agentId: listed.agentId,
                  pluginId,
                  packageId: selectedPackageId,
                  mode: runMode,
                  hasClientHalf: selectedPackage?.hasClientHalf === true,
                })) }}
              >
                <IconPlayOutline16 size={14} />
              </RowAction>
            )}
            {awaiting === undefined && listed !== undefined && listed.activeRun !== undefined
              && selectedPackageId !== listed.activeRun.packageId && selectedPackage !== undefined && (
              <RowAction
                label={t('action.run')}
                data-cordis-switch="run"
                disabled={busy}
                onClick={() => { void runAction(pluginId, () => onRun({
                  agentId: listed.agentId,
                  pluginId,
                  packageId: selectedPackage.packageId,
                  mode: runMode,
                  hasClientHalf: selectedPackage.hasClientHalf,
                })) }}
              >
                <IconPlayOutline16 size={14} />
              </RowAction>
            )}
            {awaiting === undefined && listed !== undefined && listed.activeRun !== undefined && status === 'client-pending'
              && activePackage !== undefined && selectedPackageId === listed.activeRun.packageId && (
              <RowAction
                label={t('action.run')}
                data-cordis-switch="run"
                disabled={busy}
                onClick={() => { void runAction(pluginId, () => onRun({
                  agentId: listed.agentId,
                  pluginId,
                  packageId: activePackage.packageId,
                  mode: 'run',
                  hasClientHalf: true,
                })) }}
              >
                <IconPlayOutline16 size={14} />
              </RowAction>
            )}
            {awaiting === undefined && listed !== undefined && listed.activeRun !== undefined && (
              <RowAction
                label={t('action.stop')}
                data-cordis-switch="stop"
                disabled={busy}
                onClick={() => { void runAction(pluginId, () => onStop(listed.agentId, pluginId)) }}
              >
                <IconStopFill16 size={14} />
              </RowAction>
            )}
            {awaiting === undefined && listed !== undefined && (
              <RowAction
                label={t('action.remove')}
                data-cordis-remove={pluginId}
                disabled={busy}
                onClick={() => { void runAction(pluginId, () => onRemove(listed.agentId, pluginId)) }}
              >
                <IconTrashOutline16 size={14} />
              </RowAction>
            )}
          </div>
        </div>
        {awaiting === undefined && nextPackageId !== undefined && listed !== undefined && (
          <div className={css.transition}>
            <span>{currentPackageId === undefined ? '' : t('panel.current', { packageId: currentPackageId })}</span>
            <span>{t('panel.next', { packageId: nextPackageId })}</span>
            <div className={css.transitionActions}>
              <button
                type="button"
                disabled={busy}
                onClick={() => { void runAction(pluginId, () => onRun({
                  agentId: listed.agentId,
                  pluginId,
                  packageId: nextPackageId,
                  mode: currentPackageId === undefined ? 'run' : 'update',
                  hasClientHalf: packageOf(listed, nextPackageId)?.hasClientHalf === true,
                })) }}
              >{t('action.retry')}</button>
              {currentPackageId !== undefined && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => { void runAction(pluginId, () => onRun({
                    agentId: listed.agentId,
                    pluginId,
                    packageId: currentPackageId,
                    mode: 'run',
                    hasClientHalf: packageOf(listed, currentPackageId)?.hasClientHalf === true,
                  })) }}
                >{t('action.rollback')}</button>
              )}
            </div>
          </div>
        )}
        {failure !== undefined && (
          <div className={css.rowError} role="alert">{`${failure.message} (${failure.reason})`}</div>
        )}
        {failure === undefined && hostFailure !== undefined && (
          <div className={css.rowError} role="alert">{`${hostFailure.message} (${hostFailure.phase})`}</div>
        )}
        {actionError !== undefined && <div className={css.rowError} role="alert">{actionError}</div>}
        {renderFailure !== undefined && (
          <div
            className={css.rowError}
            role="alert"
            data-cordis-render-failure={renderFailure.slot}
            data-cordis-render-abdicated={renderFailure.abdicated || undefined}
          >
            {`${t(RENDER_FAILURE_LABELS[renderFailure.abdicated ? 'abdicated' : 'held'], {
              slot: renderFailure.slot,
            })} ${renderFailure.message}`}
          </div>
        )}
        {activePackage !== undefined && activePackage.packageId !== selectedPackageId && (
          <span className={css.activeVersion}>{`${t('status.running')}: ${activePackage.name} · ${activePackage.packageId}`}</span>
        )}
      </li>
    )
  }

  return (
    <div className={wide ? css.layer : `${css.layer} ${css.rail}`}>
      {open && (
        <section className={css.panel} data-cordis-panel aria-label={t('panel.title')}>
          <header className={css.header}>
            <span className={css.title}>{t('panel.title')}</span>
          </header>
          <div className={css.body}>
            {inventory.error !== undefined && (
              <p className={css.readError} role="alert">{t('panel.readFailed', { message: inventory.error })}</p>
            )}
            {!inventory.read && inventory.error === undefined && <p className={css.note}>{t('panel.loading')}</p>}
            {inventory.read && all.length === 0 && <p className={css.note}>{t('panel.empty')}</p>}
            {mine.length > 0 && (
              <section>
                <h3 className={css.group}>{t('panel.group.current')}</h3>
                <ul className={css.rows}>{mine.map(renderRow)}</ul>
              </section>
            )}
            {theirs.length > 0 && (
              <section>
                <h3 className={css.group}>{t('panel.group.others')}</h3>
                <ul className={css.rows}>{theirs.map(renderRow)}</ul>
              </section>
            )}
          </div>
        </section>
      )}
      <div className={css.footerButtons}>
        <button
          type="button"
          className={css.badge}
          data-cordis-badge={all.length}
          data-cordis-approval-badge={approvals}
          data-active={approvals > 0 || undefined}
          aria-label={t('panel.plugins.aria')}
          aria-expanded={open}
          onClick={() => { setOpen(value => !value) }}
        >
          <IconCordisPluginOutline14 />
          {wide && (
            <>
              <span className={css.badgeLabel}>{t('panel.trigger')}</span>
              <span className={css.badgeCount}>{t('panel.runningCount', { count: running })}</span>
            </>
          )}
        </button>
      </div>
    </div>
  )
}
