#!/usr/bin/env node
import { setHookRuntime } from './_shared/hook-runtime.mjs'

setHookRuntime('claude')
await import('./_shared/check-discovery-core.mjs')
