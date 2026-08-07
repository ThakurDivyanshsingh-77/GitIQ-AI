# Changelog

All notable changes to CommitPilot AI will be documented in this file.

## [0.1.0] - 2026-08-07

### Added

- **Phase 10 - AI Pull Request Assistant**:
  - `CommitPilot AI: Generate Pull Request` command (`commitPilotAI.generatePullRequest`) generating complete PR documents with AI from branch diff and commit history.
  - `CommitPilot AI: Copy PR Title` command (`commitPilotAI.copyPRTitle`) copying generated PR title to clipboard.
  - `CommitPilot AI: Copy PR Description` command (`commitPilotAI.copyPRDescription`) copying PR description to clipboard.
  - `CommitPilot AI: Copy Entire Pull Request` command (`commitPilotAI.copyEntirePR`) copying full PR Markdown to clipboard.
  - `CommitPilot AI: Save Pull Request` command (`commitPilotAI.savePullRequest`) saving PR as `pull-request.md` in project root.
  - `CommitPilot AI: Open Pull Request Page` command (`commitPilotAI.openPullRequestPage`) opening GitHub compare URL for PR creation.
  - `PullRequestService` with `generatePullRequest()`, `parsePullRequest()`, `validatePullRequest()`.
  - `PullRequestProvider` virtual document for read-only PR Markdown preview.
  - `PromptBuilder.buildPullRequestPrompt()` for structured PR generation prompts.
  - `GitService` extended with `getDefaultBranch()`, `getBranchDiff()`, `getBranchCommits()`, `getCompareUrl()`.

- **Phase 9 - GitHub Integration**:
  - Push, Pull, Fetch, Current Branch, Repository Info, Open GitHub Repo, Open Branch on GitHub.

- **Phase 8 - Commit History Explorer & AI Commit Explanation**:
  - View Commit History, Commit Details, AI Explain Commit, Copy Commit Hash.

- **Phases 1–7**:
  - Initial TypeScript extension foundation, Groq AI integration, Conventional Commit generation, dedicated Output Channel logging, production polish, and sanitization/validation.
