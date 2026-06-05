/**
 * @utils-book 数组排序工具
 */

/** @utils-book 数字数组升序排序，返回新数组，不修改原数组 */
export function sortAsc(nums: number[]): number[] {
  return [...nums].sort((a, b) => a - b)
}

/** @utils-book 数字数组降序排序，返回新数组 */
export function sortDesc(nums: number[]): number[] {
  return [...nums].sort((a, b) => b - a)
}
