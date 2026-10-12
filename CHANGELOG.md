# Changelog

All notable changes to **GitIQ** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-10-12

### Added
- **Bring Your Own AI (BYO-AI) Architecture**:
  - **GitHub Copilot Integration**: Native `VSCodeLanguageModelProvider` using official `vscode.lm.selectChatModels()` API. Zero Groq API key required, zero token scraping, streaming token delivery, and cancellation token support.
  - **Google Gemini Provider**: Added `GeminiProvider` with direct REST support for `gemini-1.5-flash` and `gemini-1.5-pro` with secure key storage in `vscode.SecretStorage`.
  - **Ollama Provider**: Added `OllamaProvider` connecting to local offline instances (`http://localhost:11434`) with zero credentials needed.
  - **External Agent / MCP Provider**: Added `MCPProvider` to delegate AI operations to local MCP-compatible servers.
- **Model Context Protocol (MCP) Integration**:
  - Standalone Stdio JSON-RPC 2.0 server (`out/mcp/server.js`) exposing 6 safe GitIQ tools: `get_repository_info`, `get_git_status`, `get_staged_diff`, `search_commit_history`, `generate_commit_message_suggestion`, and `prepare_pull_request_description`.
  - Native VS Code Language Model Tool registration via `vscode.lm.registerTool`.
  - Clear separation between suggestions and executions (`status: "SUGGESTION_ONLY"`, `executed: false`).
- **Interactive Provider Selection UI**:
- **Interactive AI Code Review (Fully Functional)**:
  - **Change Detection Hierarchy**: Analyzes uncommitted working-tree changes first, then staged changes, and falls back to comparing the active branch against base branch.
  - **Large Diff Partitioning**: Safely splits multi-file diffs into context-bounded chunks (`MAX_DIFF_CHUNK_CHARS = 24k`) to avoid context window truncation and loss of critical changes.
  - **Structured Review Findings**: Analyzes changes for critical bugs, security vulnerabilities, performance bottlenecks, broken logic, unhandled errors, and maintainability issues. Formats findings with severity (`Critical`, `High`, `Medium`, `Low`), category, file, line range, problem explanation, impact ("Why it matters"), recommended fix, and code suggestion.
  - **Interactive Sidebar Results Panel**: Integrated into the GitIQ dashboard with visible loading spinner, target indicator, severity badges, expandable finding cards, 1-click file navigation (`openFileAtLine`) with safe line clamping, Retry action for failures, and clean empty state.
  - **Virtual Markdown Report (`CodeReviewProvider`)**: In-memory read-only report provider (`gitiq-code-review`) and command `gitIQ.showCodeReviewReport`.
  - **Automated Test Coverage**: Added 10 tests in `test/codeReviewService.test.cjs` covering working tree, staged, no changes, multi-file extraction, chunking, valid JSON parsing, malformed fallback, missing API key, timeout/rate-limit propagation, and file navigation line clamping.
### Fixed
- **Create Pull Request Generation & Error Handling (Root-Cause Fix)**:
  - **Error Propagation**: Eliminated blanket catch blocks in `PullRequestService` that masked operational errors (auth failures, invalid API keys, rate limits, timeouts, and network errors) as generic "AI generated an incomplete Pull Request" errors. Operational errors are now rethrown immediately with precise, actionable messages.
  - **Robust Schema & Multi-Format Parsing**: Added automatic detection and parsing for JSON structured outputs (`tryParseJsonPullRequest`) from models wrapped in Markdown code fences (` ```json `), raw JSON objects, or standard Markdown.
  - **Flexible Section Headings**: Replaced rigid regex matching with support for flexible section headings (`## Summary`, `## Overview`, `## Description`, `## Changes`, `## Testing`, `## Test Plan`, `## Checklist`) and inline title formats (`## Title: <title>`, `# Pull Request: <title>`).
  - **Git Branch Ref Fallback**: Updated `GitService.getBranchDiff` and `GitService.getBranchCommits` to attempt `origin/${defaultBranch}...HEAD` and automatically fall back to local `${defaultBranch}...HEAD` when remote tracking refs are absent.
  - **Controlled Validation Retries**: Limited retries to at most one attempt with clear validation error diagnostics if both attempts fail.
  - **Unit Testing**: Added 7 comprehensive test scenarios in `test/pullRequestService.test.cjs` expanding the automated test suite to 45 tests (100% passing).
- **Gemini Provider Configuration & Error Routing**:
  - Fixed false-positive Groq error prompt ("API key missing or invalid. Please configure your Groq API key in VS Code Settings.") when using Google Gemini.
  - Fixed `setGeminiApiKey` to automatically switch the active provider to Gemini and refresh the sidebar UI.
  - Fixed `SettingsService.getModel()` to dynamically resolve provider-specific models (`gitIQ.geminiModel`) rather than defaulting to Groq's `llama-3.3-70b-versatile`.
  - Replaced hardcoded Groq error handlers in `generateCommitMessageCommand.ts` with dynamic, provider-aware error messages.
  - Enhanced `GeminiProvider.ts` with official `x-goog-api-key` header authentication and robust Google API error code handling (HTTP 400 `API_KEY_INVALID`, 403, 404, 429).
  - Expanded test suite from 26 to 38 unit tests including live HTTP network verification against Google's API.

### Security
- Complete elimination of token scraping, private cookie inspection, or internal authorization file harvesting.
- Secrets isolated per provider in OS keychain via `vscode.SecretStorage` (`gitiq.groqApiKey`, `gitiq.geminiApiKey`).
- Read-only Git tool defaults and credential scrubbing across MCP endpoints.

---

## [1.1.0] - 2026-10-09

### Added
- **Dedicated Activity Bar Container**: Custom-designed GitIQ vector icon in the VS Code Activity Bar (`resources/icon.svg`).
- **Sidebar UX & Navigation Refactor (`SidebarTreeDataProvider`)**:
  - **Native View Title & Branch Status**: Renamed view to `Dashboard` to eliminate redundant `GitIQ: GitIQ Dashboard` title bar prefix, and wired `treeView.description` to display the active branch dynamically in the native view header.
  - **Removed Redundant Header Node**: Removed fake in-tree header row (`GitIQ AI Git Assistant`) to eliminate awkward hierarchy and wasted vertical space.
  - **Non-Disruptive Repository Item**: Transformed repository row into an expandable container with child details (`Branch`, `Remote`, `View Repository Report`) and removed automatic document-opening on parent click, preventing unwanted editor tab hijacking.
  - **Direct 1-Click Primary Actions**: Promoted *AI Commit*, *Create PR*, and *Commit History* directly to top level without nested `Quick Actions` folder wrappers.
  - **Default-Collapsed Secondary Navigation**: Enforced `vscode.TreeItemCollapsibleState.Collapsed` on all secondary tool sections (*Git & GitHub*, *Pull Requests*, *Commit Analytics*, *AI Tools*, *AI Settings*).
  - **Expansion State Tracking**: Connected `vscode.window.createTreeView` with `onDidExpandElement` and `onDidCollapseElement` listeners and in-provider state tracking (`setExpanded`), guaranteeing user expansions are preserved across refreshes without unwanted re-expansion or forced collapse.
  - **Native Collapse All**: Enabled `showCollapseAll: true` in `createTreeView` for instant 1-click collapse of all open groups.
  - **Short, Clean Labels & Tooltips**: Removed visual noise and wide inline descriptions in favor of concise labels with comprehensive hover tooltips.
  - **Enhanced Build Pipeline**: `npm run compile` automatically invokes `esbuild` bundling to guarantee complete, self-contained output in development and launch hosts.

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
