# PROJECT_CONTEXT.md

> **Single Source of Truth & Memory Bank**
> This file is maintained continuously as a handoff document for future AI agents and developers working on this project. Every code change, configuration update, or feature addition MUST be reflected here.

---

## 1. Project Overview

**CommitPilot AI** (`commitpilot-ai`) is an AI-powered Visual Studio Code extension designed to streamline Git workflows. It inspects staged Git changes and generates structured, Conventional Commit suggestions powered by AI (Groq API), explores commit history, explains diffs with AI, and provides full Git + GitHub workflow integration.

### Core Features & Philosophy
- **AI-Powered Commits**: Analyzes staged diffs and generates Conventional Commit messages. Suggestions are presented in an editable input box for developer review, then committed on Enter.
- **Commit History Explorer**: Interactive QuickPick explorer with instant search, detail viewing, AI explanations, and hash copying.
- **GitHub Integration**: Push, pull, fetch, branch display, repository information, and direct GitHub browser navigation (SSH/HTTPS URL conversion).
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
│   ├── copyCommitHashCommand.ts      # Copy commit hash to clipboard
│   ├── currentBranchCommand.ts       # Show current Git branch
│   ├── explainCommitCommand.ts       # AI commit explanation workflow
│   ├── fetchCommand.ts              # Git fetch remote updates
│   ├── generateCommitMessageCommand.ts# Orchestrates AI suggestion UI
│   ├── helloCommand.ts               # Basic health check command
│   ├── openBranchCommand.ts          # Open current branch on GitHub
│   ├── openRepositoryCommand.ts      # Open GitHub repo in browser
│   ├── previewGitDiffCommand.ts      # Displays staged diff preview
│   ├── pullCommand.ts               # Git pull from remote origin
│   ├── pushCommand.ts               # Git push to remote origin
│   ├── repositoryInfoCommand.ts      # Repo summary readonly document
│   └── viewCommitHistoryCommand.ts   # Interactive commit history explorer
├── providers/                        # AI & Virtual Document Providers
│   ├── AIProvider.ts                 # Abstract contract interface for AI services
│   ├── AIProviderFactory.ts          # Provider resolution strategy factory
│   ├── commitDetailsProvider.ts      # Read-only commit detail documents
│   ├── commitExplainProvider.ts      # Read-only AI explanation documents
│   ├── GroqProvider.ts               # Groq SDK AI completion client
│   ├── gitDiffPreviewProvider.ts     # TextDocumentContentProvider for diff preview
│   └── repoInfoProvider.ts          # Read-only repository info document
├── services/                         # Core Business Logic Services
│   ├── commitMessageService.ts       # Orchestrates Diff -> Prompt -> AI -> Validator
│   ├── commitMessageValidator.ts     # Validates AI response format
│   ├── configService.ts              # Typed VS Code configuration manager
│   ├── gitService.ts                 # Isolated git binary process execution
│   ├── loggerService.ts              # Output channel logging service
│   └── promptBuilder.ts              # Deterministic AI prompt builder
├── types/                            # TypeScript interfaces & domain types
│   ├── commit.ts                     # Commit contracts & validation schemas
│   └── provider.ts                   # Provider identifiers & config contracts
└── utils/                            # Utilities & Error domain types
    ├── constants.ts                  # Shared command IDs & configuration keys
    └── errors.ts                     # Custom error hierarchy
```

---

## 3. File Structure

```text
commitpilot-ai/
├── .vscode/
│   ├── launch.json                   # Launch configuration for F5 Debug Host
│   └── tasks.json                    # VS Code build task configuration
├── src/
│   ├── commands/
│   │   ├── checkGitRepositoryCommand.ts
│   │   ├── copyCommitHashCommand.ts
│   │   ├── currentBranchCommand.ts
│   │   ├── explainCommitCommand.ts
│   │   ├── fetchCommand.ts
│   │   ├── generateCommitMessageCommand.ts
│   │   ├── helloCommand.ts
│   │   ├── openBranchCommand.ts
│   │   ├── openRepositoryCommand.ts
│   │   ├── previewGitDiffCommand.ts
│   │   ├── pullCommand.ts
│   │   ├── pushCommand.ts
│   │   ├── repositoryInfoCommand.ts
│   │   └── viewCommitHistoryCommand.ts
│   ├── providers/
│   │   ├── AIProvider.ts
│   │   ├── AIProviderFactory.ts
│   │   ├── commitDetailsProvider.ts
│   │   ├── commitExplainProvider.ts
│   │   ├── GroqProvider.ts
│   │   ├── gitDiffPreviewProvider.ts
│   │   └── repoInfoProvider.ts
│   ├── services/
│   │   ├── commitMessageService.ts
│   │   ├── commitMessageValidator.ts
│   │   ├── configService.ts
│   │   ├── gitService.ts
│   │   ├── loggerService.ts
│   │   └── promptBuilder.ts
│   ├── types/
│   │   ├── commit.ts
│   │   └── provider.ts
│   ├── utils/
│   │   ├── constants.ts
│   │   └── errors.ts
│   └── extension.ts                  # Extension entry point
├── .agents/
│   └── AGENTS.md                     # Mandatory PROJECT_CONTEXT.md update rule
├── .gitignore
├── .vscodeignore                     # Excludes source files from extension package
├── CHANGELOG.md                      # Release notes & version history
├── eslint.config.mjs                 # Flat ESLint configuration
├── LICENSE                           # MIT License
├── package.json                      # Manifest, configuration, & command contribution
├── PROJECT_CONTEXT.md                # AI Handoff & Memory Bank (This File)
├── README.md                         # Developer setup & documentation
└── tsconfig.json                     # TypeScript compiler configuration
```

---

## 4. Database Schemas

*(Not applicable - Stateless Extension)*

State management relies on VS Code Workspace Configuration settings (`commitPilotAI.*`):

| Setting Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `commitPilotAI.apiKey` | `string` | `""` | Secret key for Groq API authentication. |
| `commitPilotAI.provider` | `enum` | `"groq"` | Active AI provider (`groq`, `openai`, `gemini`, `ollama`). |
| `commitPilotAI.model` | `string` | `"llama-3.3-70b-versatile"` | Model ID for Groq provider completion requests. |
| `commitPilotAI.temperature` | `number` | `0.2` | Sampling temperature for AI generation (0.0 to 2.0). |
| `commitPilotAI.timeout` | `number` | `30000` | Groq request timeout in milliseconds. |

---

## 5. API Endpoints & Routing

### Contributed VS Code Commands (`package.json`)

| Command ID | Title | Purpose / Handler |
| :--- | :--- | :--- |
| `commitPilotAI.hello` | `CommitPilot AI: Hello` | Smoke test / basic extension activation test. |
| `commitPilotAI.checkGitRepository` | `CommitPilot AI: Check Git Repository` | Verifies whether the workspace is inside a Git repository. |
| `commitPilotAI.previewGitDiff` | `CommitPilot AI: Preview Git Diff` | Opens read-only virtual diff document for staged changes (`git diff --cached`). |
| `commitPilotAI.generateCommitMessage` | `CommitPilot AI: Generate Commit Message` | Fetches staged diff, queries Groq AI, validates format, shows editable QuickInput box, and executes `git commit`. |
| `commitPilotAI.viewCommitHistory` | `CommitPilot AI: View Commit History` | Displays recent commits (`git log -n 20`) in QuickPick with instant search and shows commit details (`git show <hash> --stat`). |
| `commitPilotAI.explainCommit` | `CommitPilot AI: Explain Commit` | Prompts user to select a commit and generates a plain English AI explanation of its purpose, changes, and impact. |
| `commitPilotAI.copyCommitHash` | `CommitPilot AI: Copy Commit Hash` | QuickPick commit selection that copies the full commit hash to the system clipboard. |
| `commitPilotAI.push` | `CommitPilot AI: Push Branch` | Pushes current branch to remote origin (`git push origin <branch>`) with progress notification. |
| `commitPilotAI.pull` | `CommitPilot AI: Pull Branch` | Pulls latest changes from remote origin (`git pull origin <branch>`) with merge conflict detection. |
| `commitPilotAI.fetch` | `CommitPilot AI: Fetch Updates` | Fetches remote references (`git fetch`) with status notification. |
| `commitPilotAI.currentBranch` | `CommitPilot AI: Show Current Branch` | Displays the active branch name (`git branch --show-current`). |
| `commitPilotAI.repositoryInfo` | `CommitPilot AI: Repository Information` | Shows repo name, branch, remote URL, latest commit, total commits, and git status in a read-only Markdown document. |
| `commitPilotAI.openRepository` | `CommitPilot AI: Open GitHub Repository` | Detects origin URL (SSH/HTTPS), converts to browser URL, and opens in default browser. |
| `commitPilotAI.openBranch` | `CommitPilot AI: Open Current Branch on GitHub` | Opens `https://github.com/user/repo/tree/current-branch` in default browser. |

### Virtual Scheme Registration
- **`commitpilot-git-diff:`**: `GitDiffPreviewProvider` (Read-only staged diff document preview).
- **`commitpilot-commit-details:`**: `CommitDetailsProvider` (Read-only commit detail and stats document).
- **`commitpilot-commit-explain:`**: `CommitExplainProvider` (Read-only Markdown document for AI commit explanations).
- **`commitpilot-repo-info:`**: `RepoInfoProvider` (Read-only Markdown document for repository information summary).

---

## 6. Current Status & Changelog

### Current Status: Phase 9 GitHub Integration Completed (`v0.1.0`)
- [x] Complete TypeScript structure & strict compiler setup.
- [x] Extension activation lifecycle & command registration in `extension.ts`.
- [x] Dedicated Output Channel logging via `LoggerService` ("CommitPilot AI").
- [x] Startup configuration validation (`validateConfiguration`) in `ConfigService`.
- [x] Git commit history retrieval (`getCommitHistory`) and commit detail inspection (`getCommitDetails`).
- [x] Interactive commit history QuickPick search (`viewCommitHistoryCommand`) with `$(git-commit)` icons and filter support.
- [x] Virtual read-only commit details document provider (`CommitDetailsProvider`).
- [x] Plain English AI Commit Explanation workflow (`explainCommitCommand` & `CommitExplainProvider`).
- [x] Clipboard commit hash copying (`copyCommitHashCommand`).
- [x] Single-read Git diff workflow (`getStagedDiff`) with pathspec exclusions (`EXCLUDE_PATHSPECS`).
- [x] Large diff context protection (`MAX_DIFF_CHARACTERS = 70000`) in `PromptBuilder`.
- [x] Transient failure auto-retry logic in `GroqProvider`.
- [x] Robust AI response sanitization (`CommitMessageValidator.sanitize`) and validation.
- [x] Git commit execution (`GitService.commit`) on user Enter confirmation.
- [x] Git push (`push`), pull (`pull`), and fetch (`fetch`) with progress notifications and error handling.
- [x] Current branch display (`getCurrentBranch`) including detached HEAD detection.
- [x] Repository information summary document (`getRepositoryInfo` & `RepoInfoProvider`).
- [x] GitHub browser navigation: Open Repository and Open Current Branch via SSH/HTTPS URL conversion.
- [x] Code quality verification (`npm run check`) passing with zero errors or warnings.

---

## 7. Pending Tasks & Known Issues

### Pending Tasks / Roadmap
- [ ] **Multi-Provider Support**: Implement `OpenAIProvider`, `GeminiProvider`, and `OllamaProvider` behind `AIProviderFactory`.
- [ ] **Custom Prompt Templates**: Allow users to define custom instructions or commit style rules in settings.
- [ ] **Source Control UI Integration**: Add an inline button to the VS Code Source Control (SCM) panel to generate commit messages directly into the SCM input box.
- [ ] **Unit / Integration Tests**: Add automated unit test suite (`vscode-test` / `mocha`).
- [ ] **GitHub PR Integration**: Create/view pull requests from within VS Code.

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
4. Set `commitPilotAI.apiKey` in Settings if testing AI generation.
5. Run any of the contributed `CommitPilot AI: ...` commands.
