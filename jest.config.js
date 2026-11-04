// force timezone to UTC to allow tests to work regardless of local timezone
// generally used by snapshots, but can affect specific tests
process.env.TZ = 'UTC';

const { grafanaESModules, nodeModulesToTransform } = require('./.config/jest/utils');

// @grafana/ui 13 pulls in ESM-only packages not yet in the scaffolded list,
// which breaks any test that renders a @grafana/ui component
const extraESModules = [
  '@react-hookz',
  '@ver0',
  'react-calendar',
  'get-user-locale',
  'memoize',
  'mimic-function',
  '@wojtekmaj/date-utils',
];

module.exports = {
  // Jest configuration provided by Grafana scaffolding
  ...require('./.config/jest.config'),
  transformIgnorePatterns: [nodeModulesToTransform([...grafanaESModules, ...extraESModules])],
};
