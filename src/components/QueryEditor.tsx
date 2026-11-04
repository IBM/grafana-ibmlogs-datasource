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

import React, { ChangeEvent, KeyboardEvent } from 'react';
import { InlineField, Input, Select } from '@grafana/ui';
import { QueryEditorProps, SelectableValue } from '@grafana/data';
import { DataSource } from '../datasource';
import { MyDataSourceOptions, MyQuery, LogsTier, LogsSyntax, DEFAULT_QUERY, normalizeSyntax } from '../types';

type Props = QueryEditorProps<DataSource, MyQuery, MyDataSourceOptions>;

const TIER_OPTIONS: Array<SelectableValue<LogsTier>> = [
  { label: 'Priority insights', value: 'frequent_search', description: 'Search recent, frequently accessed logs' },
  { label: 'Archive', value: 'archive', description: 'Search archived logs' },
  { label: 'Unspecified', value: 'unspecified', description: 'Let the API choose the tier' },
];

const SYNTAX_OPTIONS: Array<SelectableValue<LogsSyntax>> = [
  { label: 'Lucene', value: 'lucene', description: 'Lucene query syntax' },
  { label: 'DataPrime', value: 'dataprime', description: 'IBM Cloud Logs DataPrime query language' },
];

const SYNTAX_LABELS: Record<LogsSyntax, string> = {
  lucene: 'Lucene',
  dataprime: 'DataPrime',
};

export function QueryEditor({ query, onChange, onRunQuery }: Props) {
  const onQueryTextChange = (event: ChangeEvent<HTMLInputElement>) => {
    // Don't run on every keystroke: a half-typed query (especially a DataPrime
    // pipeline) would just produce a parse error. Run on blur or Enter instead.
    onChange({ ...query, queryText: event.target.value });
  };

  const onLimitChange = (event: ChangeEvent<HTMLInputElement>) => {
    // An empty or invalid field falls back to the default rather than saving NaN
    const value = parseInt(event.target.value, 10);
    onChange({ ...query, limit: Number.isFinite(value) && value > 0 ? value : DEFAULT_QUERY.limit! });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      onRunQuery();
    }
  };

  const onTierChange = (option: SelectableValue<LogsTier>) => {
    onChange({ ...query, tier: option.value });
    // executes the query
    onRunQuery();
  };

  const onSyntaxChange = (option: SelectableValue<LogsSyntax>) => {
    onChange({ ...query, syntax: option.value });
    // executes the query
    onRunQuery();
  };

  const { queryText, limit, tier } = query;
  const syntax = normalizeSyntax(query.syntax);

  return (
    <div className="gf-form">
      <InlineField label="Limit" tooltip="Num lines to return from API. Max 12000">
        <Input
          aria-label="Limit"
          onChange={onLimitChange}
          onBlur={onRunQuery}
          onKeyDown={onKeyDown}
          value={limit || 1000}
          width={8}
          type="number"
          step="1"
        />
      </InlineField>
      <InlineField label="Tier" tooltip="Log tier to search">
        <Select
          aria-label="Tier"
          onChange={onTierChange}
          options={TIER_OPTIONS}
          value={tier || DEFAULT_QUERY.tier}
          width={20}
        />
      </InlineField>
      <InlineField label="Syntax" tooltip="Query language used for the query text">
        <Select aria-label="Syntax" onChange={onSyntaxChange} options={SYNTAX_OPTIONS} value={syntax} width={16} />
      </InlineField>
      <InlineField label="Query Text" labelWidth={16} tooltip={`Log query in ${SYNTAX_LABELS[syntax]} format`}>
        <Input
          aria-label="Query Text"
          onChange={onQueryTextChange}
          onBlur={onRunQuery}
          onKeyDown={onKeyDown}
          value={queryText || ''}
        />
      </InlineField>
    </div>
  );
}
