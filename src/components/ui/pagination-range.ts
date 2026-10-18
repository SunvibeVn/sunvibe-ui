export type PaginationRange = {
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
  /** True when the page lies beyond the last page, below 1 or not an integer, for a non-empty result. */
  outOfRange: boolean;
};

/** Pure paging maths for 1-based pages. `total` is the item count, `size` the page size. */
export function paginationRange(page: number, size: number, total: number): PaginationRange {
  const totalPages = size > 0 && total > 0 ? Math.ceil(total / size) : 0;
  const outOfRange = totalPages > 0 && (!Number.isInteger(page) || page < 1 || page > totalPages);
  return {
    totalPages,
    hasPrev: totalPages > 0 && page > 1,
    hasNext: page < totalPages,
    outOfRange,
  };
}
