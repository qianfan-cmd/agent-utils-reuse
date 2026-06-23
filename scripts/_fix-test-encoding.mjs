#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const p = path.join(path.dirname(fileURLToPath(import.meta.url)), 'test-hook-confirm.mjs')
let s = fs.readFileSync(p, 'utf8')
s = s.replace(
  /input: bomBytes\n  \}\)/,
  'input: bomBytes,\n    encoding: "utf8"\n  })'
)
s = s.replace(
  /input: writeBomBytes\n  \}\)/,
  'input: writeBomBytes,\n    encoding: "utf8"\n  })'
)
s = s.replace(
  /input: discoveryBom\n  \}\)/,
  'input: discoveryBom,\n    encoding: "utf8"\n  })'
)
fs.writeFileSync(p, s)
console.log('fixed', p)
