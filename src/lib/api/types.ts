export type PaginationParams = {
  page?: number;
  pageSize?: number;
};

export type Paginated<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
};
