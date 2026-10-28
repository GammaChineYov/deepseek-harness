/** Configuration shared by plugin mounting and direct executor construction. @module */
import z from '@deepseek-ai/schemastery'

/** Sub-dispatch budget applied to one program when the config omits it. */
export const DEFAULT_MAX_SUB_CALLS_PER_RUN = 2_000

/** Program execution limits. */
export interface Config {
  /** Maximum overlapping concurrency-safe program subcalls. */
  maxParallelSubCalls: number
  /** Sub-dispatch budget for one program; exceeding it aborts that program. */
  maxSubCallsPerRun: number
}

/** Validated program subcall concurrency; one makes subcalls serial. */
export const Config: z<Partial<Config>, Config> = z.object({
  maxParallelSubCalls: z.natural().min(1).default(10),
  maxSubCallsPerRun: z.natural().min(1).default(DEFAULT_MAX_SUB_CALLS_PER_RUN),
})
