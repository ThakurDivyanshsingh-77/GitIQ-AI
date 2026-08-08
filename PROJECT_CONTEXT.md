# PROJECT_CONTEXT.md

> **Single Source of Truth & Memory Bank**
> This file is maintained continuously as a handoff document for future AI agents and developers working on this project. Every code change, configuration update, or feature addition MUST be reflected here.

---

## 1. Project Overview

**GitIQ** (`gitiq`) is an AI-powered Visual Studio Code extension designed to streamline Git workflows (Publisher: `gitiq`, Extension ID: `gitiq.gitiq`). It inspects staged Git changes and generates structured, Conventional Commit suggestions powered by AI (Groq API), explores commit history, explains diffs with AI, generates complete pull requests, provides offline commit history analytics, and integrates with GitHub.

### Core Features & Philosophy
- **AI-Powered Commits**: Analyzes staged diffs and generates Conventional Commit messages. Suggestions are presented in an editable input box for developer review, then committed on Enter.
- **AI Pull Request Generation**: Generates complete, professional PR documents with title, summary, description, files changed, testing, breaking changes, and checklist from branch diff and commit history.
- **Secure Settings & Configuration**: Stores Groq API keys securely in VS Code `SecretStorage` (`vscode.SecretStorage`), offers one-click legacy migration, and provides a Groq Model Selector.
- **Offline Commit History Analytics**: Search commit history by keyword, collect statistics, top contributors, 7-day activity, and export reports offline via Git CLI.
- **Commit History Explorer**: Interactive QuickPick explorer with instant search, detail viewing, AI explanations, and hash copying.
- **GitHub Integration**: Push, pull, fetch, branch display, repository information, direct GitHub browser navigation, and PR page opening.
- **Clean Architecture**: Built with modular TypeScript services, providers, and decoupled command handlers for high maintainability and testability.

---

## 2. Tech Stack & Architecture

### Tech Stack
- **Platform / Framework**: VS Code Extension API (`^1.95.0`), Node.js (v20+)
- **Language**: TypeScript (`^5.7.2`) with strict mode enabled
- **External Dependencies**: `groq-sdk` (`^1.5.0`) for AI completion requests
- **Linting & Code Quality**: ESLint (`^9.17.0`), `@typescript-eslint`

### Architecture & Design Patterns
The codebase follows a **Service-Oriented & Provider Pattern** architecture:

```
src/
├── extension.ts                      # Extension lifecycle & Composition Root
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
│   ├── removeApiKeyCommand.ts        # Remove API key from SecretStorage
│   ├── repositoryInfoCommand.ts      # Repo summary readonly document
│   ├── savePullRequestCommand.ts     # Save PR as pull-request.md
│   ├── searchCommitHistoryCommand.ts # Offline keyword search across commit log
│   ├── selectModelCommand.ts        # QuickPick selector for Groq models
│   ├── setApiKeyCommand.ts          # Prompt & store API key securely in SecretStorage
│   ├── topContributorsCommand.ts     # Display ranked top contributors
│   ├── updateApiKeyCommand.ts       # Update API key in SecretStorage
│   └── viewCommitHistoryCommand.ts   # Interactive commit history explorer
├── models/                           # Domain Data Models
│   └── historyModels.ts              # Interfaces for SearchResultCommit, ContributorStat, DailyActivityStat, CommitStatistics
├── providers/                        # AI & Virtual Document Providers
│   ├── AIProvider.ts                 # Abstract contract interface for AI services
│   ├── AIProviderFactory.ts          # Provider resolution strategy factory (GitIQAIProviderFactory)
│   ├── commitDetailsProvider.ts      # Read-only commit detail documents
│   ├── commitExplainProvider.ts      # Read-only AI explanation documents
│   ├── GroqProvider.ts               # Groq SDK AI completion client
│   ├── gitDiffPreviewProvider.ts     # TextDocumentContentProvider for diff preview
│   ├── historyPreviewProvider.ts     # Read-only analytics markdown documents
│   ├── pullRequestProvider.ts       # Read-only AI pull request documents
│   └── repoInfoProvider.ts          # Read-only repository info document
├── services/                         # Core Business Logic Services
│   ├── commitMessageService.ts       # Orchestrates Diff -> Prompt -> AI -> Validator
│   ├── commitMessageValidator.ts     # Validates AI response format
│   ├── configService.ts              # Typed VS Code configuration manager
│   ├── gitService.ts                 # Isolated git binary process execution
│   ├── historyService.ts             # Offline Git CLI commit analytics & report exporter
│   ├── loggerService.ts              # Output channel logging service ("GitIQ")
│   ├── promptBuilder.ts              # Deterministic AI prompt builder
│   ├── pullRequestService.ts        # AI pull request orchestration service
│   └── SettingsService.ts           # SecretStorage API key & model settings manager
├── types/                            # TypeScript interfaces & domain types
│   ├── commit.ts                     # Commit contracts & validation schemas
│   └── provider.ts                   # Provider identifiers & config contracts
└── utils/                            # Utilities & Error domain types
    ├── constants.ts                  # Shared command IDs & configuration keys (gitIQ.*)
    └── errors.ts                     # Custom error hierarchy (GitIQError)
```

---

## 3. File Structure

```text
gitiq/
├── .vscode/
│   ├── launch.json                   # Launch configuration for F5 Debug Host
│   └── tasks.json                    # VS Code build task configuration
├── src/
│   ├── commands/
│   ├── models/
│   ├── providers/
│   ├── services/
│   ├── types/
│   ├── utils/
│   └── extension.ts                  # Extension entry point
├── .agents/
│   └── AGENTS.md                     # Mandatory PROJECT_CONTEXT.md update rule
├── .gitignore
├── .vscodeignore                     # Excludes source files from extension package
├── CHANGELOG.md                      # Release notes & version history
├── eslint.config.mjs                 # Flat ESLint configuration
├── icon.png                          # Official GitIQ Extension Icon
├── LICENSE                           # MIT License
├── package.json                      # Manifest, configuration, & command contribution
├── PROJECT_CONTEXT.md                # AI Handoff & Memory Bank (This File)
├── README.md                         # Developer setup & documentation
└── tsconfig.json                     # TypeScript compiler configuration
```

---

## 4. Database Schemas

*(Not applicable - Stateless Extension)*

State management relies on VS Code Workspace Configuration settings (`gitIQ.*`) and SecretStorage (`gitiq.groqApiKey`):

| Setting Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `gitIQ.apiKey` | `string` | `""` | Legacy key / SecretStorage fallback for Groq API authentication. |
| `gitIQ.provider` | `enum` | `"groq"` | Active AI provider (`groq`, `openai`, `gemini`, `ollama`). |
| `gitIQ.model` | `string` | `"llama-3.3-70b-versatile"` | Model ID for Groq provider completion requests. |
| `gitIQ.temperature` | `number` | `0.2` | Sampling temperature for AI generation (0.0 to 2.0). |
| `gitIQ.timeout` | `number` | `30000` | Groq request timeout in milliseconds. |

---

## 5. API Endpoints & Routing

### Contributed VS Code Commands (`package.json`)

| Command ID | Title | Purpose / Handler |
| :--- | :--- | :--- |
| `gitIQ.hello` | `GitIQ: Hello` | Smoke test / basic extension activation test. |
| `gitIQ.checkGitRepository` | `GitIQ: Check Git Repository` | Verifies whether the workspace is inside a Git repository. |
| `gitIQ.previewGitDiff` | `GitIQ: Preview Git Diff` | Opens read-only virtual diff document for staged changes. |
| `gitIQ.generateCommitMessage` | `GitIQ: Generate Commit Message` | Fetches staged diff, queries Groq AI, validates format, shows editable QuickInput box, and executes `git commit`. |
| `gitIQ.viewCommitHistory` | `GitIQ: View Commit History` | Displays recent commits (`git log -n 20`) in QuickPick with search and details. |
| `gitIQ.explainCommit` | `GitIQ: Explain Commit` | Prompts user to select a commit and generates a plain English AI explanation of its purpose, changes, and impact. |
| `gitIQ.copyCommitHash` | `GitIQ: Copy Commit Hash` | QuickPick commit selection that copies the full commit hash to the system clipboard. |
| `gitIQ.push` | `GitIQ: Push Branch` | Pushes current branch to remote origin with progress notification. |
| `gitIQ.pull` | `GitIQ: Pull Branch` | Pulls latest changes from remote origin with merge conflict detection. |
| `gitIQ.fetch` | `GitIQ: Fetch Updates` | Fetches remote references (`git fetch`) with status notification. |
| `gitIQ.currentBranch` | `GitIQ: Show Current Branch` | Displays the active branch name (`git branch --show-current`). |
| `gitIQ.repositoryInfo` | `GitIQ: Repository Information` | Shows repo name, branch, remote URL, latest commit, total commits, and git status. |
| `gitIQ.openRepository` | `GitIQ: Open GitHub Repository` | Detects origin URL and opens in default browser. |
| `gitIQ.openBranch` | `GitIQ: Open Current Branch on GitHub` | Opens branch view on GitHub in default browser. |
| `gitIQ.generatePullRequest` | `GitIQ: Generate Pull Request` | Generates complete AI-powered PR document from branch diff and commit history. |
| `gitIQ.copyPRTitle` | `GitIQ: Copy PR Title` | Copies generated PR title to clipboard. |
| `gitIQ.copyPRDescription` | `GitIQ: Copy PR Description` | Copies generated PR description to clipboard. |
| `gitIQ.copyEntirePR` | `GitIQ: Copy Entire Pull Request` | Copies full generated PR Markdown to clipboard. |
| `gitIQ.savePullRequest` | `GitIQ: Save Pull Request` | Saves generated PR as `pull-request.md` in project root. |
| `gitIQ.openPullRequestPage` | `GitIQ: Open Pull Request Page` | Opens GitHub compare URL (`/compare/main...currentBranch`) for PR creation. |
| `gitIQ.searchCommitHistory` | `GitIQ: Search Commit History` | Offline keyword search across commit log (`git log --all --grep`). |
| `gitIQ.commitStatistics` | `GitIQ: Commit Statistics` | Aggregates repository commit metrics and age statistics. |
| `gitIQ.topContributors` | `GitIQ: Top Contributors` | Displays ranked contributor commit counts using `git shortlog -sn`. |
| `gitIQ.commitActivity` | `GitIQ: Commit Activity` | Displays 7-day commit activity breakdown as a Markdown table. |
| `gitIQ.exportHistoryReport` | `GitIQ: Export History Report` | Exports complete Markdown analytics report to `commit-history-report.md`. |
| `gitIQ.setApiKey` | `GitIQ: Set Groq API Key` | Prompts for Groq API key and stores securely in VS Code `SecretStorage`. |
| `gitIQ.updateApiKey` | `GitIQ: Update Groq API Key` | Reuses secure prompt flow to update stored API key. |
| `gitIQ.removeApiKey` | `GitIQ: Remove Groq API Key` | Deletes stored API key from `SecretStorage` after confirmation. |
| `gitIQ.selectModel` | `GitIQ: Select Groq Model` | Displays QuickPick selector for supported Groq models and updates VS Code settings. |

### Virtual Scheme Registration
- **`gitiq-git-diff:`**: `GitDiffPreviewProvider` (Read-only staged diff document preview).
- **`gitiq-commit-details:`**: `CommitDetailsProvider` (Read-only commit detail and stats document).
- **`gitiq-commit-explain:`**: `CommitExplainProvider` (Read-only Markdown document for AI commit explanations).
- **`gitiq-repo-info:`**: `RepoInfoProvider` (Read-only Markdown document for repository information summary).
- **`gitiq-pull-request:`**: `PullRequestProvider` (Read-only Markdown document for AI-generated pull requests).
- **`gitiq-history:`**: `HistoryPreviewProvider` (Read-only Markdown documents for commit history analytics previews).

---

## 6. Current Status & Changelog

### Current Status: Marketplace Ready Rebranding to GitIQ (`v1.0.0`)
- [x] Complete TypeScript structure & strict compiler setup.
- [x] Extension activation lifecycle & command registration in `extension.ts`.
- [x] Dedicated Output Channel logging via `LoggerService` ("GitIQ").
- [x] Startup configuration validation (`validateConfiguration`) in `SettingsService`.
- [x] Marketplace README shields badges (Version, VS Code 1.95+, MIT License, TypeScript 5.x).
- [x] Secret Storage API key management (`setApiKey`, `updateApiKey`, `removeApiKey`) using `vscode.SecretStorage` (`gitiq.groqApiKey`).
- [x] Automatic one-click migration of legacy API keys from `settings.json` or legacy secret storage (`commitpilot.groqApiKey`).
- [x] Groq Model Selector (`selectModelCommand`) with QuickPick for supported models.
- [x] Git commit history retrieval (`getCommitHistory`) and commit detail inspection (`getCommitDetails`).
- [x] Interactive commit history QuickPick search (`viewCommitHistoryCommand`).
- [x] Virtual read-only commit details document provider (`CommitDetailsProvider`).
- [x] Plain English AI Commit Explanation workflow (`explainCommitCommand` & `CommitExplainProvider`).
- [x] Clipboard commit hash copying (`copyCommitHashCommand`).
- [x] Single-read Git diff workflow (`getStagedDiff`) with pathspec exclusions (`EXCLUDE_PATHSPECS`).
- [x] Large diff context protection (`MAX_DIFF_CHARACTERS = 70000`) in `PromptBuilder`.
- [x] Transient failure auto-retry logic in `GroqProvider`.
- [x] Robust AI response sanitization (`CommitMessageValidator.sanitize`) and validation.
- [x] Git commit execution (`GitService.commit`) on user Enter confirmation.
- [x] Git push (`push`), pull (`pull`), and fetch (`fetch`) with progress notifications.
- [x] Current branch display (`getCurrentBranch`) including detached HEAD detection.
- [x] Repository information summary document (`getRepositoryInfo` & `RepoInfoProvider`).
- [x] GitHub browser navigation: Open Repository and Open Current Branch.
- [x] AI Pull Request generation with structured prompt, conventional commit prefix enforcement, multi-paragraph description, 2048 token budget, and 1-attempt retry.
- [x] Copy PR Title, Copy PR Description, Copy Entire PR clipboard commands.
- [x] Save Pull Request as `pull-request.md` to project root.
- [x] Open GitHub compare page for PR creation.
- [x] Offline Git commit search (`searchCommitHistoryCommand`).
- [x] Offline commit statistics (`commitStatisticsCommand`).
- [x] Offline top contributors ranking (`topContributorsCommand`).
- [x] Offline 7-day commit activity table (`commitActivityCommand`).
- [x] Offline report exporter (`exportHistoryReportCommand`).
- [x] Code quality verification (`npm run check`) passing with zero errors or warnings.

---

## 7. Pending Tasks & Known Issues

### Pending Tasks / Roadmap
- [ ] **Multi-Provider Support**: Implement `OpenAIProvider`, `GeminiProvider`, and `OllamaProvider` behind `AIProviderFactory`.
- [ ] **Custom Prompt Templates**: Allow users to define custom instructions or commit style rules in settings.
- [ ] **Source Control UI Integration**: Add an inline button to the VS Code Source Control (SCM) panel to generate commit messages directly into the SCM input box.
- [ ] **Unit / Integration Tests**: Add automated unit test suite (`vscode-test` / `mocha`).
- [x] **GitHub PR Integration**: AI Pull Request generation with copy, save, and compare page features.
- [x] **Commit History Analytics**: Offline commit search, repo statistics, top contributors, 7-day activity, and report export.

### Known Issues
- *None currently identified.*

---

## 8. Environment & Deployment Notes

### Setup & Development Commands
```bash
# 1. Install dependencies
npm install

# 2. Compile TypeScript
npm run compile

# 3. Watch for changes (development mode)
npm run watch

# 4. Run linting & type checks
npm run check
```

### Running & Debugging in VS Code
1. Open this folder in Visual Studio Code.
2. Press `F5` to open the **Extension Development Host**.
3. In the new window, open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).
4. Set Groq API key via `GitIQ: Set Groq API Key`.
5. Run any of the contributed `GitIQ: ...` commands.
