import { DataQuery, DataSourceJsonData } from '@grafana/data';

export type LogsTier = 'unspecified' | 'frequent_search' | 'archive';

export type LogsSyntax = 'lucene' | 'dataprime';

/**
 * Saved dashboards are untyped JSON, so coerce anything that isn't a known
 * syntax back to the Lucene default rather than sending it to the API.
 */
export function normalizeSyntax(value: unknown): LogsSyntax {
  return value === 'dataprime' ? 'dataprime' : 'lucene';
}

export interface MyQuery extends DataQuery {
  queryText?: string;
  limit: number;
  tier?: LogsTier;
  syntax?: LogsSyntax;
}

export const DEFAULT_QUERY: Partial<MyQuery> = {
  limit: 1000,
  tier: 'frequent_search',
  syntax: 'lucene',
};

/**
 * These are options configured for each DataSource instance
 */
export interface MyDataSourceOptions extends DataSourceJsonData {
  endpoint: string;
}

/**
 * Value that is used in the backend, but never sent over HTTP to the frontend
 */
export interface MySecureJsonData {
  apiKey: string;
}
