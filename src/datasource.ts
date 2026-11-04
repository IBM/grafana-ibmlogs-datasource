/**
 * (C) Copyright IBM 2023.
 *
 * This code is licensed under the Apache License, Version 2.0. You may
 * obtain a copy of this license in the LICENSE file in the root directory
 * of this source tree or at http://www.apache.org/licenses/LICENSE-2.0.
 *
 * Any modifications or derivative works of this code must retain this
 * copyright notice, and modified files need to carry a notice indicating
 * that they have been altered from the originals.
 */

import {
  DataQueryError,
  DataQueryRequest,
  DataQueryResponse,
  DataSourceApi,
  DataSourceInstanceSettings,
  MutableDataFrame,
  FieldType,
} from '@grafana/data';

import { getTemplateSrv } from '@grafana/runtime';

import { MyQuery, MyDataSourceOptions, DEFAULT_QUERY, normalizeSyntax } from './types';

import { createParser, type EventSourceMessage } from 'eventsource-parser';

const MAX_ERROR_DETAIL = 500;

/**
 * Best-effort read of an error response body so API messages (e.g. query parse errors) reach the user.
 * IBM Cloud Logs returns `{"errors":[{"code":..., "message":...}], ...}`; prefer those messages over raw JSON.
 */
async function errorDetail(response: Response): Promise<string> {
  let text: string;
  try {
    text = (await response.text()).trim();
  } catch {
    return '';
  }
  if (!text) {
    return '';
  }
  try {
    const messages = (JSON.parse(text)?.errors ?? [])
      .map((e: any) => e?.message)
      .filter((m: unknown): m is string => typeof m === 'string' && m.length > 0);
    if (messages.length > 0) {
      return ` - ${messages.join('; ')}`;
    }
  } catch {
    // not JSON; fall through to the raw body
  }
  return ` - ${text.slice(0, MAX_ERROR_DETAIL)}`;
}

function streamErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }
  const message = (error as { message?: unknown })?.message;
  return typeof message === 'string' && message ? message : JSON.stringify(error);
}

export class DataSource extends DataSourceApi<MyQuery, MyDataSourceOptions> {
  endpoint: string;
  url?: string;

  constructor(instanceSettings: DataSourceInstanceSettings<MyDataSourceOptions>) {
    super(instanceSettings);
    this.endpoint = instanceSettings.jsonData.endpoint;
    this.url = instanceSettings.url;
  }

  async doRequest(path: string, params?: any, method = 'POST'): Promise<Response> {
    try {
      if (!this.url) {
        throw new Error('Datasource URL is not configured');
      }

      const url = this.url + '/logs' + path;
      const hasBody = method !== 'GET' && method !== 'HEAD' && params !== undefined;
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: hasBody ? JSON.stringify(params) : undefined,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Request failed for ${path}:`, error);
      throw new Error(`Failed to fetch from IBM Logs: ${errorMessage}`);
    }
  }

  async doStream(path: string, params?: any): Promise<any[]> {
    try {
      if (!this.url) {
        throw new Error('Datasource URL is not configured');
      }

      const url = this.url + '/logs' + path;
      const response = await fetch(url, {
        method: 'POST',
        cache: 'no-cache',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}${await errorDetail(response)}`
        );
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      const dataFrames: any[] = [];
      // The API can report query failures (e.g. a DataPrime parse error) as an
      // `error` item inside an HTTP 200 stream, so collect those as well
      const streamErrors: string[] = [];

      function onEvent(event: EventSourceMessage) {
        let data: any;
        try {
          data = JSON.parse(event.data);
        } catch (error) {
          console.warn('Failed to parse event data:', error);
          return;
        }
        if (data?.error) {
          streamErrors.push(streamErrorMessage(data.error));
        }
        data?.result?.results?.forEach((result: any) => {
          dataFrames.push(result);
        });
      }

      const parser = createParser({ onEvent });

      try {
        while (true) {
          const { value, done } = await reader.read();

          if (done) {
            break;
          }

          if (value) {
            parser.feed(new TextDecoder().decode(value));
          }
        }
      } finally {
        reader.releaseLock();
      }

      if (streamErrors.length > 0) {
        throw new Error(streamErrors.join('; '));
      }

      return dataFrames;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Stream failed for ${path}:`, error);
      throw new Error(`Failed to stream from IBM Logs: ${errorMessage}`);
    }
  }

  async query(options: DataQueryRequest<MyQuery>): Promise<DataQueryResponse> {
    try {
      const { range } = options;

      if (!range) {
        return {
          data: [],
          error: { message: 'Time range is required' },
        };
      }

      const start_date = new Date(range.from.valueOf()).toISOString();
      const end_date = new Date(range.to.valueOf()).toISOString();

      const frames: any = [];
      const errors: DataQueryError[] = [];

      const promises = options.targets.map(async (target) => {
        try {
          if (!target.queryText || target.queryText.trim() === '') {
            console.warn(`Skipping target ${target.refId}: empty query`);
            return;
          }

          const query = getTemplateSrv().replace(target.queryText, options.scopedVars);
          const metadata = {
            start_date,
            end_date,
            limit: target.limit,
            tier: target.tier || DEFAULT_QUERY.tier,
            syntax: normalizeSyntax(target.syntax),
          };

          const response = await this.doStream('/v1/query', { query, metadata });

          if (!response || response.length === 0) {
            return;
          }

          const frame = new MutableDataFrame({
            refId: target.refId,
            meta: {
              preferredVisualisationType: 'logs',
            },
            fields: [
              { name: 'timestamp', type: FieldType.time },
              { name: 'message', type: FieldType.string },
              { name: 'labels', type: FieldType.other },
              { name: 'severity', type: FieldType.string },
              { name: 'body', type: FieldType.string },
            ],
          });

          response.forEach((line: any) => {
            try {
              if (!line || !line.user_data) {
                console.warn('Invalid log line, skipping:', line);
                return;
              }

              let userData: any = {};
              try {
                userData = JSON.parse(line.user_data);
                if (userData.text) {
                  userData = JSON.parse(userData.text);
                }
              } catch (error) {
                console.warn('Failed to parse user_data, using raw value:', error);
                userData = { message: line.user_data };
              }

              const level = userData.level || 'info';
              const timestamp = userData.time || new Date().toISOString();
              const message = userData.message || userData.msg || userData.log || line.user_data;

              frame.add({
                timestamp,
                severity: level,
                message,
                body: line.user_data,
                labels: { app: userData.kubernetes?.labels?.app, level: level },
              });
            } catch (error) {
              console.error('Failed to process log line:', error, line);
            }
          });

          frames.push(frame);
        } catch (error) {
          console.error(`Query failed for target ${target.refId}:`, error);
          // Continue processing other targets instead of failing entire query,
          // but surface the failure on the panel instead of silently showing no data
          errors.push({
            refId: target.refId,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      });

      await Promise.all(promises);
      return errors.length > 0 ? { data: frames, errors } : { data: frames };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Query execution failed:', error);
      return {
        data: [],
        error: { message: `Query failed: ${errorMessage}` },
      };
    }
  }

  async testDatasource() {
    try {
      // Validate configuration first
      if (!this.url) {
        return {
          status: 'error',
          message: 'Datasource URL is not configured',
        };
      }

      if (!this.endpoint) {
        return {
          status: 'error',
          message: 'IBM Logs endpoint is not configured',
        };
      }

      // Test connection
      await this.doRequest('/v1/data_usage', {}, 'GET');

      return {
        status: 'ok',
        message: 'Successfully connected to IBM Logs service',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('HTTP 401') || errorMessage.includes('HTTP 403')) {
        return {
          status: 'error',
          message: 'Authentication failed. Please check your API key.',
        };
      }

      return {
        status: 'error',
        message: `Connection error: ${errorMessage}`,
      };
    }
  }
}
