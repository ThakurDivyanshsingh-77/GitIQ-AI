# GitIQ Sidebar Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the GitIQ VS Code extension with a dedicated Activity Bar container and native TreeView sidebar dashboard grouping all existing Git and AI capabilities.

**Architecture:** Add an SVG activity bar icon in `resources/icon.svg`, contribute `viewsContainers.activitybar` and `views` in `package.json`, implement `SidebarTreeDataProvider` implementing `vscode.TreeDataProvider` to organize all 29+ existing commands into five logical groups (AI Tools, Pull Requests, Git & GitHub, Commit History, AI Settings) with appropriate empty state handling, and wire into extension activation.

**Tech Stack:** TypeScript 5.7, VS Code Extension API ^1.95.0, esbuild.

**Spec:** User prompt "GitIQ Sidebar Upgrade — Master Implementation Prompt".

## Global Constraints

- Never expose API keys in sidebar, logs, or error messages.
- Preserve all 29 existing command IDs and their exact execution behavior.
- Support light and dark themes using native `vscode.ThemeIcon`.
- Maintain strict TypeScript and ESLint standards (`npm run check` must pass cleanly).
- Update `PROJECT_CONTEXT.md` and `CHANGELOG.md` upon completion.

## Review Focus

- Sidebar works outside git repository or when workspace is empty (shows empty state / warning without crashing).
- Clicking any action executes the exact real command without unintended side-effects.
- Sidebar refreshes properly via title button or workspace changes.
- SVG icon conforms to VS Code Activity Bar 24x24 vector guidelines and displays cleanly in both themes.
- Bundled package includes required assets and runs cleanly without missing dependencies.

---

### Task 1: Create the Activity Bar SVG Icon

**Files:**
- Create: `resources/icon.svg`

**Interfaces:**
- Produces: 24x24 SVG vector icon using `currentColor` for Activity Bar icon in `package.json`.

- [ ] **Step 1: Create `resources/icon.svg`**
Create clean 24x24 SVG combining Git branch node motifs with AI intelligence sparkle.

- [ ] **Step 2: Verify SVG file format and dimensions**
Check file is valid XML/SVG and 24x24 viewBox.

---

### Task 2: Implement `SidebarTreeDataProvider`

**Files:**
- Create: `src/providers/sidebarTreeDataProvider.ts`
- Modify: `src/utils/constants.ts` (add `refreshSidebar` and `aiCodeReview` command IDs)

**Interfaces:**
- Consumes: `GitService`, `COMMAND_IDS`
- Produces: `SidebarTreeDataProvider implements vscode.TreeDataProvider<GitIQTreeItem>`

- [ ] **Step 1: Update `src/utils/constants.ts`**
Add `refreshSidebar: 'gitIQ.refreshSidebar'` and `aiCodeReview: 'gitIQ.aiCodeReview'` to `COMMAND_IDS`.

- [ ] **Step 2: Implement `SidebarTreeDataProvider` in `src/providers/sidebarTreeDataProvider.ts`**
Define tree items and groups:
  - AI Tools (Generate Commit Message, Preview Staged Diff, Explain Commit, AI Code Review [Planned])
  - Pull Requests (Generate PR, Open PR Page, Copy PR Title, Copy PR Description, Copy Entire PR, Save PR)
  - Git & GitHub (Show Current Branch, Repository Info, Push, Pull, Fetch, Open GitHub Repo, Open Branch)
  - Commit History (View Commit History, Search History, Commit Statistics, Top Contributors, Commit Activity, Export History Report)
  - AI Settings (Set API Key, Update API Key, Remove API Key, Select Model)
Handle empty repository detection with helpful status item.

---

### Task 3: Update `package.json` Manifest Contributions

**Files:**
- Modify: `package.json`

**Interfaces:**
- Produces: `contributes.viewsContainers.activitybar`, `contributes.views`, `contributes.viewsWelcome`, `contributes.commands`, `contributes.menus`, and version bump to `1.1.0`.

- [ ] **Step 1: Add Activity Bar and View definitions**
Add `viewsContainers.activitybar` with id `gitiq-sidebar` pointing to `resources/icon.svg`.
Add `views.gitiq-sidebar` with id `gitiq.sidebarView`.
Add `viewsWelcome` for empty workspace state.
Add `gitIQ.refreshSidebar` and `gitIQ.aiCodeReview` commands and view title menu icon.
Bump version to `1.1.0`.

---

### Task 4: Wire Sidebar into Extension Activation

**Files:**
- Modify: `src/extension.ts`

**Interfaces:**
- Consumes: `SidebarTreeDataProvider`
- Produces: Registered TreeDataProvider and commands `gitIQ.refreshSidebar`, `gitIQ.aiCodeReview` in `context.subscriptions`.

- [ ] **Step 1: Instantiate and register `SidebarTreeDataProvider`**
Register with `vscode.window.registerTreeDataProvider('gitiq.sidebarView', sidebarProvider)`.
Register `gitIQ.refreshSidebar` and `gitIQ.aiCodeReview` commands.

---

### Task 5: Verification, Testing & Packaging

**Files:**
- Execute: `npm run check`
- Execute: `npm run package`

- [ ] **Step 1: Run TypeScript compiler, ESLint, and esbuild packaging**
Ensure 0 errors, 0 warnings.
- [ ] **Step 2: Inspect bundled output in `out/extension.js`**

---

### Task 6: Documentation and Memory Bank Update

**Files:**
- Modify: `PROJECT_CONTEXT.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Update `PROJECT_CONTEXT.md` with new features, architecture, and file structure**
- [ ] **Step 2: Update `CHANGELOG.md` with version 1.1.0 release notes**
