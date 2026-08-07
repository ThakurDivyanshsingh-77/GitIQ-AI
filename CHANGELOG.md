# Changelog

All notable changes to CommitPilot AI will be documented in this file.

## [0.1.0] - 2026-08-07

### Added

- **Phase 13 - Settings & Configuration**:
  - `CommitPilot AI: Set Groq API Key` command (`commitPilotAI.setApiKey`) storing API key securely in VS Code `SecretStorage`.
  - `CommitPilot AI: Update Groq API Key` command (`commitPilotAI.updateApiKey`) for updating credentials.
  - `CommitPilot AI: Remove Groq API Key` command (`commitPilotAI.removeApiKey`) deleting key from `SecretStorage`.
  - `CommitPilot AI: Select Groq Model` command (`commitPilotAI.selectModel`) supporting `llama-3.3-70b-versatile`, `llama-3.1-8b-instant`, `openai/gpt-oss-120b`, and `deepseek-r1-distill-llama-70b`.
  - Automatic legacy `settings.json` API key migration prompt on activation.
  - Non-blocking activation check with friendly warning if API key is unconfigured.
  - `SettingsService` in `src/services/SettingsService.ts`.

- **Phase 12 - AI Commit History Analytics (Offline Git CLI)**:
  - Search Commit History, Commit Statistics, Top Contributors, Commit Activity, Export History Report.

- **Phase 10 - AI Pull Request Assistant**:
  - Generate Pull Request, Copy PR Title/Description/Entire PR, Save PR, Open PR Page on GitHub.

- **Phase 9 - GitHub Integration**:
  - Push, Pull, Fetch, Current Branch, Repository Info, Open GitHub Repo, Open Branch on GitHub.

- **Phase 8 - Commit History Explorer & AI Commit Explanation**:
  - View Commit History, Commit Details, AI Explain Commit, Copy Commit Hash.

- **Phases 1–7**:
  - Initial TypeScript extension foundation, Groq AI integration, Conventional Commit generation, dedicated Output Channel logging, production polish, and sanitization/validation.
