<div align="center">

<img src="icon.png" alt="GitIQ Logo" width="128" height="128" />

# GitIQ

AI-Powered Git Assistant for Visual Studio Code

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![VS Code](https://img.shields.io/badge/VS_Code-1.95+-007ACC)
![License](https://img.shields.io/badge/license-MIT-green)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6)

---

*Transform your Git workflow with automated Conventional Commit generation, AI commit explanations, professional Pull Request creation, offline commit analytics, and seamless GitHub integration.*

</div>

---

## 📖 Overview

**GitIQ** is an extension for Visual Studio Code designed to elevate developer productivity and standardize version control practices. By inspecting your staged Git diffs and repository history, GitIQ automatically drafts concise, conventional commit messages and complete Pull Request documents using a provider-independent **Bring Your Own AI (BYO-AI)** architecture.

Connect GitIQ with your existing AI access:
- **GitHub Copilot**: Use your active Copilot subscription via native `vscode.lm` APIs—zero API keys required!
- **Google Gemini API**: Direct REST API integration (`gemini-1.5-flash`, `gemini-1.5-pro`).
- **Ollama**: 100% offline, privacy-first local inference (`http://localhost:11434`).
- **Groq API**: High-speed cloud models (`llama-3.3-70b-versatile`, `llama-3.1-8b-instant`).
- **Model Context Protocol (MCP)**: Expose safe GitIQ tools to external agents (Claude Code, Google Antigravity, OpenAI Codex) via standalone stdio server or native VS Code Language Model Tools.

In addition to AI capabilities, GitIQ features a suite of **offline Git tools**—including keyword search, commit statistics, 7-day activity tables, contributor rankings, and GitHub web shortcuts—operating instantly without remote API calls.

---

## 🎥 Demo

<div align="center">

![GitIQ Demo Placeholder](images/demo.gif)

*Watch GitIQ generate conventional commit messages and pull requests in real time.*

</div>

---

## 📸 Screenshots

| Feature | Preview |
| :--- | :--- |
| **Home & Dashboard** | ![GitIQ Home](images/home.png) |
| **AI Commit Generator** | ![AI Commit Generator](images/commit.png) |
| **Commit History Explorer** | ![Commit History](images/history.png) |
| **Pull Request Helper** | ![Pull Request Helper](images/pr-helper.png) |
| **Secure Settings** | ![GitIQ Settings](images/settings.png) |

---

## ✨ Key Features

### 🤖 Bring Your Own AI (BYO-AI) Architecture
- **GitHub Copilot Integration**: Seamlessly dispatches requests to Copilot chat models using VS Code's official Language Model API (`vscode.lm.selectChatModels`). Respects user consent, supports request cancellation, and streams completions.
- **Multi-Provider Switcher**: Switch instantly between Groq, GitHub Copilot, Google Gemini, Ollama (local offline), and MCP delegation.
- **Model Context Protocol (MCP) Integration**:
  - Exposes 6 read-only, safe Git tools (`get_repository_info`, `get_git_status`, `get_staged_diff`, `search_commit_history`, `generate_commit_message_suggestion`, `prepare_pull_request_description`).
  - Available as a standalone stdio JSON-RPC server (`out/mcp/server.js`) for Claude Code, Antigravity, and Codex.
  - Available inside VS Code via `vscode.lm.registerTool`.
- **Conventional Commit Generator**: Drafts structured `feat:`, `fix:`, `refactor:`, `docs:`, `perf:` messages directly from your staged diffs (`git diff --cached`).
- **AI Commit Explanation**: Explains complex commits in plain English—summarizing purpose, affected files, major changes, and potential system impact.
- **AI Pull Request Helper**: Constructs complete, professional Pull Requests (Title, Summary, Detailed Description, Files Changed, Testing, Breaking Changes, Checklist) from branch diffs and commit histories.

### 📊 Offline Git History Analytics
- **Search Commit History**: Offline keyword search across your commit log (`git log --all --grep`).
- **Repository Statistics**: Computes total commits, today's commits, 7-day count, 30-day count, average commits/day, repo age, and branch status.
- **Top Contributors**: Ranks author commit counts using `git shortlog -sn`.
- **Commit Activity**: Generates 7-day commit distribution breakdown tables.
- **Export Report**: Saves a complete Markdown report (`commit-history-report.md`) directly to your workspace root.

### 🛡️ Security & Privacy
- **Zero Token Scraping**: GitIQ never inspects private session tokens, browser cookies, or internal authorization files.
- **OS-Level Secret Storage**: API keys are saved encrypted via `vscode.SecretStorage`. Copilot and Ollama require zero keys.
- **Explicit Human Approval**: AI suggestions are presented in an editable input box for developer review before any commit or push occurs.
- **Strict Data Sanitization**: MCP tools redact sensitive credentials, tokens, and files from repository metadata and diffs.

---

## 🚀 Getting Started

### 1. Installation
Install GitIQ directly from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=gitiq.gitiq) or search for `GitIQ` in the Extensions view (`Ctrl+Shift+X` / `Cmd+Shift+X`).

### 2. Choose Your AI Provider
Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run:
`GitIQ: Select AI Provider`

- **GitHub Copilot**: Select `GitHub Copilot (Built-in LM)`. Requires the GitHub Copilot extension. No API key needed!
- **Groq API**: Select `Groq API` and run `GitIQ: Set Groq API Key` with your key from [Groq Console](https://console.groq.com/).
- **Google Gemini**: Select `Google Gemini API` and run `GitIQ: Set Gemini API Key` with your key from Google AI Studio.
- **Ollama**: Select `Ollama (Local Offline)`. Start Ollama locally (`ollama run llama3.2`). No key needed!
- **MCP Delegation**: Select `External Agent / MCP` for custom local agent routing.

### 3. Basic Usage
1. **Stage your changes**: `git add .`
2. **Generate Commit Message**: Run `GitIQ: Generate Commit Message`.
3. **Review & Confirm**: Edit the suggested message in the input box and press `Enter` to commit!

---

## 🔌 Model Context Protocol (MCP) Setup

GitIQ includes a standalone stdio MCP server enabling AI agents like Claude Code, Google Antigravity, and OpenAI Codex to inspect Git status, diffs, and generate commit suggestions safely.

### Connecting to External Agents (e.g. Claude Code or Antigravity)

Add GitIQ to your client's `mcp_config.json`:

```json
{
  "mcpServers": {
    "gitiq": {
      "command": "node",
      "args": [
        "/path/to/vscode-extension-gitiq/out/mcp/server.js"
      ],
      "env": {}
    }
  }
}
```

> See [docs/EXTERNAL_AGENT_COMPATIBILITY.md](docs/EXTERNAL_AGENT_COMPATIBILITY.md) for full setup guides, agent permission models, and security guarantees.

---

## 🛠️ Complete Commands Reference

| Command Title | Command ID | Description |
| :--- | :--- | :--- |
| `GitIQ: Select AI Provider` | `gitIQ.selectProvider` | QuickPick switcher for active AI backend (Copilot, Groq, Gemini, Ollama, MCP). |
| `GitIQ: Set Gemini API Key` | `gitIQ.setGeminiApiKey` | Prompts for Google Gemini API key and stores in SecretStorage. |
| `GitIQ: Set Groq API Key` | `gitIQ.setApiKey` | Prompts for Groq API key and stores securely in VS Code `SecretStorage`. |
| `GitIQ: Update Groq API Key` | `gitIQ.updateApiKey` | Reuses secure prompt flow to update stored Groq API key. |
| `GitIQ: Remove Groq API Key` | `gitIQ.removeApiKey` | Deletes stored Groq API key from `SecretStorage`. |
| `GitIQ: Select Groq Model` | `gitIQ.selectModel` | Displays QuickPick selector for supported Groq models. |
| `GitIQ: Generate Commit Message` | `gitIQ.generateCommitMessage` | Analyzes staged changes with AI and presents editable commit box. |
| `GitIQ: Generate Pull Request` | `gitIQ.generatePullRequest` | Generates complete AI Pull Request document from branch diff & history. |
| `GitIQ: Explain Commit` | `gitIQ.explainCommit` | Generates a plain English AI explanation of any commit. |
| `GitIQ: Preview Git Diff` | `gitIQ.previewGitDiff` | Opens read-only virtual diff document for staged changes (`git diff --cached`). |
| `GitIQ: View Commit History` | `gitIQ.viewCommitHistory` | Displays recent commits (`git log -n 20`) in QuickPick with details viewer. |
| `GitIQ: Search Commit History` | `gitIQ.searchCommitHistory` | Offline keyword search across commit messages (`git log --all --grep`). |
| `GitIQ: Commit Statistics` | `gitIQ.commitStatistics` | Aggregates repository commit metrics and age statistics. |
| `GitIQ: Top Contributors` | `gitIQ.topContributors` | Displays ranked contributor commit counts using `git shortlog -sn`. |
| `GitIQ: Commit Activity` | `gitIQ.commitActivity` | Displays 7-day commit activity breakdown as a Markdown table. |
| `GitIQ: Export History Report` | `gitIQ.exportHistoryReport` | Exports complete Markdown analytics report to `commit-history-report.md`. |
| `GitIQ: Copy Commit Hash` | `gitIQ.copyCommitHash` | Copies selected commit hash to system clipboard. |
| `GitIQ: Push Branch` | `gitIQ.push` | Pushes current branch to remote origin with progress notification. |
| `GitIQ: Pull Branch` | `gitIQ.pull` | Pulls latest changes from remote origin with conflict detection. |
| `GitIQ: Fetch Updates` | `gitIQ.fetch` | Fetches remote references (`git fetch`). |
| `GitIQ: Show Current Branch` | `gitIQ.currentBranch` | Displays active checked-out branch name. |
| `GitIQ: Repository Information` | `gitIQ.repositoryInfo` | Opens read-only Markdown document summarizing repository metadata. |
| `GitIQ: Open GitHub Repository` | `gitIQ.openRepository` | Detects origin URL and opens repository in default browser. |
| `GitIQ: Open Current Branch on GitHub` | `gitIQ.openBranch` | Opens active branch on GitHub in default browser. |
| `GitIQ: Open Pull Request Page` | `gitIQ.openPullRequestPage` | Opens GitHub compare URL (`/compare/main...currentBranch`) in browser. |
| `GitIQ: Copy PR Title` | `gitIQ.copyPRTitle` | Copies generated PR title to clipboard. |
| `GitIQ: Copy PR Description` | `gitIQ.copyPRDescription` | Copies generated PR description Markdown to clipboard. |
| `GitIQ: Copy Entire Pull Request` | `gitIQ.copyEntirePR` | Copies full generated PR document to clipboard. |
| `GitIQ: Save Pull Request` | `gitIQ.savePullRequest` | Saves generated PR as `pull-request.md` in workspace root. |
| `GitIQ: Refresh Dashboard` | `gitIQ.refreshSidebar` | Refreshes the GitIQ sidebar webview. |
| `GitIQ: Check Git Repository` | `gitIQ.checkGitRepository` | Verifies whether the workspace is inside a Git repository. |
| `GitIQ: Hello` | `gitIQ.hello` | Health check command verifying extension activation. |

---

## ⚙️ Configuration

GitIQ provides customizable configuration settings under the `gitIQ` section in Settings:

| Setting Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `gitIQ.provider` | `enum` | `"groq"` | Active AI provider (`groq`, `copilot`, `gemini`, `ollama`, `mcp`). |
| `gitIQ.model` | `string` | `"llama-3.3-70b-versatile"` | Model ID used for Groq AI generation. |
| `gitIQ.geminiModel` | `string` | `"gemini-1.5-flash"` | Model ID for Gemini provider (`gemini-1.5-flash`, `gemini-1.5-pro`). |
| `gitIQ.ollamaEndpoint`| `string` | `"http://localhost:11434"` | Base URL for local Ollama server. |
| `gitIQ.ollamaModel` | `string` | `"llama3.2"` | Model name for Ollama completion requests. |
| `gitIQ.copilotFamily`| `string` | `""` | Optional Copilot model family filter (e.g. `gpt-4o`). |
| `gitIQ.temperature` | `number` | `0.2` | Sampling temperature for AI generation (0.0 to 2.0). |
| `gitIQ.timeout` | `number` | `30000` | Request timeout in milliseconds. |

---

## 🔒 Privacy & Telemetry Statement

- **Zero Telemetry**: GitIQ contains **no tracking scripts, telemetry analytics, or user profiling**.
- **Local Git Execution**: All Git history exploration, activity analysis, and diff operations execute locally via Git CLI.
- **Secure API Communication**: Diff snippets sent for commit and PR generation are transmitted directly to the official Groq API endpoint via HTTPS using your private API key.

---

## ❓ Frequently Asked Questions (FAQ)

<details>
<summary><b>1. Is GitIQ free to use?</b></summary>
Yes! GitIQ is 100% open-source under the MIT license. You only need a free API key from Groq Console to use AI features.
</details>

<details>
<summary><b>2. Where is my API key stored?</b></summary>
Your API key is saved using VS Code's native <code>SecretStorage</code> API, which encrypts data using your operating system's native keychain (Keychain on macOS, Credential Manager on Windows, libsecret on Linux).
</details>

<details>
<summary><b>3. Does GitIQ support large repositories?</b></summary>
Yes. GitIQ automatically truncates safe context limits (~70,000 characters) before sending prompts to ensure your requests stay within AI context windows.
</details>

---

## 🗺️ Roadmap

- [x] Groq AI Conventional Commit Generator
- [x] AI Commit Explanation & Diff Preview
- [x] AI Pull Request Helper (Generate, Copy, Save, Open Compare Page)
- [x] Offline Commit Analytics & History Explorer
- [x] OS-Level SecretStorage Integration
- [ ] Multi-Provider Support (OpenAI, Gemini, Ollama)
- [ ] Source Control (SCM) Inline Button Integration
- [ ] Custom User Prompt Templates

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/ThakurDivyanshsingh-77/CommitPilot-AI/issues).

1. Fork the repository.
2. Create your feature branch (`git checkout -b feature/AmazingFeature`).
3. Commit your changes (`git commit -m 'feat: add amazing feature'`).
4. Push to the branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request!

---

## 📜 License

Distributed under the MIT License. See [`LICENSE`](LICENSE) for more information.

---

## 📞 Support & Contact

- **GitHub Issues**: [Report a Bug or Request Feature](https://github.com/ThakurDivyanshsingh-77/CommitPilot-AI/issues)
- **Repository**: [ThakurDivyanshsingh-77/CommitPilot-AI](https://github.com/ThakurDivyanshsingh-77/CommitPilot-AI)
