#!/usr/bin/env node
/**
 * Unit tests for textHasSubstantiveConfirm / textHasLocalHelpersTable (v0.2.1).
 * Usage: node scripts/test-verdict-substance.mjs
 */
import {
  extractVerdictSymbols,
  textHasBulkConfirmTable,
  textHasLocalHelpersTable,
  textHasSubstantiveConfirm
} from '../templates/cursor/hooks/read-audit-lib.mjs'

function assert(name, cond, detail = '') {
  if (!cond) {
    console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`)
    process.exitCode = 1
    return false
  }
  console.log(`OK: ${name}`)
  return true
}

const GOOD_SUBSTANTIVE = `Confirm fileToBase64:
- Q1 输入: File
- Q2 输出: Promise<string> data URL
- Q3 副作用: FileReader only
- Q4 替换实验: fileToBase64 ≡ readFileAsDataUrl
- Q5 否

Verdict（最终）: reuse(fileToBase64)`

const HOLLOW_PASS = `Confirm: Q1-Q5 通过
Verdict（最终）: reuse(fileToBase64)`

const HOLLOW_WUYIWEN = `五问通过
Verdict: reuse(uploadSingleFile)`

const COMPRESSED_OK = `Confirm uploadSingleFile: Q1 file input Q2 upload API Q3 side effects Q4 matches Q5 no
Verdict（最终）: reuse(uploadSingleFile)`

const MISSING_Q4 = `Q1 ok Q2 ok Q3 ok Q5 no
Verdict（最终）: reuse(x)`

const PARTIAL_REUSE = `Q1 File Q2 RefImageItem Q3 none Q4 dataUrlToImageFile parses; wrapper adds RefImageItem Q5 no
Verdict（最终）: partialReuse(dataUrlToImageFile) + featureLocal(dataUrlToRefItem)`

const PLACEMENT_DEBT = `Q1 html Q2 text Q3 DOM Q4 no utils export; ai-promptInput subset Q5 no
Verdict（最终）: featureLocal(htmlToText) + placement debt(ai-promptInput → mentionHtmlToText)`

const GOOD_TABLE = `Local helpers
| 本地函数 | utils 候选 | 对照结论 |
| htmlToText | — | featureLocal + placement debt |

Q1 Q2 Q3 Q4 Q5
Verdict（最终）: featureLocal(htmlToText)`

const BAD_TABLE_HEADER_ONLY = `Local helpers
| 本地函数 | utils 候选 |
Q1 Q2 Q3 Q4
Verdict（最终）: featureLocal(x)`

const CHINESE_HEADER = `| 本地函数 | utils 候选 | 结论 |
| readFileAsDataUrl | fileToBase64 | reuse |`

const HELPER_PIPE_HEADER = `| Helper | utils 候选 | 对照结论 |
| copyText | copyToClip @ copy.ts | reuse(copyToClip) |

Confirm copyToClip: Q1 text Q2 clipboard Q3 DOM Q4 same Q5 no
Verdict（最终）: reuse(copyToClip)`

assert('substantive Confirm with Q1-Q4 passes', textHasSubstantiveConfirm(GOOD_SUBSTANTIVE))
assert('compressed but individual Q1-Q4 passes', textHasSubstantiveConfirm(COMPRESSED_OK))
assert('partialReuse outcome passes', textHasSubstantiveConfirm(PARTIAL_REUSE))
assert('featureLocal + placement debt passes', textHasSubstantiveConfirm(PLACEMENT_DEBT))

assert('hollow Q1-Q5 通过 rejected', !textHasSubstantiveConfirm(HOLLOW_PASS))
assert('hollow 五问通过 rejected', !textHasSubstantiveConfirm(HOLLOW_WUYIWEN))
assert('missing Q4 rejected', !textHasSubstantiveConfirm(MISSING_Q4))
assert('no Verdict marker rejected', !textHasSubstantiveConfirm('Q1 Q2 Q3 Q4 reuse(x)'))

assert('Local helpers table with data row', textHasLocalHelpersTable(GOOD_TABLE))
assert('Chinese header table', textHasLocalHelpersTable(CHINESE_HEADER))
assert('| Helper | header table with data row', textHasLocalHelpersTable(HELPER_PIPE_HEADER))
const helperSyms = extractVerdictSymbols(HELPER_PIPE_HEADER)
assert(
  'extractVerdictSymbols from reuse + table',
  helperSyms.includes('copyToClip') && helperSyms.includes('copyText'),
  helperSyms.join(',')
)
assert(
  'extractVerdictSymbols partialReuse',
  extractVerdictSymbols(PARTIAL_REUSE).includes('dataUrlToImageFile')
)
assert('header only no data row fails', !textHasLocalHelpersTable(BAD_TABLE_HEADER_ONLY))
assert('no table fails', !textHasLocalHelpersTable(GOOD_SUBSTANTIVE))

const BULK_CONFIRM = `| Symbol | 候选 | Q1 | Q2 | Q3 | Q4 | Verdict |
| uploadFiles | uploadMultipleFiles @ same file | File[] | API | none | reject uploadMultipleFiles | reuse(uploadFiles) |
| mockModel | — | mock | UI | none | UI only | featureLocal(mockModel) |
| Gate N/A — section2 | — | — | — | — | pure UI | Gate N/A |

**Verdict（最终）**：reuse(uploadFiles)；featureLocal(mockModel)`

const BULK_MISSING_Q4 = `| Symbol | Q1 | Q2 | Q3 | Q4 | Verdict |
| foo | a | b | c | | reuse(foo) |

Verdict（最终）: reuse(foo)`

assert('bulk Confirm table passes', textHasSubstantiveConfirm(BULK_CONFIRM))
assert('textHasBulkConfirmTable', textHasBulkConfirmTable(BULK_CONFIRM))
assert('bulk table with Gate N/A row', textHasSubstantiveConfirm(BULK_CONFIRM))
assert('bulk row missing Q1-Q4 in header cols fails', !textHasSubstantiveConfirm(BULK_MISSING_Q4))

if (process.exitCode) {
  console.error('\nSome verdict substance tests failed.')
  process.exit(1)
}
console.log('\nAll verdict substance tests passed.')
