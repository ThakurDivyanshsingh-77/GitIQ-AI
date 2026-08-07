# Changelog

All notable changes to CommitPilot AI will be documented in this file.

## [0.1.0] - 2026-08-07

### Added

- **Phase 9 - GitHub Integration**:
  - `CommitPilot AI: Push Branch` command (`commitPilotAI.push`) with progress notification and error handling for no remote, auth failures, and push rejections.
  - `CommitPilot AI: Pull Branch` command (`commitPilotAI.pull`) with progress notification and merge conflict detection.
  - `CommitPilot AI: Fetch Updates` command (`commitPilotAI.fetch`) fetching remote references.
  - `CommitPilot AI: Show Current Branch` command (`commitPilotAI.currentBranch`) displaying the active branch name.
  - `CommitPilot AI: Repository Information` command (`commitPilotAI.repositoryInfo`) showing repo name, branch, remote URL, latest commit, total commits, and git status in a read-only Markdown document.
  - `CommitPilot AI: Open GitHub Repository` command (`commitPilotAI.openRepository`) converting SSH/HTTPS remote URLs to browser URLs and opening in default browser.
  - `CommitPilot AI: Open Current Branch on GitHub` command (`commitPilotAI.openBranch`) opening the current branch tree URL on GitHub.

- **Phase 8 - Commit History Explorer & AI Commit Explanation**:
  - `CommitPilot AI: View Commit History` command with interactive QuickPick search.
  - Read-only commit detail viewer (`CommitDetailsProvider`).
  - `CommitPilot AI: Explain Commit` command generating plain English AI explanations.
  - `CommitPilot AI: Copy Commit Hash` command copying hashes to clipboard.

- **Phases 1–7**:
  - Initial TypeScript extension foundation, Groq AI completion integration, Conventional Commit generation, dedicated Output Channel logging, production polish, and sanitization/validation.
