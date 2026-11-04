import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import { QueryEditor } from './QueryEditor';
import { MyQuery } from '../types';

function setup(overrides: Partial<MyQuery> = {}) {
  const query: MyQuery = { refId: 'A', queryText: 'message: test', limit: 100, ...overrides };
  const onChange = jest.fn();
  const onRunQuery = jest.fn();
  render(<QueryEditor query={query} onChange={onChange} onRunQuery={onRunQuery} datasource={{} as any} />);
  return { query, onChange, onRunQuery };
}

/** Open a Grafana Select (react-select) by its aria-label and click an option by its text. */
function chooseOption(selectLabel: string, optionText: string) {
  const input = screen.getByLabelText(selectLabel);
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.click(screen.getByText(optionText));
}

describe('QueryEditor', () => {
  describe('syntax', () => {
    it('shows Lucene when no syntax is saved', () => {
      setup({ syntax: undefined });
      expect(screen.getByText('Lucene')).toBeInTheDocument();
    });

    it('shows Lucene for an unknown saved syntax value', () => {
      setup({ syntax: 'DataPrime' as any });
      expect(screen.getByText('Lucene')).toBeInTheDocument();
    });

    it('shows DataPrime when saved', () => {
      setup({ syntax: 'dataprime' });
      expect(screen.getByText('DataPrime')).toBeInTheDocument();
    });

    it('updates syntax, keeps other fields, and runs the query when DataPrime is chosen', () => {
      const { query, onChange, onRunQuery } = setup();
      chooseOption('Syntax', 'DataPrime');
      expect(onChange).toHaveBeenCalledWith({ ...query, syntax: 'dataprime' });
      expect(onRunQuery).toHaveBeenCalledTimes(1);
    });
  });

  describe('tier', () => {
    it('defaults to Priority insights when no tier is saved', () => {
      setup({ tier: undefined });
      expect(screen.getByText('Priority insights')).toBeInTheDocument();
    });

    it('updates tier and runs the query when Archive is chosen', () => {
      const { query, onChange, onRunQuery } = setup();
      chooseOption('Tier', 'Archive');
      expect(onChange).toHaveBeenCalledWith({ ...query, tier: 'archive' });
      expect(onRunQuery).toHaveBeenCalledTimes(1);
    });
  });

  describe('query text', () => {
    it('updates the query on typing without running it', () => {
      const { query, onChange, onRunQuery } = setup();
      fireEvent.change(screen.getByLabelText('Query Text'), { target: { value: 'source logs | filt' } });
      expect(onChange).toHaveBeenCalledWith({ ...query, queryText: 'source logs | filt' });
      expect(onRunQuery).not.toHaveBeenCalled();
    });

    it('runs the query on blur', () => {
      const { onRunQuery } = setup();
      fireEvent.blur(screen.getByLabelText('Query Text'));
      expect(onRunQuery).toHaveBeenCalledTimes(1);
    });

    it('runs the query on Enter but not on other keys', () => {
      const { onRunQuery } = setup();
      const input = screen.getByLabelText('Query Text');
      fireEvent.keyDown(input, { key: 'a' });
      expect(onRunQuery).not.toHaveBeenCalled();
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(onRunQuery).toHaveBeenCalledTimes(1);
    });
  });

  describe('limit', () => {
    it('updates the limit on typing without running the query, and runs on blur', () => {
      const { query, onChange, onRunQuery } = setup();
      const input = screen.getByLabelText('Limit');
      fireEvent.change(input, { target: { value: '500' } });
      expect(onChange).toHaveBeenCalledWith({ ...query, limit: 500 });
      expect(onRunQuery).not.toHaveBeenCalled();
      fireEvent.blur(input);
      expect(onRunQuery).toHaveBeenCalledTimes(1);
    });

    it('falls back to the default limit when the field is cleared', () => {
      const { query, onChange } = setup();
      fireEvent.change(screen.getByLabelText('Limit'), { target: { value: '' } });
      expect(onChange).toHaveBeenCalledWith({ ...query, limit: 1000 });
    });
  });
});
