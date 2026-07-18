#!/usr/bin/env node
import { setHookRuntime } from './_shared/hook-runtime.mjs'

setHookRuntime('codex')
await import('./_shared/track-utils-verdict-core.mjs')
