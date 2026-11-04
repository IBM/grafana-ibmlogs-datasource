import { DataSourceInstanceSettings } from '@grafana/data';

jest.mock('@grafana/runtime', () => ({
  getTemplateSrv: () => ({
    replace: (query: string) => query,
  }),
}));

import { DataSource } from './datasource';
import { MyDataSourceOptions, MyQuery } from './types';

function createDataSource(url = 'http://localhost/api/datasources/proxy/1') {
  const instanceSettings: DataSourceInstanceSettings<MyDataSourceOptions> = {
    id: 1,
    uid: 'test-uid',
    type: 'sdague-ibmlogs-datasource',
    name: 'ibmlogs-test',
    url,
    access: 'proxy',
    jsonData: { endpoint: 'https://example.logs.cloud.ibm.com' },
    meta: {} as DataSourceInstanceSettings['meta'],
    readOnly: false,
  };
  return new DataSource(instanceSettings);
}

describe('DataSource', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe('testDatasource', () => {
    it('sends a GET request with no body', async () => {
      const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '' });
      global.fetch = fetchMock as unknown as typeof fetch;

      const ds = createDataSource();
      const result = await ds.testDatasource();

      expect(result.status).toBe('ok');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, init] = fetchMock.mock.calls[0];
      expect(init.method).toBe('GET');
      expect(init.body).toBeUndefined();
    });

    it('reports an authentication error on 401', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized' }) as unknown as typeof fetch;

      const ds = createDataSource();
      const result = await ds.testDatasource();

      expect(result.status).toBe('error');
      expect(result.message).toMatch(/Authentication failed/);
    });

    it('reports a config error when the datasource URL is missing', async () => {
      const ds = createDataSource('');
      const result = await ds.testDatasource();

      expect(result.status).toBe('error');
      expect(result.message).toMatch(/URL is not configured/);
    });
  });

  describe('query', () => {
    function makeTarget(overrides: Partial<MyQuery>): MyQuery {
      return { refId: 'A', queryText: 'message: test', limit: 100, ...overrides };
    }

    it('sends each target its own limit and tier without cross-contamination', async () => {
      const ds = createDataSource();
      const calls: any[] = [];
      jest.spyOn(ds, 'doStream').mockImplementation(async (_path, params) => {
        calls.push(params.metadata);
        return [];
      });

      await ds.query({
        targets: [
          makeTarget({ refId: 'A', limit: 100, tier: 'archive' }),
          makeTarget({ refId: 'B', limit: 500, tier: 'unspecified' }),
        ],
        range: { from: { valueOf: () => 0 }, to: { valueOf: () => 1000 } },
      } as any);

      const byRefId = Object.fromEntries(calls.map((m) => [m.limit, m]));
      expect(calls).toHaveLength(2);
      expect(byRefId[100].tier).toBe('archive');
      expect(byRefId[500].tier).toBe('unspecified');
    });

    it('defaults tier to frequent_search when not set on the target', async () => {
      const ds = createDataSource();
      let capturedMetadata: any;
      jest.spyOn(ds, 'doStream').mockImplementation(async (_path, params) => {
        capturedMetadata = params.metadata;
        return [];
      });

      await ds.query({
        targets: [makeTarget({ tier: undefined })],
        range: { from: { valueOf: () => 0 }, to: { valueOf: () => 1000 } },
      } as any);

      expect(capturedMetadata.tier).toBe('frequent_search');
    });

    it('sends each target its own syntax', async () => {
      const ds = createDataSource();
      const calls: any[] = [];
      jest.spyOn(ds, 'doStream').mockImplementation(async (_path, params) => {
        calls.push(params.metadata);
        return [];
      });

      await ds.query({
        targets: [
          makeTarget({ refId: 'A', limit: 100, syntax: 'dataprime' }),
          makeTarget({ refId: 'B', limit: 500, syntax: 'lucene' }),
        ],
        range: { from: { valueOf: () => 0 }, to: { valueOf: () => 1000 } },
      } as any);

      const byLimit = Object.fromEntries(calls.map((m) => [m.limit, m]));
      expect(calls).toHaveLength(2);
      expect(byLimit[100].syntax).toBe('dataprime');
      expect(byLimit[500].syntax).toBe('lucene');
    });

    it('defaults syntax to lucene when not set on the target', async () => {
      const ds = createDataSource();
      let capturedMetadata: any;
      jest.spyOn(ds, 'doStream').mockImplementation(async (_path, params) => {
        capturedMetadata = params.metadata;
        return [];
      });

      await ds.query({
        targets: [makeTarget({ syntax: undefined })],
        range: { from: { valueOf: () => 0 }, to: { valueOf: () => 1000 } },
      } as any);

      expect(capturedMetadata.syntax).toBe('lucene');
    });

    it('coerces an unknown saved syntax value to lucene', async () => {
      const ds = createDataSource();
      let capturedMetadata: any;
      jest.spyOn(ds, 'doStream').mockImplementation(async (_path, params) => {
        capturedMetadata = params.metadata;
        return [];
      });

      await ds.query({
        targets: [makeTarget({ syntax: 'DataPrime' as any })],
        range: { from: { valueOf: () => 0 }, to: { valueOf: () => 1000 } },
      } as any);

      expect(capturedMetadata.syntax).toBe('lucene');
    });

    it('reports a failed target as an error with its refId while other targets still return data', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      const ds = createDataSource();
      jest.spyOn(ds, 'doStream').mockImplementation(async (_path, params) => {
        if (params.metadata.limit === 100) {
          throw new Error('HTTP 400: Bad Request - unexpected token');
        }
        return [{ user_data: JSON.stringify({ message: 'hello', level: 'info' }) }];
      });

      const result = await ds.query({
        targets: [makeTarget({ refId: 'A', limit: 100 }), makeTarget({ refId: 'B', limit: 500 })],
        range: { from: { valueOf: () => 0 }, to: { valueOf: () => 1000 } },
      } as any);

      expect(result.errors).toEqual([{ refId: 'A', message: 'HTTP 400: Bad Request - unexpected token' }]);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].refId).toBe('B');
    });

    it('returns no errors when all targets succeed', async () => {
      const ds = createDataSource();
      jest.spyOn(ds, 'doStream').mockResolvedValue([]);

      const result = await ds.query({
        targets: [makeTarget({})],
        range: { from: { valueOf: () => 0 }, to: { valueOf: () => 1000 } },
      } as any);

      expect(result.errors).toBeUndefined();
    });
  });

  describe('doStream', () => {
    function sseResponse(...events: object[]) {
      const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
      const chunks = [new TextEncoder().encode(body)];
      return {
        ok: true,
        status: 200,
        body: {
          getReader: () => ({
            read: async () => (chunks.length ? { value: chunks.shift(), done: false } : { done: true }),
            releaseLock: () => {},
          }),
        },
      };
    }

    it('returns result rows from the stream', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue(sseResponse({ result: { results: [{ user_data: 'a' }, { user_data: 'b' }] } })) as any;

      const ds = createDataSource();
      await expect(ds.doStream('/v1/query', {})).resolves.toEqual([{ user_data: 'a' }, { user_data: 'b' }]);
    });

    it('throws when the stream reports a query error', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      global.fetch = jest
        .fn()
        .mockResolvedValue(
          sseResponse({ query_id: { query_id: 'q1' } }, { error: { message: 'unexpected token filt' } })
        ) as any;

      const ds = createDataSource();
      await expect(ds.doStream('/v1/query', {})).rejects.toThrow('unexpected token filt');
    });

    it('includes a non-JSON API error body in the thrown message', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        text: async () => 'upstream unavailable',
      }) as unknown as typeof fetch;

      const ds = createDataSource();
      await expect(ds.doStream('/v1/query', {})).rejects.toThrow('HTTP 502 Bad Gateway - upstream unavailable');
    });

    it('extracts the messages from an IBM Cloud Logs JSON error body', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      // Shape observed from the live API for a malformed DataPrime query (HTTP/2, so no statusText)
      const body = JSON.stringify({
        errors: [
          {
            code: 'bad_request_or_unspecified',
            message: 'Compilation errors:\n - expected one of keywords: [filter,limit] at [0:14:14-0:18:18]: `filt`',
          },
        ],
        trace: 'trace-id',
        status_code: 400,
      });
      global.fetch = jest
        .fn()
        .mockResolvedValue({ ok: false, status: 400, statusText: '', text: async () => body }) as any;

      const ds = createDataSource();
      const err = await ds.doStream('/v1/query', {}).catch((e) => e);
      expect(err.message).toContain('HTTP 400 - Compilation errors:');
      expect(err.message).toContain('`filt`');
      expect(err.message).not.toContain('trace-id');
    });
  });
});
