# External Agent Compatibility & BYO-AI Guide

## Overview

GitIQ adopts a **Bring Your Own AI (BYO-AI)** architecture. Instead of forcing developers into a single proprietary or vendor-locked AI service, GitIQ integrates with existing, officially supported AI access mechanisms and exposes its own Git intelligence through the **Model Context Protocol (MCP)** and native VS Code Language Model APIs.

### Security & Compliance Boundaries
- **No Token Scraping**: GitIQ never attempts to extract private authentication tokens, OAuth secrets, session cookies, or internal cache files from other extensions or browser sessions.
- **No Subscription Hijacking**: Connecting an MCP tool does not automatically grant GitIQ access to another product's paid subscription. Each integration uses legitimate, officially supported provider interfaces.
- **Human In the Loop**: All commit operations and PR submissions require explicit developer confirmation before executing Git mutations.

---

## Agent Compatibility Matrix

| Environment / Agent | 1. Direct Model Access? | 2. Expose GitIQ via MCP / Tools? | 3. Handoff Task to Agent? | 4. Structured Results Back? | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **GitHub Copilot** | **Yes** (via `vscode.lm` API) | **Yes** (via `vscode.lm.registerTool`) | **Yes** (Copilot Chat / Prompt) | **Yes** (Streamed text parts) | **Implemented & Verified** |
| **Google Antigravity** | **No** (Direct token extraction prohibited) | **Yes** (via Stdio MCP Server) | **Yes** (MCP tool invocations) | **Yes** (JSON-RPC 2.0 schemas) | **Implemented & Verified** |
| **Anthropic Claude Code** | **No** (CLI manages own auth) | **Yes** (via Stdio MCP Server) | **Yes** (Claude CLI MCP execution) | **Yes** (Standard MCP tool content) | **Implemented & Verified** |
| **OpenAI Codex / CLI** | **No** (Requires explicit API key) | **Yes** (via Stdio MCP Server) | **Yes** (MCP agent runners) | **Yes** (JSON-RPC responses) | **Implemented & Verified** |

---

## Agent Deep Dives

### 1. GitHub Copilot
- **1. Direct Model Access**:
  - **Mechanism**: Official VS Code Language Model API (`vscode.lm.selectChatModels({ vendor: 'copilot' })`).
  - **Behavior**: Uses the developer's authenticated GitHub Copilot subscription inside VS Code.
  - **Consent**: VS Code prompts the user to grant permission when GitIQ initiates the first model request. Handles `LanguageModelError.NoPermissions`, `Blocked`, and `QuotaExceeded` gracefully.
  - **Credentials**: Zero API keys required from the developer.
- **2. Expose GitIQ via MCP / LM Tools**:
  - Registered natively using `vscode.lm.registerTool` under `gitiq_*`. Copilot Chat participants can invoke GitIQ tools during chat workflows.
- **3. Handoff & Structured Results**:
  - Handed off via prompt construction; responses are streamed via `LanguageModelChatResponse.text` and validated by `CommitMessageValidator`.

### 2. Google Antigravity
- **1. Direct Model Access**:
  - Direct scraping of Antigravity's internal model endpoints or tokens is unsupported and blocked by platform security boundaries.
- **2. Expose GitIQ via MCP Server**:
  - **Mechanism**: Standard JSON-RPC 2.0 stdio MCP server (`node out/mcp/server.js`).
  - **Configuration**: Antigravity agents discover GitIQ tools through `mcp_config.json`.
  - **Tools Exposed**: `get_repository_info`, `get_git_status`, `get_staged_diff`, `search_commit_history`, `generate_commit_message_suggestion`, `prepare_pull_request_description`.
- **3. Handoff Task to Local Agent**:
  - Antigravity autonomous workflows dispatch tool calls to GitIQ to inspect repository state, staged changes, or historical patterns.
- **4. Structured Result Back**:
  - All tools return strictly typed JSON structures adhering to the Model Context Protocol (2024-11-05 specification). Suggestions are explicitly marked with `status: "SUGGESTION_ONLY"` and `executed: false`.

### 3. Anthropic Claude Code
- **1. Direct Model Access**:
  - Claude Code CLI (`claude`) uses its own authentication mechanism. GitIQ does not bypass billing or read private CLI tokens.
- **2. Expose GitIQ via MCP Server**:
  - Claude Code natively supports Model Context Protocol servers over stdio.
  - **Setup Command**:
    ```bash
    claude mcp add gitiq node /absolute/path/to/vs-extansen/out/mcp/server.js
    ```
- **3. Handoff & Structured Results**:
  - Claude Code can query GitIQ tools to read repository stats, examine filtered staged diffs, and generate Conventional Commit proposals.

### 4. OpenAI Codex
- **1. Direct Model Access**:
  - Standalone OpenAI access requires an explicit API key or OpenAI SDK client.
- **2. Expose GitIQ via MCP Server**:
  - Supported via MCP runners or compatible agent bridges connecting to `node out/mcp/server.js`.
- **3. Handoff & Structured Results**:
  - Receives structured, safe read-only repository context with sensitive credentials filtered out.

---

## MCP Server Configuration

### Running GitIQ MCP Server Standalone
```bash
# Run directly via Node.js
node out/mcp/server.js

# Or via npm script
npm run mcp
```

### Antigravity Configuration (`mcp_config.json`)
```json
{
  "mcpServers": {
    "gitiq": {
      "command": "node",
      "args": ["<PATH_TO_EXTENSION>/out/mcp/server.js"],
      "disabled": false,
      "autoApprove": [
        "get_repository_info",
        "get_git_status",
        "get_staged_diff",
        "search_commit_history"
      ]
    }
  }
}
```

### Claude Code Configuration
```bash
claude mcp add gitiq node "<PATH_TO_EXTENSION>/out/mcp/server.js"
```
