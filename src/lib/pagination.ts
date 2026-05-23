export type PaginationInput = {
  page: number;
  pageSize: number;
};

export type PaginatedResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

export function normalizePagination(input: PaginationInput) {
  const page = Number.isFinite(input.page) && input.page > 0 ? input.page : 1;
  const pageSize =
    Number.isFinite(input.pageSize) && input.pageSize > 0
      ? input.pageSize
      : 10;

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

export function createPaginatedResult<T>(
  items: T[],
  input: PaginationInput,
  totalItems: number,
): PaginatedResult<T> {
  const totalPages = Math.max(1, Math.ceil(totalItems / input.pageSize));

  return {
    items,
    page: input.page,
    pageSize: input.pageSize,
    totalItems,
    totalPages,
  };
}
