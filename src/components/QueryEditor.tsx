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

import React, { ChangeEvent } from 'react';
import { InlineField, Input, Select } from '@grafana/ui';
import { QueryEditorProps, SelectableValue } from '@grafana/data';
import { DataSource } from '../datasource';
import { MyDataSourceOptions, MyQuery, LogsTier, DEFAULT_QUERY } from '../types';

type Props = QueryEditorProps<DataSource, MyQuery, MyDataSourceOptions>;

const TIER_OPTIONS: Array<SelectableValue<LogsTier>> = [
  { label: 'Priority insights', value: 'frequent_search', description: 'Search recent, frequently accessed logs' },
  { label: 'Archive', value: 'archive', description: 'Search archived logs' },
  { label: 'Unspecified', value: 'unspecified', description: 'Let the API choose the tier' },
];

export function QueryEditor({ query, onChange, onRunQuery }: Props) {
  const onQueryTextChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange({ ...query, queryText: event.target.value });
    // executes the query
    onRunQuery();
  };

  const onLimitChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange({ ...query, limit: parseFloat(event.target.value) });
    // executes the query
    onRunQuery();
  };

  const onTierChange = (option: SelectableValue<LogsTier>) => {
    onChange({ ...query, tier: option.value });
    // executes the query
    onRunQuery();
  };

  const { queryText, limit, tier } = query;

  return (
    <div className="gf-form">
      <InlineField label="Limit" tooltip="Num lines to return from API. Max 12000">
        <Input onChange={onLimitChange} value={limit || 1000} width={8} type="number" step="1" />
      </InlineField>
      <InlineField label="Tier" tooltip="Log tier to search">
        <Select
          onChange={onTierChange}
          options={TIER_OPTIONS}
          value={tier || DEFAULT_QUERY.tier}
          width={20}
        />
      </InlineField>
      <InlineField label="Query Text" labelWidth={16} tooltip="Log query in Lucene format">
        <Input onChange={onQueryTextChange} value={queryText || ''} />
      </InlineField>
    </div>
  );
}
