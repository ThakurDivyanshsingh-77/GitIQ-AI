# CommitPilot AI

CommitPilot AI is a Visual Studio Code extension foundation for a future AI-powered Git commit-message workflow. Phase 3 can preview staged Git changes, but intentionally does not create commits or call AI/API services.

## Prerequisites

- [Node.js](https://nodejs.org/) 20 or later
- Visual Studio Code 1.95 or later

## Installation

```bash
npm install
```

## Run in the Extension Development Host

1. Open this folder in VS Code.
2. Run `npm install` once to install development dependencies.
3. Press `F5` (or select **Run CommitPilot AI** in Run and Debug).
4. In the new Extension Development Host window, open the Command Palette with `Ctrl+Shift+P`.
5. Run **CommitPilot AI: Hello**, **CommitPilot AI: Check Git Repository**, or **CommitPilot AI: Preview Git Diff**.

The command displays: `CommitPilot AI is running successfully 🚀`

The Git check displays one of the following:

- `✅ Git repository detected.`
- `❌ Current workspace is not a Git repository.`
- `⚠ Please open a project folder first.`

The Git diff preview opens a read-only `diff` document titled **CommitPilot AI - Git Diff Preview**. If no staged changes exist, it explains how to stage files with `git add .`.

## Quality checks

```bash
npm run compile
npm run lint
npm run check
```

## Project structure

```text
.
├── .vscode/
│   ├── launch.json        # F5 Extension Development Host configuration
│   └── tasks.json         # Background TypeScript watch task
├── src/
│   ├── commands/
│   │   └── helloCommand.ts # Command registration and user-facing message
│   │   └── checkGitRepositoryCommand.ts # Workspace-level Git check command
│   │   └── previewGitDiffCommand.ts # Staged-diff preview command
│   ├── providers/
│   │   └── gitDiffPreviewProvider.ts # Read-only virtual diff documents
│   ├── services/
│   │   └── gitService.ts   # Isolated Git process integration
│   ├── utils/              # Future shared utilities
│   └── extension.ts        # Minimal extension lifecycle entry point
├── .gitignore
├── .vscodeignore            # Excludes development files from extension packages
├── CHANGELOG.md             # Version history
├── eslint.config.mjs       # TypeScript linting rules
├── LICENSE                  # MIT licensing terms
├── package.json            # Extension manifest, contributions, and scripts
├── README.md               # Setup, run, test, and architecture guide
└── tsconfig.json           # Strict TypeScript compiler configuration
```

## Phase 1 implementation

- Registers `CommitPilot AI: Hello` under the command ID `commitPilotAI.hello`.
- Registers `CommitPilot AI: Check Git Repository` under the command ID `commitPilotAI.checkGitRepository`.
- Registers `CommitPilot AI: Preview Git Diff` under the command ID `commitPilotAI.previewGitDiff`.
- Activates lazily when either contributed command is run.
- Shows the required confirmation message through the official VS Code API.
- Detects Git work trees through `git rev-parse --is-inside-work-tree`, without a shell or Git extension dependency.
- Reads staged changes through `git diff --cached` and previews them in a read-only Diff-language document.
- Keeps command behavior outside `extension.ts` and disposes registrations correctly.

## Planned Phase 2

Future phases can introduce staged-change collection behind the existing service/provider boundary. AI calls, APIs, and commit-message generation remain deliberately out of scope for this phase.
