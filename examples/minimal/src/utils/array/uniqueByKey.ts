/**
 * @utils-book 数组去重工具
 */

/** @utils-book 按字段对对象数组去重，保留首次出现的元素 */
export function uniqueByKey<T extends Record<string, unknown>>(
  items: T[],
  key: keyof T
): T[] {
  const seen = new Set<unknown>()
  const result: T[] = []
  for (const item of items) {
    const value = item[key]
    if (seen.has(value)) continue
    seen.add(value)
    result.push(item)
  }
  return result
}
