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
//  MutableDataFrame,
//  FieldType,
} from '@grafana/data';

import { getBackendSrv, getTemplateSrv } from '@grafana/runtime';

import { MyQuery, MyDataSourceOptions } from './types';

export class DataSource extends DataSourceApi<MyQuery, MyDataSourceOptions> {
  endpoint: string;
  url?: string;

  constructor(instanceSettings: DataSourceInstanceSettings<MyDataSourceOptions>) {
    super(instanceSettings);
    this.endpoint = instanceSettings.jsonData.endpoint;
    this.url = instanceSettings.url;
  }

  async doRequest(path: any, params?: any, method = 'POST') {
    const req = {
      method,
      url: this.url + "/logs" + path,
      params
    }
    const result = await getBackendSrv().datasourceRequest(req);
    return result;
  }

  async doStream(path: any, params?: any) {
    const url = this.url + "/logs" + path;
    const response = await fetch(url, {
      method: "POST",
      cache: "no-cache",
      keepalive: true,
      headers: {
          "Content-Type": "application/json",
          "Accept": "text/event-stream",
      },
      body: JSON.stringify(params)
    });

    const reader = response?.body?.getReader();
    if (reader == null) {
      return;
    }

    while (true) {
      const {value, done} = await reader.read();
      if (done) {break;}

      console.log('get.message', new TextDecoder().decode(value));
    }
  }

  async query(options: DataQueryRequest<MyQuery>): Promise<DataQueryResponse> {
    const { range } = options;
    const start_date = new Date(range!.from.valueOf()).toISOString();
    const end_date = new Date(range!.to.valueOf()).toISOString();

    const metadata = {
      start_date,
      end_date,
      limit: 1000,
      tier: "frequent_search",
      strict_fields_validation: false,
      syntax: "lucene"
    }

    const frames: any = [];

    const promises = options.targets.map((target) => {
        const query = getTemplateSrv().replace(target.queryText, options.scopedVars);
        console.log(query, metadata);

        return this.doStream('/v1/query', {query, metadata }).then((response) => {
          console.log(response);
/*         response.data?.lines?.forEach((line: any) => {
          const frame = new MutableDataFrame({
            refId: target.refId,
            meta: {
              preferredVisualisationType: 'logs',
            },
            fields: [
              { name: 'time', type: FieldType.time },
              { name: 'message', type: FieldType.string, labels: { app: line._app || '' } },
              { name: 'level', type: FieldType.string },
              { name: 'content', type: FieldType.string },
              { name: 'app', type: FieldType.string }
            ],
          });
          frame.add({time: line._ts, level: line.level, message: line.message || line.msg || line._line, app: line._app, content: line._line, labels: { app: line._app } })
          frames.push(frame);
        });
      */ })
    });
    return Promise.all(promises).then(() => ({ data: frames }));
  }

  async testDatasource() {
    // Implement a health check for your data source.
    const response = await this.doRequest('/v1/data_usage', {}, 'GET')
    const status = (response.status === 200) ? 'ok': 'error'

    return {
      status,
      message: response.data.isIngesting
    };
  }
}
