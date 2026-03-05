## 2.1.1

### Changes

- Add staging deployed url to builds

## 2.1.0

### Features

- Fixed log timestamp formatting to properly display log entries in Grafana
- Updated to current Grafana version (9.5.3) for better compatibility

### Improvements

- Added local-build script for easier development workflow
- Improved .gitignore to prevent accidental commits of sensitive files, backups, and OS-specific files
- Fixed npm dependency issues for cleaner installations
- Configured Mend (WhiteSource) for automated security scanning

### CI/CD Enhancements

- Updated automation to generate release notes automatically
- Improved release script to avoid draft releases
- Configured release process to only trigger on version tags, not normal pushes

## 2.0.1

### Changes

- Automate the release process

