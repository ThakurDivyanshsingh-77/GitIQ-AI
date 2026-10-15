# PROJECT_CONTEXT.md

> **Single Source of Truth & Memory Bank**
> This file is maintained continuously as a handoff document for future AI agents and developers working on this project. Every code change, configuration update, or feature addition MUST be reflected here.

---

## 1. Project Overview

**GitIQ** (`gitiq`) is an AI-powered Visual Studio Code extension designed to streamline Git workflows (Publisher: `gitiq`, Extension ID: `gitiq.gitiq`). It inspects staged Git changes and generates structured Conventional Commit suggestions, explores commit history, explains diffs with AI, generates complete pull requests, provides offline commit history analytics, and integrates with GitHub.

### Core Features & Philosophy
- **Bring Your Own AI (BYO-AI) Architecture**: Provider-independent architecture allowing users to choose their preferred AI backend without vendor lock-in:
  - **GitHub Copilot**: Native integration via the official `vscode.lm` Language Model API (`vscode.lm.selectChatModels`). Zero Groq API key required, zero token scraping, respect for user consent, streaming, and cancellation tokens.
  - **Google Gemini API**: Direct REST integration supporting `gemini-1.5-flash` and `gemini-1.5-pro` with keys stored securely in `SecretStorage`.
  - **Ollama**: 100% offline local model inference via local HTTP endpoint (`http://localhost:11434`).
  - **Groq API**: High-speed cloud inference via `groq-sdk` with `llama-3.3-70b-versatile`.
  - **MCP / External Agent**: Configurable delegation to local MCP servers.
- **Model Context Protocol (MCP) Integration**:
  - **Standalone Stdio MCP Server** (`out/mcp/server.js`): Exposes 6 safe GitIQ tools to external agents (Claude Code, Google Antigravity, OpenAI Codex, Cursor) via standard JSON-RPC 2.0 stdio transport.
  - **Native VS Code Language Model Tools**: Exposes the same 6 tools directly to Copilot and VS Code agents via `vscode.lm.registerTool`.
  - **Safe & Read-Only**: Strictly read-only by default, sanitizes auth tokens/sensitive files, and labels generated messages explicitly as `SUGGESTION_ONLY` with human approval required.
- **AI-Powered Commits**: Analyzes staged diffs and generates Conventional Commit messages. Suggestions are presented in an editable input box for developer review, then committed on Enter.
- **AI Pull Request Generation**: Generates complete, professional PR documents with title, summary, description, files changed, testing, breaking changes, and checklist from branch diff and commit history.
- **Secure Settings & Configuration**: Stores API keys in VS Code `SecretStorage` (`gitiq.groqApiKey`, `gitiq.geminiApiKey`). Copilot and Ollama require zero keys.
- **Offline Commit History Analytics**: Search commit history by keyword, collect statistics, top contributors, 7-day activity, and export reports offline via Git CLI.
- **Commit History Explorer**: Interactive QuickPick explorer with instant search, detail viewing, AI explanations, and hash copying.
- **GitHub Integration**: Push, pull, fetch, branch display, repository information, direct GitHub browser navigation, and PR page opening.

---

## 2. Tech Stack & Architecture

### Tech Stack
- **Platform / Framework**: VS Code Extension API (`^1.95.0`), Node.js (v20+)
- **Language**: TypeScript (`^5.7.2`) with strict mode enabled
- **External Dependencies**: `groq-sdk` (`^1.5.0`)
- **Build & Bundling**: `esbuild` (`^0.24.2`) for extension and MCP standalone server bundles
- **Linting & Code Quality**: ESLint (`^9.17.0`), `@typescript-eslint`
- **Testing**: Node.js built-in test runner (`node --test`) with standalone mock fixtures

### Architecture & Design Patterns
The codebase follows a **Service-Oriented & Provider Pattern** architecture:

```
src/
├── extension.ts                      # Extension lifecycle, Composition Root, & MCP Tool registration
├── commands/                         # VS Code Command Handlers
│   ├── aiCodeReviewCommand.ts        # AI code review workflow orchestration
│   ├── checkGitRepositoryCommand.ts  # Workspace Git verification
│   ├── commitActivityCommand.ts      # Render 7-day commit activity table
│   ├── commitStatisticsCommand.ts    # Collect repository statistics summary
│   ├── copyCommitHashCommand.ts      # Copy commit hash to clipboard
│   ├── copyEntirePRCommand.ts        # Copy entire PR to clipboard
│   ├── copyPRDescriptionCommand.ts   # Copy PR description to clipboard
│   ├── copyPRTitleCommand.ts         # Copy PR title to clipboard
│   ├── currentBranchCommand.ts       # Show current Git branch
│   ├── explainCommitCommand.ts       # AI commit explanation workflow
│   ├── exportHistoryReportCommand.ts # Export commit-history-report.md
│   ├── fetchCommand.ts              # Git fetch remote updates
│   ├── generateCommitMessageCommand.ts# Orchestrates AI suggestion UI
│   ├── generatePullRequestCommand.ts # AI pull request generation workflow
│   ├── helloCommand.ts               # Basic health check command
│   ├── openBranchCommand.ts          # Open current branch on GitHub
│   ├── openPullRequestPageCommand.ts # Open GitHub compare page
│   ├── openRepositoryCommand.ts      # Open GitHub repo in browser
│   ├── previewGitDiffCommand.ts      # Displays staged diff preview
│   ├── pullCommand.ts               # Git pull from remote origin
│   ├── pushCommand.ts               # Git push to remote origin
│   ├── removeApiKeyCommand.ts        # Remove Groq API key from SecretStorage
│   ├── repositoryInfoCommand.ts      # Repo summary readonly document
│   ├── savePullRequestCommand.ts     # Save PR as pull-request.md
│   ├── searchCommitHistoryCommand.ts # Offline keyword search across commit log
│   ├── selectModelCommand.ts        # QuickPick selector for Groq models
│   ├── selectProviderCommand.ts     # QuickPick selector for active AI Provider
│   ├── setApiKeyCommand.ts          # Prompt & store Groq key in SecretStorage
│   ├── setGeminiApiKeyCommand.ts    # Prompt & store Gemini key in SecretStorage
│   ├── topContributorsCommand.ts     # Display ranked top contributors
│   ├── updateApiKeyCommand.ts       # Update Groq API key in SecretStorage
│   └── viewCommitHistoryCommand.ts   # Interactive commit history explorer
├── mcp/                              # Model Context Protocol Components
│   ├── gitIqMcpServer.ts             # Core MCP tool definitions & execution engine
│   └── server.ts                     # Standalone Stdio JSON-RPC 2.0 MCP server runner
├── models/                           # Domain Data Models
│   ├── codeReviewModels.ts           # Interfaces for ReviewFinding, ReviewSummary, CodeReviewResult
│   └── historyModels.ts              # Interfaces for SearchResultCommit, ContributorStat, etc.
├── providers/                        # AI & Virtual Document Providers
│   ├── AIProvider.ts                 # Abstract contract interface for AI services
│   ├── AIProviderFactory.ts          # Multi-provider resolution factory (GitIQAIProviderFactory)
│   ├── codeReviewProvider.ts         # Read-only in-memory Code Review markdown provider
│   ├── commitDetailsProvider.ts      # Read-only commit detail documents
│   ├── commitExplainProvider.ts      # Read-only AI explanation documents
│   ├── GeminiProvider.ts             # Google Gemini REST API provider
│   ├── GroqProvider.ts               # Groq SDK AI completion client
│   ├── gitDiffPreviewProvider.ts     # TextDocumentContentProvider for diff preview
│   ├── historyPreviewProvider.ts     # Read-only analytics markdown documents
│   ├── languageModelTools.ts         # VS Code Language Model Tool registration adapter
│   ├── MCPProvider.ts                # External Agent / MCP delegation provider
│   ├── OllamaProvider.ts             # Local offline Ollama provider
│   ├── pullRequestProvider.ts       # Read-only AI pull request documents
│   ├── repoInfoProvider.ts          # Read-only repository info document
│   ├── sidebarTreeDataProvider.ts   # Native Activity Bar sidebar TreeDataProvider
│   ├── sidebarWebviewProvider.ts    # Modern WebviewViewProvider with card dashboard UI
│   └── VSCodeLanguageModelProvider.ts# GitHub Copilot (vscode.lm) Language Model provider
├── services/                         # Core Business Logic Services
│   ├── codeReviewService.ts          # Multi-file change detection, diff chunking, review execution
│   ├── commitMessageService.ts       # Orchestrates Diff -> Prompt -> AI -> Validator
│   ├── commitMessageValidator.ts     # Validates AI response format
│   ├── configService.ts              # Typed VS Code configuration manager
│   ├── gitService.ts                 # Isolated git binary process execution
│   ├── historyService.ts             # Offline Git CLI commit analytics & report exporter
│   ├── loggerService.ts              # Output channel logging service ("GitIQ")
│   ├── promptBuilder.ts              # Deterministic AI prompt builder
│   ├── pullRequestService.ts        # AI pull request orchestration service
│   ├── repositoryDetector.ts         # VS Code Git extension API detector, lifecycle tracker, & multi-repo manager
│   └── SettingsService.ts           # Multi-provider SecretStorage & configuration manager
├── types/                            # TypeScript interfaces & domain types
│   ├── commit.ts                     # Commit contracts & validation schemas
│   ├── provider.ts                   # Provider identifiers & config contracts
│   └── vscodeGit.ts                  # Built-in VS Code Git extension API contracts (GitExtension, API, Repository)
└── utils/                            # Utilities & Error domain types
    ├── constants.ts                  # Shared command IDs & configuration keys
    └── errors.ts                     # Custom error hierarchy (GitIQError, ModelAccessDeniedError, etc.)
```

---

## 3. File Structure

```text
gitiq/
├── .vscode/
│   ├── launch.json                   # Launch configuration for F5 Debug Host
│   └── tasks.json                    # VS Code build task configuration
├── src/                              # TypeScript source code
├── docs/
│   └── EXTERNAL_AGENT_COMPATIBILITY.md # Detailed external agent matrix & setup guide
├── test/                             # Automated test suite
│   ├── codeReviewService.test.cjs    # AI code review execution, diff partitioning, & findings tests
│   ├── commitMessageValidator.test.cjs # Commit message format and sanitization tests
│   ├── geminiProvider.test.cjs       # Google Gemini provider & API error mapping tests
│   ├── mcpServer.test.cjs            # MCP tool logic, security, and schema tests
│   ├── mockVscode.cjs                # Standalone VS Code API mock for Node test runner
│   ├── providerSelection.test.cjs    # Multi-provider factory and fallback tests
│   ├── pullRequestService.test.cjs   # Pull request generation, schema validation, & error handling tests
│   ├── repositoryDetection.test.cjs  # VS Code Git API detection, lifecycle states, & multi-repo tests
│   └── vscodeLanguageModelProvider.test.cjs # Copilot LM provider unit tests
├── .agents/
│   └── AGENTS.md                     # Mandatory PROJECT_CONTEXT.md update rule
├── resources/
│   └── icon.svg                      # Activity Bar SVG icon
├── CHANGELOG.md                      # Release notes & version history
├── eslint.config.mjs                 # ESLint configuration
├── package.json                      # Manifest, configuration, & command contribution
├── PROJECT_CONTEXT.md                # AI Handoff & Memory Bank (This File)
├── README.md                         # Developer documentation & user guide
└── tsconfig.json                     # TypeScript compiler configuration
```

---

## 4. Database / State Schemas

*(Stateless Extension)*

Configuration relies on VS Code Workspace Configuration settings (`gitIQ.*`) and SecretStorage:

| Setting Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `gitIQ.provider` | `enum` | `"groq"` | Active AI provider (`groq`, `copilot`, `gemini`, `ollama`, `mcp`). |
| `gitIQ.model` | `string` | `"llama-3.3-70b-versatile"` | Model ID for Groq provider completion requests. |
| `gitIQ.geminiModel` | `string` | `"gemini-1.5-flash"` | Model ID for Gemini provider completion requests. |
| `gitIQ.ollamaEndpoint`| `string` | `"http://localhost:11434"` | Base URL for local Ollama server. |
| `gitIQ.ollamaModel` | `string` | `"llama3.2"` | Model name for Ollama completion requests. |
| `gitIQ.copilotFamily`| `string` | `""` | Optional Copilot model family filter (e.g. `gpt-4o`). |
| `gitIQ.temperature` | `number` | `0.2` | Sampling temperature for AI generation (0.0 to 2.0). |
| `gitIQ.timeout` | `number` | `30000` | AI request timeout in milliseconds. |

### SecretStorage Keys
- `gitiq.groqApiKey`: Stored Groq API authentication key.
- `gitiq.geminiApiKey`: Stored Google Gemini API key.

---

## 5. API Endpoints & Routing

### Contributed VS Code Commands (`package.json`)

| Command ID | Title | Purpose / Handler |
| :--- | :--- | :--- |
| `gitIQ.selectProvider` | `GitIQ: Select AI Provider` | Displays QuickPick selector to switch between Groq, Copilot, Gemini, Ollama, and MCP. |
| `gitIQ.setGeminiApiKey` | `GitIQ: Set Gemini API Key` | Prompts for Gemini key and stores securely in SecretStorage. |
| `gitIQ.setApiKey` | `GitIQ: Set Groq API Key` | Prompts for Groq key and stores securely in SecretStorage. |
| `gitIQ.updateApiKey` | `GitIQ: Update Groq API Key` | Prompts to replace existing Groq key in SecretStorage. |
| `gitIQ.removeApiKey` | `GitIQ: Remove Groq API Key` | Deletes stored Groq key from SecretStorage. |
| `gitIQ.selectModel` | `GitIQ: Select Groq Model` | Displays QuickPick selector for supported Groq models. |
| `gitIQ.generateCommitMessage` | `GitIQ: Generate Commit Message` | Fetches staged diff, queries active AI provider, validates format, shows editable QuickInput, and commits on Enter. |
| `gitIQ.generatePullRequest` | `GitIQ: Generate Pull Request` | Generates complete AI-powered PR document from branch diff and commit history. |
| `gitIQ.explainCommit` | `GitIQ: Explain Commit` | Prompts user to select a commit and generates a plain English AI explanation. |
| `gitIQ.previewGitDiff` | `GitIQ: Preview Git Diff` | Opens read-only virtual diff document for staged changes. |
| `gitIQ.viewCommitHistory` | `GitIQ: View Commit History` | Displays recent commits (`git log -n 20`) in QuickPick with search and details. |
| `gitIQ.searchCommitHistory` | `GitIQ: Search Commit History` | Offline keyword search across commit log (`git log --all --grep`). |
| `gitIQ.commitStatistics` | `GitIQ: Commit Statistics` | Aggregates repository commit metrics and age statistics. |
| `gitIQ.topContributors` | `GitIQ: Top Contributors` | Displays ranked contributor commit counts using `git shortlog -sn`. |
| `gitIQ.commitActivity` | `GitIQ: Commit Activity` | Displays 7-day commit activity breakdown as a Markdown table. |
| `gitIQ.exportHistoryReport` | `GitIQ: Export History Report` | Exports complete Markdown analytics report to `commit-history-report.md`. |
| `gitIQ.copyCommitHash` | `GitIQ: Copy Commit Hash` | QuickPick commit selection that copies hash to clipboard. |
| `gitIQ.push` | `GitIQ: Push Branch` | Pushes current branch to remote origin with progress notification. |
| `gitIQ.pull` | `GitIQ: Pull Branch` | Pulls latest changes from remote origin with merge conflict detection. |
| `gitIQ.fetch` | `GitIQ: Fetch Updates` | Fetches remote references (`git fetch`). |
| `gitIQ.currentBranch` | `GitIQ: Show Current Branch` | Displays the active branch name. |
| `gitIQ.repositoryInfo` | `GitIQ: Repository Information` | Shows repo metadata summary in read-only document. |
| `gitIQ.openRepository` | `GitIQ: Open GitHub Repository` | Opens repository in default browser. |
| `gitIQ.openBranch` | `GitIQ: Open Current Branch on GitHub` | Opens branch view on GitHub in browser. |
| `gitIQ.openPullRequestPage` | `GitIQ: Open Pull Request Page` | Opens GitHub compare URL for PR creation. |
| `gitIQ.copyPRTitle` | `GitIQ: Copy PR Title` | Copies generated PR title to clipboard. |
| `gitIQ.copyPRDescription` | `GitIQ: Copy PR Description` | Copies generated PR description Markdown to clipboard. |
| `gitIQ.copyEntirePR` | `GitIQ: Copy Entire Pull Request` | Copies full generated PR Markdown to clipboard. |
| `gitIQ.savePullRequest` | `GitIQ: Save Pull Request` | Saves generated PR as `pull-request.md` in project root. |
| `gitIQ.refreshSidebar` | `GitIQ: Refresh Dashboard` | Refreshes the GitIQ sidebar webview view. |
| `gitIQ.aiCodeReview` | `GitIQ: AI Code Review (Planned)` | Information dialog for upcoming code review release. |
| `gitIQ.checkGitRepository` | `GitIQ: Check Git Repository` | Verifies whether the workspace is inside a Git repository. |
| `gitIQ.hello` | `GitIQ: Hello` | Extension activation smoke test. |

### Model Context Protocol (MCP) Tools

Exposed via both standalone stdio server (`out/mcp/server.js`) and VS Code Language Model Tools (`vscode.lm.registerTool`):

| Tool Name | Scope | Description |
| :--- | :--- | :--- |
| `get_repository_info` | Read-only | Returns root path, remote origin, default/current branch, and dirty status. |
| `get_git_status` | Read-only | Returns staged, unstaged, and untracked file counts and paths. |
| `get_staged_diff` | Read-only | Returns unified diff of currently staged files (`git diff --cached`). |
| `search_commit_history` | Read-only | Searches commit log by query string with limit and branch filtering. |
| `generate_commit_message_suggestion` | Suggestion Only | Generates suggested commit message for staged diff (`executed: false`). |
| `prepare_pull_request_description` | Suggestion Only | Generates suggested PR title, summary, and description (`executed: false`). |

---

## 6. Current Status & Changelog

### Current Status: BYO-AI & MCP Release (`v1.2.0`)
- [x] **Phase 1: GitHub Copilot LM Support**: Integrated `VSCodeLanguageModelProvider` via `vscode.lm.selectChatModels()` with streaming, cancellation support, and typed error handling. No Groq key required.
- [x] **Phase 2: MCP Integration**:
  - Implemented 6 safe, read-only MCP tools in `src/mcp/gitIqMcpServer.ts`.
  - Built standalone stdio MCP server in `src/mcp/server.ts` bundled to `out/mcp/server.js`.
  - Registered native VS Code Language Model Tools in `src/providers/languageModelTools.ts`.
- [x] **Phase 3: External Agent Documentation**: Published detailed compatibility matrix and setup instructions in `docs/EXTERNAL_AGENT_COMPATIBILITY.md` for Copilot, Google Antigravity, Claude Code, and OpenAI Codex.
- [x] **Phase 4: Provider Selection UI**:
  - Added QuickPick command `gitIQ.selectProvider` and `gitIQ.setGeminiApiKey`.
  - Updated `SidebarWebviewProvider` with dynamic provider status badge and configuration actions.
  - Added providers: Groq API, GitHub Copilot, Google Gemini API, Ollama (offline local), and MCP Delegation.
- [x] **Phase 5: Automated Testing & Verification**:
  - Implemented 45 automated unit tests across 6 suites using Node's built-in test runner.
  - 100% test pass rate (45 passed, 0 failed).
  - Clean linting (`npm run lint`), compilation (`npm run compile`), and packaging (`npm run package`).
- [x] **Gemini Provider Architecture & Error Routing Bugfix**:
  - **Root Cause**: `generateCommitMessageCommand.ts` previously hardcoded Groq error messages on any `ConfigurationError` or `ProviderAuthenticationError`, and `setGeminiApiKeyCommand` did not auto-switch the active provider to Gemini. Additionally, `getModel()` was not provider-aware and passed Groq model IDs to the Gemini API.
  - **Fixes Applied**:
    1. Made `getModel(provider)` and `setModel(model, provider)` dynamically resolve provider-specific models (`gitIQ.geminiModel` default `gemini-1.5-flash`, `gitIQ.model` default `llama-3.3-70b-versatile`).
    2. Updated `setGeminiApiKeyCommand` to auto-activate the Gemini provider and refresh the sidebar UI.
    3. Replaced hardcoded Groq error handlers in `generateCommitMessageCommand.ts` with provider-aware dynamic error messages preserving `error.message`.
    4. Enhanced `GeminiProvider.ts` with official `x-goog-api-key` header authentication, model fallback protection, and precise Google 400 (`API_KEY_INVALID`), 403, 404, 429 error mapping.
    5. Added 10 tests across `test/geminiProvider.test.cjs` and `test/providerSelection.test.cjs` including real network HTTP verification against live Google Generative Language API.
- [x] **Create Pull Request Command Root-Cause Fix**:
  - **Root Cause**:
    1. Blanket try/catch in `PullRequestService.generatePullRequest` intercepted all operational failures (`ProviderAuthenticationError`, `ProviderRateLimitError`, `ProviderTimeoutError`, `ConfigurationError`, `ProviderNetworkError`, `GitError`) and unconditionally threw `AI generated an incomplete Pull Request. Please try again.`, completely masking the real failure reasons.
    2. Rigid section validation regexes in `validatePullRequest` rejected valid AI responses that formatted titles inline (`## Title: <title>`), used alternate section headers (`## Overview`, `## Changes`, `## Test Plan`), or returned JSON objects.
    3. `git diff origin/<default>...HEAD` failed on repos lacking the remote tracking ref `origin/<default>`.
  - **Fixes Applied**:
    1. Added `isOperationalError()` filter in `PullRequestService` to immediately propagate authentication, rate-limiting, timeout, network, and Git errors without swallowing or retrying.
    2. Added `tryParseJsonPullRequest()` to seamlessly extract and convert JSON-structured responses (both fenced and raw) into standardized Markdown.
    3. Broadened `validatePullRequest` and `parsePullRequest` to support flexible headings (`Summary|Overview|Description|Changes`, `Testing|Test Plan`, `Checklist`), inline titles, and actionable validation failure descriptions.
    4. Updated `GitService.getBranchDiff` and `GitService.getBranchCommits` with local branch fallback (`${defaultBranch}...HEAD`) when remote origin refs are not found.
    5. Implemented `test/pullRequestService.test.cjs` covering all 7 failure scenarios (valid markdown, fenced JSON, missing fields, empty AI response, malformed JSON, provider rate limit/timeout/auth propagation, and Git context edge cases).
    6. Verified 100% test pass rate (45/45 tests green) and clean build/package outputs.
- [x] **AI Code Review Feature (Fully Functional Implementation)**:
  - **Architecture & Service**: Implemented `CodeReviewService` (`src/services/codeReviewService.ts`), data models (`src/models/codeReviewModels.ts`), and command handler (`src/commands/aiCodeReviewCommand.ts`).
  - **Change Detection Hierarchy**: Identifies reviewable changes in priority order:
    1. Uncommitted working-tree changes (`getWorkingTreeDiff`)
    2. Staged changes (`getStagedDiff`)
    3. Branch changes compared against default branch (`getBranchDiff`)
  - **Diff Chunking & Context Safety**: Automatically partitions large diffs by file (`MAX_DIFF_CHUNK_CHARS = 24k`) to avoid model token exhaustion and silent truncation of modified files.
  - **Finding Schema & Validation**: Analyzes code for critical bugs, security vulnerabilities, performance bottlenecks, broken logic, error handling, and maintainability. Normalizes findings into typed severities (`Critical`, `High`, `Medium`, `Low`), categories, line ranges, problem explanations, impacts, recommended fixes, and optional code suggestions.
  - **Interactive Dashboard UI**:
    - Live loading state with active diff target indication.
    - Severity breakdown count badges (`Critical`, `High`, `Medium`, `Low`).
    - Expandable finding cards with problem, impact, recommended fix, and code block.
    - 1-click file navigation (`openFileAtLine`) with safe line clamping.
    - Empty state when no changes exist, and error state with Retry action.
  - **Virtual Markdown Report**: In-memory read-only report provider (`gitiq-code-review`) and command `gitIQ.showCodeReviewReport`.
  - **Automated Test Suite**: Added 10 unit tests in `test/codeReviewService.test.cjs` expanding the automated test suite to 55 tests (100% passing).
- [x] **Production-Ready Repository Detection & Dashboard UI (Root-Cause Fix)**:
  - **Root Causes Identified**:
    1. **Asynchronous Race Condition & Cancellation Loop**: `extension.ts` initiated detection immediately at startup, setting state to `detecting`. When the webview loaded, its `webviewReady` message checked `state.status === 'detecting'` and re-triggered `detectRepositories()`, bumping `_detectionSeq`. Previous in-flight detections were discarded as stale upon completion (`currentSeq !== this._detectionSeq`), leaving the status permanently trapped in `detecting`.
    2. **VS Code Git Extension Initialization Gap & Missing `openRepository`**: When `vscode.git` activates, `api.state` can initially be `'uninitialized'`. The detector did not wait for `'initialized'` state, resulting in `api.repositories` being empty and `getRepository(uri)` returning null. Furthermore, the detector never called the official `gitApi.openRepository(folder.uri)` API, failing to open repositories discovered asynchronously.
    3. **Webview Listener Mounting Order**: In the dashboard HTML, `vscode.postMessage({ command: 'webviewReady' })` was executed *before* `window.addEventListener('message')` was mounted, causing race conditions where immediate state replies from the host were lost.
    4. **Worktrees & Submodules (`.git` as a file)**: Subfolder and CLI detection checks assumed `.git` is always a directory, missing Git worktrees and submodules where `.git` is a text file containing `gitdir: ...`.
    5. **Missing Actionable UI States & Client-Side Watchdog**: The dashboard lacked interactive fallback buttons for "No repository" (Initialize Git Repository / Open Folder), "Git unavailable" (Retry / Download Git), and "Detection error" (Retry), as well as root path display and a watchdog timer to prevent indefinite loading states.
  - **Production-Ready Fixes Applied**:
    1. **Single-Flight & Debounced Concurrency Model**: Replaced fragile sequence tokens with a single-flight promise model (`_inFlightDetectionPromise` + `_rerunAfterInFlight`) and debounced event scheduler (`scheduleDetection(delayMs)`). Concurrent callers share the in-flight run safely, and new repository events automatically queue a clean follow-up cycle without dropping results.
    2. **Official VS Code Git API Synchronization**:
       - Added `openRepository(uri: vscode.Uri): Promise<Repository | null>` to `src/types/vscodeGit.ts`.
       - In `initGitExtension()`, if `api.state === 'uninitialized'`, waits up to 2 seconds for the `'initialized'` event.
       - Calls `gitApi.openRepository(folder.uri)` if `gitApi.getRepository(folder.uri)` is initially null.
    3. **Worktree & Submodule Support**: Added `isGitDirectoryOrFile()` checking both directory and file `.git` entries, and integrated `gitService.getTopLevel()` (`git rev-parse --show-toplevel`) to resolve true working-tree roots.
    4. **Fast Metadata & Git Availability Checks**:
       - Added `gitService.isGitInstalled()` (`git --version`) for accurate CLI availability testing.
       - Added `gitService.getStatusCounts()` (`git status --porcelain`) for instantaneous staged and uncommitted file counting without running heavy multi-megabyte diffs.
    5. **Dashboard UI States & Action Row**:
       - **Detecting**: Temporary loading spinner with client-side 7s watchdog timer preventing indefinite hangs.
       - **Repository Detected**: Displays repo name, current branch, root path with tooltip (`#repoRootPath`), and Git status summary.
       - **No Repository**: Displays warning dot and contextual action buttons: "Initialize Repository" (`git.init`) and "Open Folder" (`vscode.openFolder`).
       - **Git Unavailable**: Displays warning dot, actionable explanation, and "↻ Retry Detection" button.
       - **Detection Error**: Displays error dot, failure message, and "↻ Retry Detection" button.
       - Fixed webview script order: mounted `window.addEventListener('message')` *before* sending `webviewReady`.
    6. **Automated Test Suite**: Added 5 new tests in `test/repositoryDetection.test.cjs` covering worktree `.git` file detection, Git unavailable handling, root path in webview payload, and command execution for `initGit` / `openFolder`. Total tests expanded from 63 to 68 tests (100% passing).
    7. **Synchronous Initial HTML Pre-Rendering**: Added `getInitialRenderState()` in `SidebarWebviewProvider.ts` that synchronously checks `repositoryDetector.state` and falls back to synchronous filesystem inspection of `.git/HEAD` in the workspace folder. This renders the detected repository name and branch immediately into the initial HTML, eliminating any detecting flash or dependency on iframe handshake timing.
    8. **Git API Initialization Single-Flight**: Wrapped `initGitExtension()` in `_initGitApiPromise` to prevent duplicate event listener subscriptions during concurrent extension calls.
    9. **Webview JavaScript Syntax Fix & Accordion Click Listeners**:
       - Fixed two SyntaxErrors inside the Webview `<script>` block in `sidebarWebviewProvider.ts`: a missing closing brace on `if (f.codeSuggestion)` in `renderCodeReviewState()` and a missing opening quote on `'</div>' +` in the review header HTML template. These syntax errors had prevented the entire script from executing in the webview, causing all button and accordion click listeners to fail.
       - Added explicit `addEventListener` click listeners to all `.tool-header` elements to toggle `.tool-accordion` regardless of inline `onclick` handling restrictions in VS Code webviews.
       - Exported helper methods (`toggleAccordion`, `retryDetection`, `openFolder`, `initGit`, `toggleFinding`, `openFile`, `dismissReview`, `runReviewAgain`, `openReport`) onto `window`.
    10. **Webview CSP Nonce & Complete Removal of Inline `onclick`**:
       - Added CSP `<meta>` tag with random cryptographic nonce and matching `<script nonce="${nonce}">` to strictly comply with VS Code webview security.
       - Removed every remaining inline `onclick` attribute across dynamic HTML elements (`updateRepoState`, `renderCodeReviewState`, action rows) and replaced them with `data-action` attributes.
       - Implemented clean, unified event delegation on `document.addEventListener('click', ...)` handling `[data-cmd]`, `[data-action]`, `.tool-header`, `.finding-header`, `.finding-file-link`, `#refreshBtn`, and `#switchRepoBtn`.
       - Re-bundled `out/extension.js` via `npm run compile` and verified zero syntax errors in webview script (`checkScript.js`) and 100% tests passing (`68/68 passed`).
    11. **Version 1.1.1 - Live Marketplace Activation & Webview Interaction Fixes**:
       - **Explicit Activation Events**: Added `"onView:gitiq.sidebarView"`, `"workspaceContains:.git"`, and `"onStartupFinished"` to `package.json`'s `activationEvents` so VS Code immediately initializes GitIQ and detects repositories upon opening a project.
       - **Official Git Extension Dependency**: Declared `"extensionDependencies": ["vscode.git"]` in `package.json` to guarantee VS Code's internal Git extension is activated before GitIQ boots, eliminating the asynchronous initialization race condition.
       - **SVG Pointer Events Normalization**: Added `svg, svg * { pointer-events: none; }` to the webview CSS so clicks on action cards, icons, or buttons always cleanly target the parent container and trigger command delegation.
       - **Resilient Event Delegation & Safe Handshake**: Added `findClosest()` DOM traversal helper with `parentElement` fallback, safe `acquireVsCodeApi()` error handling with console diagnostics, and relaxed CSP to allow `${cspSource}` within `script-src`.
       - **Packaged Production Binary**: Re-packaged `gitiq-1.1.1.vsix` with test and scratch directories excluded in `.vscodeignore`. All 68 test suites passing cleanly.
    12. **Version 1.1.2 - Fix Webview Client Script SyntaxError**:
       - **Root Cause Identified**: Webview console revealed `Uncaught SyntaxError: Failed to execute 'write' on 'Document': Invalid regular expression: /\/g, '\\').replace(/: Unmatched ')'` caused by an unused `escapeJs()` function placed inside the ES6 template literal in `sidebarWebviewProvider.ts`. In template string literals, escaped backslashes `\\` were collapsed into single slashes `\/`, creating an unescaped regex literal that halted all script execution on load.
       - **Removed Malformed Helper**: Completely deleted the unused `escapeJs()` function, restoring full, error-free client script parsing.
       - **Verified Webview Script**: Validated client script in mock DOM and verified 100% test pass rate across all 68 suites.
       - **Packaged Production Binary**: Packaged `gitiq-1.1.2.vsix`.

     13. **Version 1.1.3 - Complete Redesign & Elevation of All Markdown Reports & Previews**:
        - **Shared Markdown Engine**: Created `src/utils/markdownUtils.ts` with reusable helpers: `renderProgressBar()` (ASCII/Unicode bar chart `████████░░░░`), `formatPercentage()`, `getRankBadge()` (🥇, 🥈, 🥉), and `formatAlert()` (GitHub callout blocks).
        - **AI Code Review Report**: Transformed `src/services/codeReviewService.ts` to output an executive report featuring a `Severity & Risk Matrix` table, scope breakdown, GitHub alerts (`> [!NOTE]`, `> [!WARNING]`, `> [!TIP]`), and structured finding cards with metadata tables and syntax-highlighted diff patches.
        - **Commit Statistics**: Redesigned `src/commands/commitStatisticsCommand.ts` with categorized `Velocity & Commit Throughput` and `Project Timeline Milestones` key-value tables.
        - **Top Contributors Leaderboard**: Redesigned `src/commands/topContributorsCommand.ts` and `src/services/historyService.ts` with ranked leaderboard tables, medals, exact percentage shares, and Unicode distribution meters.
        - **Commit Activity (Last 7 Days)**: Redesigned `src/commands/commitActivityCommand.ts` and `src/services/historyService.ts` with weekly throughput totals, peak day detection, daily contribution averages, and daily velocity bars.
        - **Search Commit History**: Redesigned `src/commands/searchCommitHistoryCommand.ts` replacing dashed dividers with a fast-scannable overview table followed by clean detailed commit cards.
        - **Repository Information & AI Commit Explanation**: Redesigned `src/providers/repoInfoProvider.ts` and `src/providers/commitExplainProvider.ts` with structured metadata tables, alert callouts, and clean section dividers.
        - **Test Verification**: All 68 tests passing cleanly with 100% backward and forward compatibility.

---

## 7. Pending Tasks & Known Issues

### Pending Tasks / Roadmap
- [x] **AI Code Review**: Automated multi-file review for staged/working-tree/branch changes.
- [x] **Reliable Repository Detection**: Official VS Code Git API integration with multi-root, worktree, and lifecycle fix.
- [ ] **Custom Prompt Templates**: Configurable commit styles and PR templates.
- [ ] **Source Control UI Integration**: Inline action button in VS Code SCM title bar.
- [x] **Multi-Provider Support**: Implemented Copilot, Gemini, Ollama, and MCP.
- [x] **Automated Test Suite**: Implemented 68 tests across 8 test suites in `test/` (100% passing).

### Known Issues
- *None.*

---

## 8. Environment & Deployment Notes

### Setup & Development Commands
```bash
# 1. Install dependencies
npm install

# 2. Compile TypeScript & bundle extension + MCP server
npm run compile

# 3. Run linting & type checks
npm run check

# 4. Run automated test suite
npm test

# 5. Run MCP stdio server standalone
node out/mcp/server.js

# 6. Package VSIX for VS Code Marketplace
npm run package
```

### Running & Debugging in VS Code
1. Open this folder in Visual Studio Code.
2. Press `F5` to open the **Extension Development Host**.
3. Click the GitIQ icon on the Activity Bar (left sidebar) to reveal the GitIQ Dashboard.
4. Or open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) to run any `GitIQ: ...` command.
5. Set Groq or Gemini API key via Command Palette or select GitHub Copilot / Ollama with zero keys.