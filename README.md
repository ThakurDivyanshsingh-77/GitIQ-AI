# CommitPilot AI

CommitPilot AI is an AI-powered Git commit assistant, history explorer, pull request generator, and GitHub integration for Visual Studio Code. It previews staged changes, generates editable Conventional Commit messages via Groq AI, executes commits, explores commit history, explains commit diffs in plain English, generates complete pull requests, and provides full Git + GitHub workflow commands.

## Features

### AI-Powered
- **Generate Conventional Commit Messages**: Analyzes staged diffs and generates structured Conventional Commit suggestions (`feat:`, `fix:`, `refactor:`, etc.).
- **AI Commit Explanation**: Generates plain English explanations of any commit (purpose, affected files, major changes, impact).
- **AI Pull Request Generation**: Generates complete, professional pull request documents with title, summary, detailed description, files changed, testing, breaking changes, checklist, and known limitations.

### Pull Request Workflow
- **Generate Pull Request**: AI-powered PR document from branch diff and commit history.
- **Copy PR Title / Description / Entire PR**: Quick clipboard actions for pasting into GitHub.
- **Save Pull Request**: Save generated PR as `pull-request.md` in the project root.
- **Open Pull Request Page**: Automatically open `https://github.com/<owner>/<repo>/compare/main...currentBranch`.

### Git History
- **View Commit History**: Interactive QuickPick explorer (`git log -n 20`) with instant search/filtering by subject, author, or commit hash.
- **Commit Details Viewer**: Inspect commit statistics (`git show <hash> --stat`) in a read-only document.
- **Copy Commit Hash**: QuickPick command to copy commit hashes directly to clipboard.

### Git Workflow
- **Push Branch**: Push current branch to remote origin with progress notification.
- **Pull Branch**: Pull latest changes from remote origin with merge conflict detection.
- **Fetch Updates**: Fetch remote references (`git fetch`) with status notification.
- **Show Current Branch**: Display the currently checked-out branch name.
- **Repository Information**: Read-only Markdown document with repo name, branch, remote URL, latest commit, total commits, and working tree status.

### GitHub Integration
- **Open GitHub Repository**: Detect origin URL (SSH or HTTPS), convert to browser URL, and open in default browser.
- **Open Current Branch on GitHub**: Automatically open `https://github.com/user/repo/tree/current-branch`.

### Utilities
- **Staged Diff Preview**: Read-only virtual diff document for previewing staged changes (`git diff --cached`).
- **Dedicated Output Channel**: Complete diagnostic logging under Output → `CommitPilot AI`.

## Commands Contributed

| Command | ID |
| :--- | :--- |
| `CommitPilot AI: Hello` | `commitPilotAI.hello` |
| `CommitPilot AI: Check Git Repository` | `commitPilotAI.checkGitRepository` |
| `CommitPilot AI: Preview Git Diff` | `commitPilotAI.previewGitDiff` |
| `CommitPilot AI: Generate Commit Message` | `commitPilotAI.generateCommitMessage` |
| `CommitPilot AI: View Commit History` | `commitPilotAI.viewCommitHistory` |
| `CommitPilot AI: Explain Commit` | `commitPilotAI.explainCommit` |
| `CommitPilot AI: Copy Commit Hash` | `commitPilotAI.copyCommitHash` |
| `CommitPilot AI: Push Branch` | `commitPilotAI.push` |
| `CommitPilot AI: Pull Branch` | `commitPilotAI.pull` |
| `CommitPilot AI: Fetch Updates` | `commitPilotAI.fetch` |
| `CommitPilot AI: Show Current Branch` | `commitPilotAI.currentBranch` |
| `CommitPilot AI: Repository Information` | `commitPilotAI.repositoryInfo` |
| `CommitPilot AI: Open GitHub Repository` | `commitPilotAI.openRepository` |
| `CommitPilot AI: Open Current Branch on GitHub` | `commitPilotAI.openBranch` |
| `CommitPilot AI: Generate Pull Request` | `commitPilotAI.generatePullRequest` |
| `CommitPilot AI: Copy PR Title` | `commitPilotAI.copyPRTitle` |
| `CommitPilot AI: Copy PR Description` | `commitPilotAI.copyPRDescription` |
| `CommitPilot AI: Copy Entire Pull Request` | `commitPilotAI.copyEntirePR` |
| `CommitPilot AI: Save Pull Request` | `commitPilotAI.savePullRequest` |
| `CommitPilot AI: Open Pull Request Page` | `commitPilotAI.openPullRequestPage` |

## Quality & Build Commands

```bash
npm run compile   # Compile TypeScript
npm run lint      # Run ESLint checks
npm run check     # Run compile + lint
```
