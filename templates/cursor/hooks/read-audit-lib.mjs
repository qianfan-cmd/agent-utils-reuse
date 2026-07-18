#!/usr/bin/env node
/** Re-export shared audit lib with cursor runtime (backward compat for tests). */
import { setHookRuntime } from './_shared/hook-runtime.mjs'

setHookRuntime('cursor')
export * from './_shared/read-audit-lib.mjs'
