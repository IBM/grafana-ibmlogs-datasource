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
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized' }) as unknown as typeof fetch;

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
  });
});
