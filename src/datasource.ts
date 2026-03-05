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
  DataQueryRequest,
  DataQueryResponse,
  DataSourceApi,
  DataSourceInstanceSettings,
  MutableDataFrame,
  FieldType,
} from '@grafana/data';

import { getTemplateSrv } from '@grafana/runtime';

import { MyQuery, MyDataSourceOptions } from './types';

import { createParser, type EventSourceMessage } from 'eventsource-parser';

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
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: params ? JSON.stringify(params) : undefined,
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
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      const dataFrames: any[] = [];

      function onEvent(event: EventSourceMessage) {
        try {
          const data = JSON.parse(event.data);
          data.result?.results?.forEach((result: any) => {
            dataFrames.push(result);
          });
        } catch (error) {
          console.warn('Failed to parse event data:', error);
        }
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
      const metadata = {
        start_date,
        end_date,
        limit: 1000,
        tier: 'frequent_search',
        syntax: 'lucene',
      };

      const frames: any = [];

      const promises = options.targets.map(async (target) => {
        try {
          if (!target.queryText || target.queryText.trim() === '') {
            console.warn(`Skipping target ${target.refId}: empty query`);
            return;
          }

          const query = getTemplateSrv().replace(target.queryText, options.scopedVars);
          metadata.limit = target.limit;

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
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`Query failed for target ${target.refId}:`, error);
          // Continue processing other targets instead of failing entire query
        }
      });

      await Promise.all(promises);
      return { data: frames };
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
      const response = await this.doRequest('/v1/data_usage', {}, 'GET');

      if (response.status === 200) {
        return {
          status: 'ok',
          message: 'Successfully connected to IBM Logs service',
        };
      }

      if (response.status === 401 || response.status === 403) {
        return {
          status: 'error',
          message: 'Authentication failed. Please check your API key.',
        };
      }

      const errorText = await response.text().catch(() => 'Unknown error');
      return {
        status: 'error',
        message: `Connection failed (HTTP ${response.status}): ${errorText}`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        status: 'error',
        message: `Connection error: ${errorMessage}`,
      };
    }
  }
}
