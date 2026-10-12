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
│   └── historyModels.ts              # Interfaces for SearchResultCommit, ContributorStat, etc.
├── providers/                        # AI & Virtual Document Providers
│   ├── AIProvider.ts                 # Abstract contract interface for AI services
│   ├── AIProviderFactory.ts          # Multi-provider resolution factory (GitIQAIProviderFactory)
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
│   ├── commitMessageService.ts       # Orchestrates Diff -> Prompt -> AI -> Validator
│   ├── commitMessageValidator.ts     # Validates AI response format
│   ├── configService.ts              # Typed VS Code configuration manager
│   ├── gitService.ts                 # Isolated git binary process execution
│   ├── historyService.ts             # Offline Git CLI commit analytics & report exporter
│   ├── loggerService.ts              # Output channel logging service ("GitIQ")
│   ├── promptBuilder.ts              # Deterministic AI prompt builder
│   ├── pullRequestService.ts        # AI pull request orchestration service
│   └── SettingsService.ts           # Multi-provider SecretStorage & configuration manager
├── types/                            # TypeScript interfaces & domain types
│   ├── commit.ts                     # Commit contracts & validation schemas
│   └── provider.ts                   # Provider identifiers & config contracts
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
│   ├── commitMessageValidator.test.cjs # Commit message format and sanitization tests
│   ├── mcpServer.test.cjs            # MCP tool logic, security, and schema tests
│   ├── mockVscode.cjs                # Standalone VS Code API mock for Node test runner
│   ├── providerSelection.test.cjs    # Multi-provider factory and fallback tests
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
  - Implemented 26 automated unit tests across 4 suites using Node's built-in test runner.
  - 100% test pass rate (26 passed, 0 failed).
  - Clean linting (`npm run lint`), compilation (`npm run compile`), and packaging (`vsce package` -> `gitiq-1.1.0.vsix` 468 KB).

---

## 7. Pending Tasks & Known Issues

### Pending Tasks / Roadmap
- [ ] **AI Code Review**: Automated multi-file review for staged changes.
- [ ] **Custom Prompt Templates**: Configurable commit styles and PR templates.
- [ ] **Source Control UI Integration**: Inline action button in VS Code SCM title bar.
- [x] **Multi-Provider Support**: Implemented Copilot, Gemini, Ollama, and MCP.
- [x] **Automated Test Suite**: Implemented 26 tests in `test/`.

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