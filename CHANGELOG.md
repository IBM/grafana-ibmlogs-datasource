# Changelog

## 2.3.0

### Changes

- Fix "Save & test" failing with a fetch error: GET requests to the
  IBM Logs health check were incorrectly sent with a request body,
  which browsers reject for GET/HEAD methods
- Fix authentication failures (401/403) reporting a generic connection
  error instead of the intended "Authentication failed" message
- Add unit test coverage for the datasource connection test path
- Migrate to Grafana 13.2.1 and React 19 to resolve all `npm audit`
  vulnerabilities (previously 16, including 7 high severity); minimum
  supported Grafana version is now 11.0.0
- Replace the unmaintained Cypress end-to-end setup with Playwright

## 2.2.0

### Changes

- Add comprehensive error handling to datasource
- Automate release tagging from package.json version bump
- Update dependencies and bump node version
- Update GitHub Actions to current versions

## 2.1.0

### Changes

- Fix timestamp parsing
- Make level parsing functional

## 2.0.2

### Changes

- Automate release to include release notes

## 2.0.1

### Changes

- Automate the release process

## 2.0.0

### Changes

- Convert to IBM Logs API: this plugin now targets the IBM Logs
  service in IBM Cloud. With the deprecation and sunset of Mezmo in
  IBM Cloud the prior plugin was no longer needed for our use

## 1.0.3

### Changes

- Fixed to have working build instructions and `build.sh` to make the
  plugin load correctly in grafana environments.

- Final release of Mezmo based plugin

## 1.0.0

Initial release.
