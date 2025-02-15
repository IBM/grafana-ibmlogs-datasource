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

import {createParser, type EventSourceMessage} from 'eventsource-parser';


export class DataSource extends DataSourceApi<MyQuery, MyDataSourceOptions> {
  endpoint: string;
  url?: string;

  constructor(instanceSettings: DataSourceInstanceSettings<MyDataSourceOptions>) {
    super(instanceSettings);
    this.endpoint = instanceSettings.jsonData.endpoint;
    this.url = instanceSettings.url;
  }

  async doRequest(path: any, params?: any, method = 'POST') {
    const url = this.url + "/logs" + path;
    const req = {
      method,
      params
    }
    const result = await fetch(url, req);
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

    const dataFrames: any[] = [];

    function onEvent(event: EventSourceMessage) {
      const data = JSON.parse(event.data);
      data.result?.results?.forEach((result: any) => {
        dataFrames.push(result);
      })
    }


    const parser = createParser({onEvent})
    while (true) {
      const {value, done} = await reader.read();
      parser.feed(new TextDecoder().decode(value));
      if (done) {return dataFrames}
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
      syntax: "lucene"
    }

    const frames: any = [];

    const promises = options.targets.map((target) => {
        const query = getTemplateSrv().replace(target.queryText, options.scopedVars);
        metadata.limit = target.limit;

        return this.doStream('/v1/query', {query, metadata }).then((response) => {
          if (response == null) { return; }
          response.forEach((line: any) => {
          let userData = JSON.parse(line.user_data)
          if (userData.text) {
            userData = JSON.parse(userData.text)
          }
          const frame = new MutableDataFrame({
            refId: target.refId,
            meta: {
              preferredVisualisationType: 'logs',
            },
            fields: [
              { name: 'time', type: FieldType.time },
              { name: 'message', type: FieldType.string, labels: { app: userData.kubernetes?.labels?.app|| '' } },
              { name: 'level', type: FieldType.string },
              { name: 'content', type: FieldType.string },
              { name: 'app', type: FieldType.string }
            ],
          });
          frame.add({time: userData.time, level: userData.level, message: userData.message || userData.msg || userData.log || line.user_data, app: userData.kubernetes?.labels?.app, content: line.user_data, labels: { app: userData.kubernetes?.labels?.app} })
          frames.push(frame);
        });
      })
    });
    return Promise.all(promises).then(() => ({ data: frames }));
  }

  async testDatasource() {
    // Implement a health check for your data source.
    const response = await this.doRequest('/v1/data_usage', {}, 'GET')
    const status = (response.status === 200) ? 'ok': 'error'

    return {
      status,
      message: response.json()
    };
  }
}
