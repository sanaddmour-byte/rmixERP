import type { Request } from "express";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export interface PaginationParams {
  limit: number;
  offset: number;
  page: number;
  pageSize: number;
}

/** Shared `?page=&pageSize=` parsing for every list endpoint. */
export function parsePagination(req: Request): PaginationParams {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(req.query.pageSize) || DEFAULT_PAGE_SIZE));
  return { limit: pageSize, offset: (page - 1) * pageSize, page, pageSize };
}

export interface PaginatedBody<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function paginatedBody<T>(items: T[], total: number, params: PaginationParams): PaginatedBody<T> {
  return { items, total, page: params.page, pageSize: params.pageSize };
}
