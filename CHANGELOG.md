# Changelog

All notable changes to **GitIQ** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-08-07

### Added
- **AI Conventional Commit Generator**: Automatically analyzes staged diffs and generates structured conventional commit messages using Groq AI (`llama-3.3-70b-versatile`).
- **AI Commit Explanation**: Generates plain English explanations of any commit (purpose, affected files, major code changes, potential impact).
- **AI Pull Request Helper**: Automatically constructs professional Pull Request documents with Title, Summary, Detailed Description, Files Changed, Testing, Breaking Changes, and Checklist.
- **Offline Commit History Analytics**: Local keyword search (`git log --all --grep`), 7-day activity tables, repository statistics (age, average commits/day, total count), and top contributor rankings (`git shortlog -sn`).
- **Git & GitHub Navigation Tools**: Quick commands for Git Push, Pull, Fetch, Current Branch view, Repository Information summary, and browser shortcuts to GitHub Repository and Branch views.
- **Secure SecretStorage Integration**: Securely stores Groq API keys in VS Code `SecretStorage` (`vscode.SecretStorage`) with password masking and one-click legacy settings migration.
- **Groq Model Selector**: Built-in QuickPick menu supporting `llama-3.3-70b-versatile`, `llama-3.1-8b-instant`, `openai/gpt-oss-120b`, and `deepseek-r1-distill-llama-70b`.

### Improved
- **Pull Request Completeness Engine**: Added strict markdown section header validation and sentence boundary checks to prevent truncated AI responses.
- **Token Budget Scaling**: Scaled completion budgets dynamically up to 2048 tokens for complex multi-paragraph Pull Requests.
- **Read-Only Virtual Documents**: Custom Virtual Document Providers for diff previews, commit statistics, commit explanations, and pull requests under dedicated `gitiq-*` schemes.
- **Diagnostic Logging**: Dedicated VS Code Output Channel (`GitIQ`) with secret-masked logging.

### Fixed
- Fixed raw response sanitization to remove code fences, quotes, markdown wrappers, and leading whitespace from commit message subjects.
- Fixed non-blocking startup error handling when no API key is configured.

### Security
- Zero plain text API key storage in `settings.json`. All credentials are moved to OS-level secure storage via `vscode.SecretStorage`.
- Zero background telemetry, external tracking scripts, or analytical telemetry calls.

---

## [0.1.0] - 2026-08-01

### Added
- Initial project prototype with Groq SDK integration and basic Conventional Commit UI.
