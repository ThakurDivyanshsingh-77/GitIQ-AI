import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { GitService } from '../services/gitService';
import type { LoggerService } from '../services/loggerService';
import type { RepositoryDetector, RepositoryDetectionState } from '../services/repositoryDetector';
import type { SettingsService } from '../services/SettingsService';
import { COMMAND_IDS } from '../utils/constants';

export interface RepoState {
	hasWorkspace: boolean;
	isGitRepo: boolean;
	repoName: string;
	branch: string;
	remoteUrl?: string;
	activeProvider?: string;
}

export interface WebviewRepoState {
	status: 'detecting' | 'detected' | 'no-repo' | 'git-unavailable' | 'detection-failed';
	hasWorkspace: boolean;
	isGitRepo: boolean;
	repoName: string;
	rootPath?: string;
	branch: string;
	remoteUrl?: string;
	stagedCount?: number;
	uncommittedCount?: number;
	statusSummary?: string;
	totalReposCount?: number;
	errorMessage?: string;
	activeProvider?: string;
}

/**
 * WebviewViewProvider that renders the modern GitIQ dashboard in the Activity Bar sidebar.
 * Replicates the modern dark card-based dashboard layout:
 * - Current Repository status card with active repo name & branch
 * - 2x2 Quick Actions grid (AI Commit, Code Review, Create PR, History)
 * - Expandable All Tools section (Git & GitHub, Pull Requests, Commit Analytics, AI Settings)
 */
export class SidebarWebviewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
	public static readonly viewType = 'gitiq.sidebarView';

	private _view?: vscode.WebviewView;
	private readonly _disposables: vscode.Disposable[] = [];

	public constructor(
		private readonly extensionUri: vscode.Uri,
		private readonly gitService?: GitService,
		private readonly settingsService?: SettingsService,
		private readonly logger?: LoggerService,
		private readonly repositoryDetector?: RepositoryDetector
	) {
		if (this.repositoryDetector) {
			this._disposables.push(
				this.repositoryDetector.onDidChangeState((detState) => {
					void this.pushRepoState(detState);
				})
			);
		}
	}

	public resolveWebviewView(webviewView: vscode.WebviewView): void {
		this._view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this.extensionUri]
		};

		webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

		webviewView.webview.onDidReceiveMessage(async (data: { command: string; args?: unknown[]; file?: string; line?: number }) => {
			if (!data || !data.command) {
				return;
			}
			this.logger?.info(`[SidebarWebview] Received command: "${data.command}"`);

			if (data.command === 'webviewReady') {
				// Immediate handshake: send current state as soon as webview listener is active
				if (this.repositoryDetector) {
					await this.pushRepoState();
					if (this.repositoryDetector.state.status === 'detecting') {
						await this.repositoryDetector.detectRepositories();
					}
				} else {
					await this.updateState();
				}
				return;
			}

			if (data.command === 'refresh') {
				if (this.repositoryDetector) {
					await this.repositoryDetector.refresh();
				} else {
					await this.updateState();
				}
				return;
			}

			if (data.command === 'openFolder') {
				await vscode.commands.executeCommand('vscode.openFolder');
				return;
			}

			if (data.command === 'initGit') {
				try {
					await vscode.commands.executeCommand('git.init');
					if (this.repositoryDetector) {
						setTimeout(() => {
							void this.repositoryDetector?.refresh();
						}, 800);
					}
				} catch (err: unknown) {
					const msg = err instanceof Error ? err.message : String(err);
					this.logger?.warn(`git.init command failed: ${msg}`);
					void vscode.window.showErrorMessage(`GitIQ: Failed to initialize Git repository: ${msg}`);
				}
				return;
			}

			if (data.command === 'selectRepo') {
				if (this.repositoryDetector) {
					await this.repositoryDetector.selectActiveRepository();
				}
				return;
			}

			if (data.command === 'openFileAtLine' && typeof data.file === 'string') {
				await this.openFileAtLine(data.file, typeof data.line === 'number' ? data.line : 1);
				return;
			}

			try {
				if (Array.isArray(data.args)) {
					await vscode.commands.executeCommand(data.command, ...data.args);
				} else {
					await vscode.commands.executeCommand(data.command);
				}
			} catch (error: unknown) {
				const msg = error instanceof Error ? error.message : String(error);
				this.logger?.error(`Webview command execution error for "${data.command}": ${msg}`);
				void vscode.window.showErrorMessage(`GitIQ: Failed to run command: ${msg}`);
			}
		});

		// Push initial state
		if (this.repositoryDetector) {
			void this.pushRepoState();
			if (this.repositoryDetector.state.status === 'detecting') {
				void this.repositoryDetector.detectRepositories();
			}
		} else {
			void this.updateState();
		}
	}

	/**
	 * Posts Code Review progress, results, or error state to the sidebar Webview.
	 */
	public postCodeReviewState(state: unknown): void {
		if (this._view) {
			void this._view.webview.postMessage({
				type: 'codeReviewState',
				state
			});
		}
	}

	/**
	 * Opens a file in the editor and scrolls to the specified line number safely.
	 */
	public async openFileAtLine(filePath: string, line: number): Promise<void> {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			return;
		}

		const workspacePath = workspaceFolders[0].uri.fsPath;
		const fullPath = path.isAbsolute(filePath) ? filePath : path.resolve(workspacePath, filePath);

		try {
			const uri = vscode.Uri.file(fullPath);
			const doc = await vscode.workspace.openTextDocument(uri);
			const editor = await vscode.window.showTextDocument(doc, { preview: true });
			const targetLine = Math.max(0, Math.min(doc.lineCount - 1, (line > 0 ? line - 1 : 0)));
			const pos = new vscode.Position(targetLine, 0);
			editor.selection = new vscode.Selection(pos, pos);
			editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : String(error);
			this.logger?.warn(`Could not open file at ${fullPath}:${line} - ${msg}`);
			void vscode.window.showWarningMessage(`GitIQ: Could not open "${filePath}" at line ${line} (${msg})`);
		}
	}

	/**
	 * Computes the current repository state and pushes it to the Webview.
	 */
	public async updateState(): Promise<void> {
		if (this.repositoryDetector) {
			const detState = await this.repositoryDetector.detectRepositories();
			await this.pushRepoState(detState);
			return;
		}

		if (!this._view) {
			return;
		}

		const state = await this.getCurrentRepoState();
		if (state.isGitRepo && state.branch && state.branch !== 'unknown') {
			this._view.description = state.branch;
		} else {
			this._view.description = undefined;
		}
		void this._view.webview.postMessage({
			type: 'updateRepoState',
			state
		});
	}

	/**
	 * Pushes repository detection state to the webview view.
	 */
	public async pushRepoState(detState?: RepositoryDetectionState): Promise<void> {
		if (!this._view) {
			return;
		}

		const current = detState ?? this.repositoryDetector?.state;
		if (!current) {
			return;
		}

		const activeRepo = current.activeRepo;
		if (activeRepo && activeRepo.branch && activeRepo.branch !== 'unknown') {
			this._view.description = activeRepo.branch;
		} else {
			this._view.description = undefined;
		}

		let repoName = 'No Workspace';
		if (current.status === 'detecting') {
			repoName = activeRepo?.repoName ?? 'Detecting...';
		} else if (current.status === 'detected' && activeRepo) {
			repoName = activeRepo.repoName;
		} else if (current.status === 'git-unavailable') {
			repoName = 'Git Unavailable';
		} else if (current.status === 'detection-failed') {
			repoName = 'Detection Failed';
		} else if (current.status === 'no-repo') {
			repoName = (vscode.workspace.workspaceFolders?.length ?? 0) > 0 ? 'No Git Repository' : 'No Workspace';
		}

		const payload: WebviewRepoState = {
			status: current.status,
			hasWorkspace: (vscode.workspace.workspaceFolders?.length ?? 0) > 0,
			isGitRepo: current.status === 'detected' && !!activeRepo,
			repoName,
			rootPath: activeRepo?.rootPath,
			branch: activeRepo?.branch ?? (current.status === 'detecting' ? 'Detecting...' : 'None'),
			remoteUrl: activeRepo?.remoteUrl,
			stagedCount: activeRepo?.stagedCount,
			uncommittedCount: activeRepo?.uncommittedCount,
			statusSummary: activeRepo?.statusSummary,
			totalReposCount: current.allRepos.length,
			errorMessage: current.errorMessage,
			activeProvider: this.settingsService?.getProvider() ?? 'groq'
		};

		void this._view.webview.postMessage({
			type: 'updateRepoState',
			state: payload
		});
	}

	public dispose(): void {
		for (const d of this._disposables) {
			try {
				d.dispose();
			} catch {
				// Ignore
			}
		}
		this._disposables.length = 0;
	}

	private async getCurrentRepoState(): Promise<RepoState> {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			return {
				hasWorkspace: false,
				isGitRepo: false,
				repoName: 'No Workspace Open',
				branch: 'None'
			};
		}

		const workspacePath = workspaceFolders[0].uri.fsPath;
		const folderName = path.basename(workspacePath);

		if (!this.gitService) {
			return {
				hasWorkspace: true,
				isGitRepo: false,
				repoName: folderName,
				branch: 'unknown'
			};
		}

		try {
			const isRepo = await this.gitService.isGitRepository(workspacePath);
			if (!isRepo) {
				return {
					hasWorkspace: true,
					isGitRepo: false,
					repoName: folderName,
					branch: 'Not a git repo'
				};
			}

			let repoName = folderName;
			let remoteUrl: string | undefined;
			try {
				remoteUrl = await this.gitService.getRemoteUrl(workspacePath);
				if (remoteUrl) {
					const match = remoteUrl.match(/[:/]([^/:]+\/[^/:]+?)(?:\.git)?$/);
					if (match && match[1]) {
						repoName = match[1];
					}
				}
			} catch {
				// Keep directory name
			}

			let branch = 'HEAD';
			try {
				branch = await this.gitService.getCurrentBranch(workspacePath);
			} catch {
				branch = 'unknown';
			}

			return {
				hasWorkspace: true,
				isGitRepo: true,
				repoName,
				branch,
				remoteUrl,
				activeProvider: this.settingsService?.getProvider() ?? 'groq'
			};
		} catch {
			return {
				hasWorkspace: true,
				isGitRepo: false,
				repoName: folderName,
				branch: 'unknown',
				activeProvider: this.settingsService?.getProvider() ?? 'groq'
			};
		}
	}

	/**
	 * Computes the initial repository render state synchronously to eliminate
	 * any loading/detecting flash in the webview.
	 */
	private getInitialRenderState(): {
		repoName: string;
		statusDotClass: string;
		statusText: string;
		rootPath?: string;
		actionRowHtml?: string;
		showSwitchBtn: boolean;
		switchCount: number;
	} {
		const current = this.repositoryDetector?.state;
		if (current && current.status === 'detected' && current.activeRepo) {
			const active = current.activeRepo;
			const summary = active.statusSummary ? ' • ' + active.statusSummary : '';
			return {
				repoName: active.repoName,
				statusDotClass: 'status-dot',
				statusText: active.branch + summary,
				rootPath: active.rootPath,
				showSwitchBtn: current.allRepos.length > 1,
				switchCount: current.allRepos.length
			};
		}

		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			return {
				repoName: 'No Workspace Open',
				statusDotClass: 'status-dot warning',
				statusText: 'Open a folder to start working with Git',
				actionRowHtml:
					'<button class="repo-action-btn primary" data-action="openFolder">' +
						'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg> Open Folder' +
					'</button>',
				showSwitchBtn: false,
				switchCount: 0
			};
		}

		const folderPath = workspaceFolders[0].uri.fsPath;
		const folderName = path.basename(folderPath);

		try {
			const gitDirPath = path.join(folderPath, '.git');
			if (fs.existsSync(gitDirPath)) {
				let branch = 'main';
				try {
					let headPath = path.join(gitDirPath, 'HEAD');
					const stat = fs.statSync(gitDirPath);
					if (stat.isFile()) {
						// Worktree .git file containing "gitdir: <path>"
						const gitdirContent = fs.readFileSync(gitDirPath, 'utf8').trim();
						const match = gitdirContent.match(/^gitdir:\s*(.+)$/i);
						if (match && match[1]) {
							const resolvedGitDir = path.isAbsolute(match[1]) ? match[1] : path.resolve(folderPath, match[1]);
							headPath = path.join(resolvedGitDir, 'HEAD');
						}
					}
					if (fs.existsSync(headPath)) {
						const headContent = fs.readFileSync(headPath, 'utf8').trim();
						const refMatch = headContent.match(/^ref:\s*refs\/heads\/(.+)$/);
						if (refMatch && refMatch[1]) {
							branch = refMatch[1];
						} else if (/^[0-9a-f]{40}$/i.test(headContent)) {
							branch = headContent.slice(0, 7);
						}
					}
				} catch {
					branch = 'main';
				}

				return {
					repoName: folderName,
					statusDotClass: 'status-dot',
					statusText: branch,
					rootPath: folderPath,
					showSwitchBtn: false,
					switchCount: 1
				};
			}
		} catch {
			// Fall through to detecting state
		}

		return {
			repoName: folderName,
			statusDotClass: 'status-dot loading',
			statusText: 'Detecting repository...',
			showSwitchBtn: false,
			switchCount: 0
		};
	}

	private getHtmlForWebview(webview?: vscode.Webview): string {
		const initial = this.getInitialRenderState();
		const nonce = getNonce();
		const cspSource = webview?.cspSource ?? "vscode-webview:";
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; font-src ${cspSource}; img-src ${cspSource} https: data:; script-src 'nonce-${nonce}' ${cspSource};">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>GitIQ Dashboard</title>
	<style>
		:root {
			--bg-base: var(--vscode-sideBar-background, #16171b);
			--card-bg: rgba(255, 255, 255, 0.04);
			--card-hover-bg: rgba(255, 255, 255, 0.08);
			--card-active-bg: rgba(255, 255, 255, 0.12);
			--border-color: rgba(255, 255, 255, 0.08);
			--border-hover-color: rgba(255, 255, 255, 0.16);
			--text-primary: var(--vscode-sideBar-foreground, #ececec);
			--text-muted: var(--vscode-descriptionForeground, #8b949e);
			--accent-blue: #58a6ff;
			--accent-green: #3fb950;
			--accent-amber: #d29922;
			--font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif);
		}

		* {
			box-sizing: border-box;
			margin: 0;
			padding: 0;
		}

		svg, svg * {
			pointer-events: none;
		}

		body {
			background-color: var(--bg-base);
			color: var(--text-primary);
			font-family: var(--font-family);
			font-size: 13px;
			line-height: 1.4;
			padding: 14px 12px 24px 12px;
			user-select: none;
			-webkit-user-select: none;
			overflow-x: hidden;
		}

		/* Section Titles */
		.section-header {
			font-size: 11px;
			font-weight: 600;
			letter-spacing: 0.6px;
			text-transform: uppercase;
			color: var(--text-muted);
			margin-bottom: 8px;
			display: flex;
			align-items: center;
			justify-content: space-between;
		}

		.section-header.with-margin {
			margin-top: 18px;
		}

		/* Repository Header Card */
		.repo-card {
			background: var(--card-bg);
			border: 1px solid var(--border-color);
			border-radius: 8px;
			padding: 12px 14px;
			margin-bottom: 6px;
			position: relative;
			transition: border-color 0.15s ease, background-color 0.15s ease;
		}

		.repo-card:hover {
			border-color: var(--border-hover-color);
		}

		.repo-title-row {
			display: flex;
			align-items: center;
			gap: 8px;
			font-size: 14px;
			font-weight: 600;
			color: #ffffff;
			word-break: break-all;
		}

		.repo-title-row svg {
			flex-shrink: 0;
			color: var(--accent-blue);
		}

		.repo-status-row {
			display: flex;
			align-items: center;
			gap: 6px;
			margin-top: 6px;
			font-size: 11.5px;
			color: var(--text-muted);
		}

		.repo-root-path {
			font-size: 10.5px;
			color: var(--text-muted);
			font-family: var(--vscode-editor-font-family, monospace);
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
			margin-top: 3px;
			opacity: 0.85;
		}

		.repo-action-row {
			margin-top: 10px;
			display: flex;
			flex-wrap: wrap;
			gap: 6px;
			padding-top: 8px;
			border-top: 1px solid var(--border-color);
		}

		.repo-action-btn {
			background: rgba(255, 255, 255, 0.08);
			border: 1px solid var(--border-color);
			color: #ffffff;
			border-radius: 5px;
			padding: 4px 9px;
			font-size: 11px;
			font-weight: 500;
			cursor: pointer;
			display: inline-flex;
			align-items: center;
			gap: 5px;
			transition: background-color 0.15s ease, border-color 0.15s ease;
		}

		.repo-action-btn:hover {
			background: rgba(255, 255, 255, 0.15);
			border-color: var(--accent-blue);
		}

		.repo-action-btn.primary {
			background: var(--accent-blue);
			border-color: var(--accent-blue);
			color: #ffffff;
		}

		.repo-action-btn.primary:hover {
			background: #4094ff;
		}

		.status-dot {
			width: 7px;
			height: 7px;
			border-radius: 50%;
			background-color: var(--accent-green);
			box-shadow: 0 0 6px rgba(63, 185, 80, 0.4);
			flex-shrink: 0;
		}

		.status-dot.loading {
			background-color: var(--accent-blue);
			box-shadow: 0 0 6px rgba(88, 166, 255, 0.5);
			animation: dotPulse 1.2s infinite ease-in-out;
		}

		.status-dot.warning {
			background-color: var(--accent-amber);
			box-shadow: 0 0 6px rgba(210, 153, 34, 0.4);
		}

		.status-dot.error {
			background-color: #f85149;
			box-shadow: 0 0 6px rgba(248, 81, 73, 0.5);
		}

		@keyframes dotPulse {
			0%, 100% { opacity: 0.35; transform: scale(0.9); }
			50% { opacity: 1; transform: scale(1.15); }
		}

		.repo-switch-btn {
			background: rgba(88, 166, 255, 0.15);
			color: var(--accent-blue);
			border: 1px solid rgba(88, 166, 255, 0.3);
			border-radius: 4px;
			padding: 2px 7px;
			font-size: 10px;
			font-weight: 500;
			cursor: pointer;
			display: inline-flex;
			align-items: center;
			gap: 4px;
			transition: all 0.15s ease;
		}

		.repo-switch-btn:hover {
			background: rgba(88, 166, 255, 0.25);
			border-color: var(--accent-blue);
		}

		.repo-refresh-btn {
			position: absolute;
			right: 10px;
			top: 10px;
			background: transparent;
			border: none;
			color: var(--text-muted);
			cursor: pointer;
			border-radius: 4px;
			padding: 4px;
			display: flex;
			align-items: center;
			justify-content: center;
			transition: color 0.15s ease, background-color 0.15s ease;
		}

		.repo-refresh-btn:hover {
			color: #ffffff;
			background: rgba(255, 255, 255, 0.1);
		}

		/* 2x2 Quick Actions Grid */
		.quick-actions-grid {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 8px;
			margin-top: 4px;
		}

		.action-card {
			background: var(--card-bg);
			border: 1px solid var(--border-color);
			border-radius: 8px;
			padding: 12px 10px;
			cursor: pointer;
			text-align: left;
			display: flex;
			flex-direction: column;
			gap: 5px;
			transition: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1),
						background-color 0.15s ease,
						border-color 0.15s ease;
		}

		.action-card:hover {
			background: var(--card-hover-bg);
			border-color: var(--border-hover-color);
			transform: translateY(-1px);
		}

		.action-card:active {
			background: var(--card-active-bg);
			transform: translateY(0);
		}

		.action-card .card-icon {
			width: 20px;
			height: 20px;
			display: flex;
			align-items: center;
			justify-content: center;
			color: #9bb7d4;
			margin-bottom: 2px;
		}

		.action-card .card-title {
			font-size: 13px;
			font-weight: 600;
			color: #ffffff;
		}

		.action-card .card-subtitle {
			font-size: 11px;
			color: var(--text-muted);
			line-height: 1.25;
		}

		/* Code Review Active Panel */
		.code-review-panel {
			background: var(--card-bg);
			border: 1px solid var(--border-color);
			border-radius: 8px;
			padding: 12px;
			margin-top: 10px;
			margin-bottom: 8px;
			display: flex;
			flex-direction: column;
			gap: 9px;
			animation: fadeIn 0.2s ease;
		}

		@keyframes fadeIn {
			from { opacity: 0; transform: translateY(-4px); }
			to { opacity: 1; transform: translateY(0); }
		}

		.review-header-row {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 8px;
		}

		.review-header-title {
			font-size: 13px;
			font-weight: 600;
			color: #ffffff;
			display: flex;
			align-items: center;
			gap: 6px;
		}

		.review-target-badge {
			font-size: 10.5px;
			font-weight: 500;
			padding: 2px 6px;
			border-radius: 4px;
			background: rgba(88, 166, 255, 0.15);
			color: var(--accent-blue);
			border: 1px solid rgba(88, 166, 255, 0.3);
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
			max-width: 140px;
		}

		.review-dismiss-btn {
			background: transparent;
			border: none;
			color: var(--text-muted);
			cursor: pointer;
			padding: 2px 4px;
			border-radius: 4px;
			font-size: 11px;
		}
		.review-dismiss-btn:hover {
			color: #ffffff;
			background: rgba(255, 255, 255, 0.1);
		}

		/* Severity count pills */
		.severity-counts {
			display: flex;
			gap: 5px;
			flex-wrap: wrap;
		}

		.severity-pill {
			font-size: 10.5px;
			font-weight: 600;
			padding: 2px 7px;
			border-radius: 12px;
			display: inline-flex;
			align-items: center;
			gap: 4px;
		}

		.severity-pill.critical {
			background: rgba(248, 81, 73, 0.15);
			color: #ff7b72;
			border: 1px solid rgba(248, 81, 73, 0.35);
		}

		.severity-pill.high {
			background: rgba(240, 136, 62, 0.15);
			color: #f0883e;
			border: 1px solid rgba(240, 136, 62, 0.35);
		}

		.severity-pill.medium {
			background: rgba(227, 179, 65, 0.15);
			color: #e3b341;
			border: 1px solid rgba(227, 179, 65, 0.35);
		}

		.severity-pill.low {
			background: rgba(63, 185, 80, 0.15);
			color: #7ee787;
			border: 1px solid rgba(63, 185, 80, 0.35);
		}

		.review-summary-text {
			font-size: 11.5px;
			color: var(--text-muted);
			line-height: 1.4;
			background: rgba(0, 0, 0, 0.2);
			padding: 8px 10px;
			border-radius: 6px;
			border-left: 3px solid var(--accent-blue);
		}

		/* Finding Cards */
		.findings-list {
			display: flex;
			flex-direction: column;
			gap: 6px;
			max-height: 380px;
			overflow-y: auto;
			padding-right: 2px;
		}

		.finding-card {
			background: rgba(255, 255, 255, 0.02);
			border: 1px solid var(--border-color);
			border-radius: 6px;
			overflow: hidden;
			transition: border-color 0.15s ease;
		}

		.finding-card:hover {
			border-color: var(--border-hover-color);
		}

		.finding-header {
			padding: 8px 10px;
			cursor: pointer;
			display: flex;
			flex-direction: column;
			gap: 4px;
		}

		.finding-title-row {
			display: flex;
			align-items: flex-start;
			justify-content: space-between;
			gap: 6px;
		}

		.finding-title {
			font-size: 12px;
			font-weight: 600;
			color: #ffffff;
			line-height: 1.3;
		}

		.finding-meta {
			display: flex;
			align-items: center;
			gap: 6px;
			font-size: 10.5px;
			color: var(--text-muted);
		}

		.finding-file-link {
			color: var(--accent-blue);
			text-decoration: none;
			cursor: pointer;
			display: inline-flex;
			align-items: center;
			gap: 3px;
		}

		.finding-file-link:hover {
			text-decoration: underline;
		}

		.finding-details {
			display: none;
			padding: 8px 10px;
			border-top: 1px solid var(--border-color);
			background: rgba(0, 0, 0, 0.15);
			font-size: 11px;
			line-height: 1.4;
			color: #c9d1d9;
		}

		.finding-card.open .finding-details {
			display: block;
		}

		.finding-detail-section {
			margin-bottom: 6px;
		}

		.finding-detail-label {
			font-size: 10px;
			font-weight: 600;
			text-transform: uppercase;
			color: var(--text-muted);
			margin-bottom: 2px;
		}

		.finding-code-block {
			background: rgba(0, 0, 0, 0.4);
			border: 1px solid var(--border-color);
			border-radius: 4px;
			padding: 6px 8px;
			font-family: var(--vscode-editor-font-family, monospace);
			font-size: 11px;
			color: #7ee787;
			overflow-x: auto;
			white-space: pre-wrap;
			word-break: break-all;
			margin-top: 4px;
		}

		/* Review Footer Buttons */
		.review-actions-row {
			display: flex;
			gap: 6px;
			margin-top: 4px;
		}

		.review-btn {
			flex: 1;
			background: rgba(255, 255, 255, 0.06);
			border: 1px solid var(--border-color);
			color: #ffffff;
			padding: 6px 10px;
			border-radius: 6px;
			font-size: 11px;
			font-weight: 500;
			cursor: pointer;
			display: inline-flex;
			align-items: center;
			justify-content: center;
			gap: 5px;
			transition: background-color 0.15s ease, border-color 0.15s ease;
		}

		.review-btn:hover {
			background: rgba(255, 255, 255, 0.12);
			border-color: var(--border-hover-color);
		}

		.review-btn.primary {
			background: var(--vscode-button-background, #238636);
			color: var(--vscode-button-foreground, #ffffff);
			border: none;
		}

		.review-btn.primary:hover {
			background: var(--vscode-button-hoverBackground, #2ea043);
		}

		/* Spinner */
		.spinner {
			width: 14px;
			height: 14px;
			border: 2px solid rgba(88, 166, 255, 0.3);
			border-top-color: var(--accent-blue);
			border-radius: 50%;
			animation: spin 0.8s linear infinite;
		}

		@keyframes spin {
			to { transform: rotate(360deg); }
		}

		/* All Tools List */
		.tools-list {
			display: flex;
			flex-direction: column;
			gap: 6px;
			margin-top: 4px;
		}

		.tool-accordion {
			border: 1px solid var(--border-color);
			border-radius: 8px;
			background: var(--card-bg);
			overflow: hidden;
			transition: border-color 0.15s ease;
		}

		.tool-accordion:hover {
			border-color: var(--border-hover-color);
		}

		.tool-header {
			display: flex;
			align-items: center;
			padding: 10px 12px;
			cursor: pointer;
			gap: 10px;
			background: transparent;
			transition: background-color 0.15s ease;
		}

		.tool-header:hover {
			background: var(--card-hover-bg);
		}

		.tool-header .tool-icon {
			color: var(--text-muted);
			display: flex;
			align-items: center;
			justify-content: center;
			flex-shrink: 0;
		}

		.tool-info {
			flex: 1;
			min-width: 0;
		}

		.tool-title {
			font-size: 13px;
			font-weight: 600;
			color: #ffffff;
		}

		.tool-desc {
			font-size: 11px;
			color: var(--text-muted);
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
			margin-top: 1px;
		}

		.tool-chevron {
			color: var(--text-muted);
			transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
			display: flex;
			align-items: center;
			justify-content: center;
		}

		.tool-accordion.open .tool-chevron {
			transform: rotate(90deg);
		}

		/* Accordion Subitems */
		.tool-content {
			display: none;
			border-top: 1px solid var(--border-color);
			background: rgba(0, 0, 0, 0.15);
			padding: 6px 8px;
			flex-direction: column;
			gap: 3px;
		}

		.tool-accordion.open .tool-content {
			display: flex;
		}

		.sub-item-btn {
			display: flex;
			align-items: center;
			gap: 9px;
			padding: 7px 10px;
			background: transparent;
			border: none;
			border-radius: 6px;
			color: var(--text-primary);
			font-size: 12px;
			text-align: left;
			cursor: pointer;
			width: 100%;
			transition: background-color 0.12s ease, color 0.12s ease;
		}

		.sub-item-btn svg {
			flex-shrink: 0;
			color: var(--text-muted);
		}

		.sub-item-btn:hover {
			background: var(--card-hover-bg);
			color: #ffffff;
		}

		.sub-item-btn:hover svg {
			color: var(--accent-blue);
		}

		.sub-item-btn:active {
			background: var(--card-active-bg);
		}

		/* Bottom Preview Note */
		.footer-note {
			margin-top: 22px;
			text-align: center;
			font-size: 10.5px;
			color: rgba(255, 255, 255, 0.35);
			letter-spacing: 0.2px;
		}
	</style>
</head>
<body>
	<!-- Current Repository Card -->
	<div class="section-header">
		<span>CURRENT REPOSITORY</span>
		<button class="repo-switch-btn" id="switchRepoBtn" title="Switch active Git repository" style="${initial.showSwitchBtn ? 'display: inline-flex;' : 'display: none;'}">
			<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M7 16V4M7 4L3 8M7 4L11 8M17 8V20M17 20L21 16M17 20L13 16"/>
			</svg>
			<span id="repoCountText">${initial.switchCount > 1 ? `Switch (${initial.switchCount})` : 'Switch'}</span>
		</button>
	</div>
	<div class="repo-card" id="repoCard">
		<button class="repo-refresh-btn" id="refreshBtn" title="Refresh Repository Status">
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
			</svg>
		</button>
		<div class="repo-title-row">
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<line x1="6" y1="3" x2="6" y2="15"></line>
				<circle cx="18" cy="6" r="3"></circle>
				<circle cx="6" cy="18" r="3"></circle>
				<path d="M18 9a9 9 0 0 1-9 9"></path>
			</svg>
			<span id="repoName">${escapeHtmlServer(initial.repoName)}</span>
		</div>
		<div class="repo-root-path" id="repoRootPath" style="${initial.rootPath ? 'display: block;' : 'display: none;'}">${escapeHtmlServer(initial.rootPath || '')}</div>
		<div class="repo-status-row">
			<div class="${initial.statusDotClass}" id="statusDot"></div>
			<span id="statusText">${escapeHtmlServer(initial.statusText)}</span>
		</div>
		<div class="repo-action-row" id="repoActionRow" style="${initial.actionRowHtml ? 'display: flex;' : 'display: none;'}">${initial.actionRowHtml || ''}</div>
	</div>

	<!-- Quick Actions Grid -->
	<div class="section-header with-margin">
		<span>QUICK ACTIONS</span>
	</div>
	<div class="quick-actions-grid">
		<!-- AI Commit -->
		<div class="action-card" data-cmd="${COMMAND_IDS.generateCommitMessage}">
			<div class="card-icon">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<circle cx="12" cy="12" r="4"></circle>
					<line x1="1.05" y1="12" x2="8" y2="12"></line>
					<line x1="16" y1="12" x2="22.95" y2="12"></line>
				</svg>
			</div>
			<div class="card-title">AI Commit</div>
			<div class="card-subtitle">Generate a message</div>
		</div>

		<!-- Code Review -->
		<div class="action-card" data-cmd="${COMMAND_IDS.aiCodeReview}">
			<div class="card-icon">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
					<polyline points="9 12 11 14 15 10"></polyline>
				</svg>
			</div>
			<div class="card-title">Code Review</div>
			<div class="card-subtitle">Review your changes</div>
		</div>

		<!-- Create PR -->
		<div class="action-card" data-cmd="${COMMAND_IDS.generatePullRequest}">
			<div class="card-icon">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<circle cx="18" cy="18" r="3"></circle>
					<circle cx="6" cy="6" r="3"></circle>
					<path d="M13 6h3a2 2 0 0 1 2 2v7"></path>
					<line x1="6" y1="9" x2="6" y2="21"></line>
				</svg>
			</div>
			<div class="card-title">Create PR</div>
			<div class="card-subtitle">Prepare a pull request</div>
		</div>

		<!-- History -->
		<div class="action-card" data-cmd="${COMMAND_IDS.viewCommitHistory}">
			<div class="card-icon">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<circle cx="12" cy="12" r="10"></circle>
					<polyline points="12 6 12 12 16 14"></polyline>
				</svg>
			</div>
			<div class="card-title">History</div>
			<div class="card-subtitle">Explore commits</div>
		</div>
	</div>

	<!-- AI Code Review Active Panel -->
	<div id="codeReviewPanel" class="code-review-panel" style="display: none;"></div>

	<!-- All Tools Section -->
	<div class="section-header with-margin">
		<span>ALL TOOLS</span>
	</div>
	<div class="tools-list">
		<!-- Git & GitHub -->
		<div class="tool-accordion" id="accordion-git">
			<div class="tool-header">
				<div class="tool-icon">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<line x1="6" y1="3" x2="6" y2="15"></line>
						<circle cx="18" cy="6" r="3"></circle>
						<circle cx="6" cy="18" r="3"></circle>
						<path d="M18 9a9 9 0 0 1-9 9"></path>
					</svg>
				</div>
				<div class="tool-info">
					<div class="tool-title">Git & GitHub</div>
					<div class="tool-desc">Branch, push, pull and repository tools</div>
				</div>
				<div class="tool-chevron">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<polyline points="9 18 15 12 9 6"></polyline>
					</svg>
				</div>
			</div>
			<div class="tool-content">
				<button class="sub-item-btn" data-cmd="${COMMAND_IDS.push}">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
					Push Branch
				</button>
				<button class="sub-item-btn" data-cmd="${COMMAND_IDS.pull}">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
					Pull Branch
				</button>
				<button class="sub-item-btn" data-cmd="${COMMAND_IDS.fetch}">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>
					Fetch Updates
				</button>
				<button class="sub-item-btn" data-cmd="${COMMAND_IDS.previewGitDiff}">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
					Preview Staged Diff
				</button>
				<button class="sub-item-btn" data-cmd="${COMMAND_IDS.currentBranch}">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>
					Show Current Branch
				</button>
				<button class="sub-item-btn" data-cmd="${COMMAND_IDS.repositoryInfo}">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
					Repository Information
				</button>
				<button class="sub-item-btn" data-cmd="${COMMAND_IDS.openRepository}">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
					Open GitHub Repository
				</button>
				<button class="sub-item-btn" data-cmd="${COMMAND_IDS.openBranch}">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
					Open Branch on GitHub
				</button>
			</div>
		</div>

		<!-- Pull Requests -->
		<div class="tool-accordion" id="accordion-pr">
			<div class="tool-header">
				<div class="tool-icon">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="18" cy="18" r="3"></circle>
						<circle cx="6" cy="6" r="3"></circle>
						<path d="M13 6h3a2 2 0 0 1 2 2v7"></path>
						<line x1="6" y1="9" x2="6" y2="21"></line>
					</svg>
				</div>
				<div class="tool-info">
					<div class="tool-title">Pull Requests</div>
					<div class="tool-desc">Generate, copy and save PRs</div>
				</div>
				<div class="tool-chevron">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<polyline points="9 18 15 12 9 6"></polyline>
					</svg>
				</div>
			</div>
			<div class="tool-content">
				<button class="sub-item-btn" data-cmd="${COMMAND_IDS.generatePullRequest}">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
					Generate Pull Request
				</button>
				<button class="sub-item-btn" data-cmd="${COMMAND_IDS.copyPRTitle}">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
					Copy PR Title
				</button>
				<button class="sub-item-btn" data-cmd="${COMMAND_IDS.copyPRDescription}">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
					Copy PR Description
				</button>
				<button class="sub-item-btn" data-cmd="${COMMAND_IDS.copyEntirePullRequest}">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
					Copy Entire Pull Request
				</button>
				<button class="sub-item-btn" data-cmd="${COMMAND_IDS.savePullRequest}">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
					Save Pull Request (pull-request.md)
				</button>
				<button class="sub-item-btn" data-cmd="${COMMAND_IDS.openPullRequestPage}">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
					Open Compare Page on GitHub
				</button>
			</div>
		</div>

		<!-- Commit Analytics -->
		<div class="tool-accordion" id="accordion-analytics">
			<div class="tool-header">
				<div class="tool-icon">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<line x1="18" y1="20" x2="18" y2="10"></line>
						<line x1="12" y1="20" x2="12" y2="4"></line>
						<line x1="6" y1="20" x2="6" y2="14"></line>
					</svg>
				</div>
				<div class="tool-info">
					<div class="tool-title">Commit Analytics</div>
					<div class="tool-desc">Statistics, activity and contributors</div>
				</div>
				<div class="tool-chevron">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<polyline points="9 18 15 12 9 6"></polyline>
					</svg>
				</div>
			</div>
			<div class="tool-content">
				<button class="sub-item-btn" data-cmd="${COMMAND_IDS.searchCommitHistory}">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
					Search Commit History
				</button>
				<button class="sub-item-btn" data-cmd="${COMMAND_IDS.commitStatistics}">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>
					Commit Statistics
				</button>
				<button class="sub-item-btn" data-cmd="${COMMAND_IDS.topContributors}">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
					Top Contributors
				</button>
				<button class="sub-item-btn" data-cmd="${COMMAND_IDS.commitActivity}">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
					Commit Activity (7 Days)
				</button>
				<button class="sub-item-btn" data-cmd="${COMMAND_IDS.exportHistoryReport}">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
					Export History Report
				</button>
			</div>
		</div>

		<!-- AI Settings -->
		<div class="tool-accordion" id="accordion-settings">
			<div class="tool-header">
				<div class="tool-icon">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<line x1="4" y1="21" x2="4" y2="14"></line>
						<line x1="4" y1="10" x2="4" y2="3"></line>
						<line x1="12" y1="21" x2="12" y2="12"></line>
						<line x1="12" y1="8" x2="12" y2="3"></line>
						<line x1="20" y1="21" x2="20" y2="16"></line>
						<line x1="20" y1="12" x2="20" y2="3"></line>
						<line x1="1" y1="14" x2="7" y2="14"></line>
						<line x1="9" y1="8" x2="15" y2="8"></line>
						<line x1="17" y1="16" x2="23" y2="16"></line>
					</svg>
				</div>
				<div class="tool-info">
					<div class="tool-title">AI Settings</div>
					<div class="tool-desc" id="settingsDesc">Provider, model and API key</div>
				</div>
				<div class="tool-chevron">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<polyline points="9 18 15 12 9 6"></polyline>
					</svg>
				</div>
			</div>
			<div class="tool-content">
				<button class="sub-item-btn" data-cmd="${COMMAND_IDS.selectProvider}">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
					Switch AI Provider
				</button>
				<button class="sub-item-btn" data-cmd="${COMMAND_IDS.setApiKey}">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2l-2 2m-1.5 1.5L16 7l-4 4-2-2-4 4 4 4 2-2 4-4 1.5-1.5z"/></svg>
					Set Groq API Key
				</button>
				<button class="sub-item-btn" data-cmd="${COMMAND_IDS.setGeminiApiKey}">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
					Set Gemini API Key
				</button>
				<button class="sub-item-btn" data-cmd="${COMMAND_IDS.selectModel}">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="15" x2="23" y2="15"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="15" x2="4" y2="15"/></svg>
					Select Model
				</button>
				<button class="sub-item-btn" data-cmd="${COMMAND_IDS.removeApiKey}">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
					Remove Stored API Key
				</button>
			</div>
		</div>
	</div>

	<div class="footer-note">GitIQ • AI-Powered Git Assistant</div>

	<script nonce="${nonce}">
		var vscode;
		try {
			vscode = acquireVsCodeApi();
			console.log('[GitIQ Webview] VS Code API acquired successfully');
		} catch (err) {
			console.error('[GitIQ Webview] Failed to acquire VS Code API:', err);
		}

		function postMsg(data) {
			if (vscode && typeof vscode.postMessage === 'function') {
				try {
					vscode.postMessage(data);
				} catch (err) {
					console.error('[GitIQ Webview] Failed to post message:', err);
				}
			} else {
				console.warn('[GitIQ Webview] vscode.postMessage is not available');
			}
		}

		var detectingWatchdog = null;

		function clearWatchdog() {
			if (detectingWatchdog) {
				clearTimeout(detectingWatchdog);
				detectingWatchdog = null;
			}
		}

		function startWatchdog() {
			clearWatchdog();
			detectingWatchdog = setTimeout(function() {
				var statusDotEl = document.getElementById('statusDot');
				var statusTextEl = document.getElementById('statusText');
				var actionRow = document.getElementById('repoActionRow');
				if (statusTextEl && statusTextEl.textContent === 'Detecting repository...') {
					statusDotEl.className = 'status-dot warning';
					statusTextEl.textContent = 'Detection is taking longer than expected';
					if (actionRow) {
						actionRow.style.display = 'flex';
						actionRow.innerHTML =
							'<button class="repo-action-btn primary" data-action="retryDetection">' +
								'↻ Retry Detection' +
							'</button>' +
							'<button class="repo-action-btn" data-action="openFolder">' +
								'Open Folder' +
							'</button>';
					}
				}
			}, 7000);
		}

		function retryDetection() {
			var statusDotEl = document.getElementById('statusDot');
			var statusTextEl = document.getElementById('statusText');
			var actionRow = document.getElementById('repoActionRow');
			var repoRootPathEl = document.getElementById('repoRootPath');
			if (statusDotEl) statusDotEl.className = 'status-dot loading';
			if (statusTextEl) statusTextEl.textContent = 'Detecting repository...';
			if (actionRow) {
				actionRow.style.display = 'none';
				actionRow.innerHTML = '';
			}
			if (repoRootPathEl) repoRootPathEl.style.display = 'none';
			startWatchdog();
			postMsg({ command: 'refresh' });
		}

		function openFolder() {
			postMsg({ command: 'openFolder' });
		}

		function initGit() {
			var statusDotEl = document.getElementById('statusDot');
			var statusTextEl = document.getElementById('statusText');
			if (statusDotEl) statusDotEl.className = 'status-dot loading';
			if (statusTextEl) statusTextEl.textContent = 'Initializing Git repository...';
			postMsg({ command: 'initGit' });
		}

		function toggleAccordion(id) {
			const el = document.getElementById(id);
			if (el) {
				el.classList.toggle('open');
			}
		}

		// Helper to find closest element matching a selector or attribute
		function findClosest(el, selector) {
			if (!el) return null;
			if (typeof el.closest === 'function') {
				try {
					var match = el.closest(selector);
					if (match) return match;
				} catch (_) {}
			}
			var curr = el;
			while (curr && curr !== document && curr.nodeType === 1) {
				if (curr.matches && curr.matches(selector)) {
					return curr;
				}
				curr = curr.parentElement;
			}
			return null;
		}

		// Unified event delegation on document handles all clicks reliably without inline onclick
		document.addEventListener('click', function(e) {
			try {
				if (!e.target) return;

				// 1. Tool accordion toggle
				var header = findClosest(e.target, '.tool-header');
				if (header) {
					var accordion = findClosest(header, '.tool-accordion');
					if (accordion) {
						accordion.classList.toggle('open');
					}
					return;
				}

				// 2. Action cards and sub-item buttons with data-cmd
				var cmdBtn = findClosest(e.target, '[data-cmd]');
				if (cmdBtn) {
					var cmd = cmdBtn.getAttribute('data-cmd');
					if (cmd) {
						console.log('[GitIQ Webview] Invoking command from UI:', cmd);
						postMsg({ command: cmd });
					}
					return;
				}

				// 3. Actions with data-action attribute
				var actionBtn = findClosest(e.target, '[data-action]');
				if (actionBtn) {
					var action = actionBtn.getAttribute('data-action');
					if (action === 'openFolder') openFolder();
					else if (action === 'initGit') initGit();
					else if (action === 'retryDetection') retryDetection();
					else if (action === 'selectRepo') postMsg({ command: 'selectRepo' });
					else if (action === 'dismissReview') dismissReview();
					else if (action === 'reviewAgain') runReviewAgain();
					else if (action === 'openReport') openReport();
					return;
				}

				// 4. Code review finding toggle
				var findingHeader = findClosest(e.target, '.finding-header');
				if (findingHeader) {
					var card = findClosest(findingHeader, '.finding-card');
					if (card) card.classList.toggle('open');
					return;
				}

				// 5. Code review file link
				var fileLink = findClosest(e.target, '.finding-file-link');
				if (fileLink) {
					var file = fileLink.getAttribute('data-file');
					var line = parseInt(fileLink.getAttribute('data-line') || '1', 10);
					postMsg({ command: 'openFileAtLine', file: file, line: line });
					return;
				}

				// 6. Refresh button
				var refreshBtn = findClosest(e.target, '#refreshBtn');
				if (refreshBtn) {
					retryDetection();
					return;
				}

				// 7. Switch repo button
				var switchBtn = findClosest(e.target, '#switchRepoBtn');
				if (switchBtn) {
					postMsg({ command: 'selectRepo' });
					return;
				}
			} catch (err) {
				console.error('[GitIQ Webview] Click handling error:', err);
			}
		});

		window.toggleAccordion = toggleAccordion;
		window.retryDetection = retryDetection;
		window.openFolder = openFolder;
		window.initGit = initGit;

		// Handle updates from extension host - registered FIRST before webviewReady handshake
		window.addEventListener('message', (event) => {
			const msg = event.data;
			if (msg && msg.type === 'updateRepoState' && msg.state) {
				const state = msg.state;
				const repoNameEl = document.getElementById('repoName');
				const statusDotEl = document.getElementById('statusDot');
				const statusTextEl = document.getElementById('statusText');
				const repoRootPathEl = document.getElementById('repoRootPath');
				const repoActionRowEl = document.getElementById('repoActionRow');
				const switchBtn = document.getElementById('switchRepoBtn');
				const repoCountText = document.getElementById('repoCountText');

				if (state.totalReposCount > 1 && switchBtn) {
					switchBtn.style.display = 'inline-flex';
					if (repoCountText) {
						repoCountText.textContent = 'Switch (' + state.totalReposCount + ')';
					}
				} else if (switchBtn) {
					switchBtn.style.display = 'none';
				}

				if (state.status === 'detecting') {
					startWatchdog();
					repoNameEl.textContent = state.repoName || 'Detecting...';
					statusDotEl.className = 'status-dot loading';
					statusTextEl.textContent = 'Detecting repository...';
					if (repoRootPathEl) repoRootPathEl.style.display = 'none';
					if (repoActionRowEl) {
						repoActionRowEl.style.display = 'none';
						repoActionRowEl.innerHTML = '';
					}
				} else if (state.status === 'detected') {
					clearWatchdog();
					repoNameEl.textContent = state.repoName;
					statusDotEl.className = 'status-dot';
					var branchText = state.branch || 'HEAD';
					var summary = state.statusSummary ? ' • ' + state.statusSummary : '';
					statusTextEl.textContent = branchText + summary;
					if (repoRootPathEl && state.rootPath) {
						repoRootPathEl.style.display = 'block';
						repoRootPathEl.textContent = state.rootPath;
						repoRootPathEl.title = state.rootPath;
					} else if (repoRootPathEl) {
						repoRootPathEl.style.display = 'none';
					}
					if (repoActionRowEl) {
						repoActionRowEl.style.display = 'none';
						repoActionRowEl.innerHTML = '';
					}
				} else if (state.status === 'no-repo') {
					clearWatchdog();
					repoNameEl.textContent = state.hasWorkspace ? 'No Git Repository' : 'No Workspace Open';
					statusDotEl.className = 'status-dot warning';
					statusTextEl.textContent = state.hasWorkspace
						? 'No Git repository found in workspace'
						: 'Open a folder to start working with Git';
					if (repoRootPathEl) repoRootPathEl.style.display = 'none';
					if (repoActionRowEl) {
						repoActionRowEl.style.display = 'flex';
						if (state.hasWorkspace) {
							repoActionRowEl.innerHTML =
								'<button class="repo-action-btn primary" data-action="initGit">' +
									'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg> Initialize Repository' +
								'</button>' +
								'<button class="repo-action-btn" data-action="openFolder">' +
									'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg> Open Folder' +
								'</button>';
						} else {
							repoActionRowEl.innerHTML =
								'<button class="repo-action-btn primary" data-action="openFolder">' +
									'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg> Open Folder' +
								'</button>';
						}
					}
				} else if (state.status === 'git-unavailable') {
					clearWatchdog();
					repoNameEl.textContent = 'Git Unavailable';
					statusDotEl.className = 'status-dot warning';
					statusTextEl.textContent = state.errorMessage || 'Git CLI or VS Code Git extension is unavailable.';
					if (repoRootPathEl) repoRootPathEl.style.display = 'none';
					if (repoActionRowEl) {
						repoActionRowEl.style.display = 'flex';
						repoActionRowEl.innerHTML =
							'<button class="repo-action-btn primary" data-action="retryDetection">' +
								'↻ Retry Detection' +
							'</button>';
					}
				} else if (state.status === 'detection-failed') {
					clearWatchdog();
					repoNameEl.textContent = 'Detection Error';
					statusDotEl.className = 'status-dot error';
					statusTextEl.textContent = state.errorMessage || 'Repository detection failed.';
					if (repoRootPathEl) repoRootPathEl.style.display = 'none';
					if (repoActionRowEl) {
						repoActionRowEl.style.display = 'flex';
						repoActionRowEl.innerHTML =
							'<button class="repo-action-btn primary" data-action="retryDetection">' +
								'↻ Retry Detection' +
							'</button>';
					}
				} else if (state.isGitRepo) {
					clearWatchdog();
					repoNameEl.textContent = state.repoName;
					statusDotEl.className = 'status-dot';
					statusTextEl.textContent = 'Repository detected (' + state.branch + ')';
					if (repoRootPathEl && state.rootPath) {
						repoRootPathEl.style.display = 'block';
						repoRootPathEl.textContent = state.rootPath;
					}
					if (repoActionRowEl) repoActionRowEl.style.display = 'none';
				} else if (state.hasWorkspace) {
					clearWatchdog();
					repoNameEl.textContent = state.repoName;
					statusDotEl.className = 'status-dot warning';
					statusTextEl.textContent = 'Not a Git repository';
					if (repoRootPathEl) repoRootPathEl.style.display = 'none';
					if (repoActionRowEl) {
						repoActionRowEl.style.display = 'flex';
						repoActionRowEl.innerHTML =
							'<button class="repo-action-btn primary" data-action="initGit">Initialize Repository</button>' +
							'<button class="repo-action-btn" data-action="openFolder">Open Folder</button>';
					}
				} else {
					clearWatchdog();
					repoNameEl.textContent = 'No Workspace';
					statusDotEl.className = 'status-dot warning';
					statusTextEl.textContent = 'Open a folder to start';
					if (repoRootPathEl) repoRootPathEl.style.display = 'none';
					if (repoActionRowEl) {
						repoActionRowEl.style.display = 'flex';
						repoActionRowEl.innerHTML =
							'<button class="repo-action-btn primary" data-action="openFolder">Open Folder</button>';
					}
				}

				if (state.activeProvider) {
					const descEl = document.getElementById('settingsDesc');
					if (descEl) {
						descEl.textContent = 'Active: ' + state.activeProvider.toUpperCase();
					}
				}
			} else if (msg && msg.type === 'codeReviewState' && msg.state) {
				renderCodeReviewState(msg.state);
			}
		});

		// Handshake: Notify extension host AFTER listener is registered
		startWatchdog();
		console.log('[GitIQ Webview] Sending webviewReady handshake');
		postMsg({ command: 'webviewReady' });

		function renderCodeReviewState(state) {
			var panel = document.getElementById('codeReviewPanel');
			if (!panel) return;

			if (state.status === 'loading') {
				panel.style.display = 'flex';
				panel.innerHTML =
					'<div class="review-header-row">' +
						'<div class="review-header-title">' +
							'<div class="spinner"></div> AI Code Review' +
						'</div>' +
						'<div class="review-target-badge">' + escapeHtml(state.targetLabel || 'Analyzing...') + '</div>' +
					'</div>' +
					'<div class="review-summary-text">' +
						'Inspecting diff changes for security, bugs, logic, and performance issues...' +
					'</div>';
			} else if (state.status === 'success' && state.result) {
				var r = state.result;
				var sum = r.summary;
				panel.style.display = 'flex';

				var findingsHtml = '';
				if (r.findings.length === 0) {
					findingsHtml =
						'<div style="padding: 12px; text-align: center; color: var(--accent-green); font-size: 12px;">' +
							'✓ No issues detected in ' + escapeHtml(sum.targetLabel) + '!' +
						'</div>';
				} else {
					findingsHtml = r.findings.map(function(f) {
						var sevClass = (f.severity || 'Medium').toLowerCase();
						var lineText = f.line ? (f.endLine && f.endLine !== f.line ? ':' + f.line + '-' + f.endLine : ':' + f.line) : '';
						var locText = escapeHtml(f.file) + lineText;

						var detailsHtml =
							'<div class="finding-detail-section">' +
								'<div class="finding-detail-label">Problem</div>' +
								'<div>' + escapeHtml(f.explanation) + '</div>' +
							'</div>' +
							'<div class="finding-detail-section">' +
								'<div class="finding-detail-label">Why it matters</div>' +
								'<div>' + escapeHtml(f.impact) + '</div>' +
							'</div>' +
							'<div class="finding-detail-section">' +
								'<div class="finding-detail-label">Recommended Fix</div>' +
								'<div>' + escapeHtml(f.recommendation) + '</div>' +
							'</div>';

						if (f.codeSuggestion) {
							detailsHtml +=
								'<div class="finding-detail-section">' +
									'<div class="finding-detail-label">Suggested Code</div>' +
									'<div class="finding-code-block">' + escapeHtml(f.codeSuggestion) + '</div>' +
								'</div>';
						}
						return (
							'<div class="finding-card" id="' + f.id + '">' +
								'<div class="finding-header">' +
									'<div class="finding-title-row">' +
										'<span class="finding-title">' + escapeHtml(f.title) + '</span>' +
										'<span class="severity-pill ' + sevClass + '">' + escapeHtml(f.severity) + '</span>' +
									'</div>' +
									'<div class="finding-meta">' +
										'<span class="finding-file-link" data-file="' + escapeHtml(f.file) + '" data-line="' + (f.line || 1) + '">' +
											'📄 ' + locText +
										'</span>' +
										'<span>•</span>' +
										'<span>' + escapeHtml(f.category) + '</span>' +
										(f.confidence === 'Uncertain' ? '<span>• <i>(Uncertain)</i></span>' : '') +
									'</div>' +
								'</div>' +
								'<div class="finding-details">' +
									detailsHtml +
								'</div>' +
							'</div>'
						);
					}).join('');
				}

				panel.innerHTML =
					'<div class="review-header-row">' +
						'<div class="review-header-title">' +
							'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>' +
							' Review Results' +
						'</div>' +
						'<div style="display: flex; align-items: center; gap: 6px;">' +
							'<div class="review-target-badge">' + escapeHtml(sum.targetLabel) + '</div>' +
							'<button class="review-dismiss-btn" data-action="dismissReview">✕</button>' +
						'</div>' +
					'</div>' +
					'<div class="severity-counts">' +
						'<span class="severity-pill critical">Critical: ' + sum.criticalCount + '</span>' +
						'<span class="severity-pill high">High: ' + sum.highCount + '</span>' +
						'<span class="severity-pill medium">Medium: ' + sum.mediumCount + '</span>' +
						'<span class="severity-pill low">Low: ' + sum.lowCount + '</span>' +
					'</div>' +
					'<div class="review-summary-text">' + escapeHtml(sum.overallSummary) + '</div>' +
					'<div class="findings-list">' +
						findingsHtml +
					'</div>' +
					'<div class="review-actions-row">' +
						'<button class="review-btn" data-action="reviewAgain">' +
							'↻ Re-run' +
						'</button>' +
						'<button class="review-btn primary" data-action="openReport">' +
							'Open Report' +
						'</button>' +
					'</div>';
			} else if (state.status === 'empty') {
				panel.style.display = 'flex';
				panel.innerHTML =
					'<div class="review-header-row">' +
						'<div class="review-header-title">AI Code Review</div>' +
						'<button class="review-dismiss-btn" data-action="dismissReview">✕</button>' +
					'</div>' +
					'<div class="review-summary-text">' +
						escapeHtml(state.message || 'No reviewable changes found in repository.') +
					'</div>' +
					'<div class="review-actions-row">' +
						'<button class="review-btn primary" data-action="reviewAgain">Check Again</button>' +
					'</div>';
			} else if (state.status === 'error') {
				panel.style.display = 'flex';
				panel.innerHTML =
					'<div class="review-header-row">' +
						'<div class="review-header-title" style="color: #ff7b72;">Review Failed</div>' +
						'<button class="review-dismiss-btn" data-action="dismissReview">✕</button>' +
					'</div>' +
					'<div class="review-summary-text" style="border-left-color: #ff7b72;">' +
						escapeHtml(state.error || 'Unknown error occurred.') +
					'</div>' +
					'<div class="review-actions-row">' +
						'<button class="review-btn primary" data-action="reviewAgain">Retry</button>' +
						'<button class="review-btn" data-action="dismissReview">Dismiss</button>' +
					'</div>';
			}
		}

		function toggleFinding(headerEl) {
			var card = headerEl ? headerEl.closest('.finding-card') : null;
			if (card) card.classList.toggle('open');
		}

		function openFile(e, linkEl) {
			e.stopPropagation();
			var file = linkEl.getAttribute('data-file');
			var line = parseInt(linkEl.getAttribute('data-line') || '1', 10);
			postMsg({ command: 'openFileAtLine', file: file, line: line });
		}

		function runReviewAgain() {
			postMsg({ command: '${COMMAND_IDS.aiCodeReview}' });
		}

		function openReport() {
			postMsg({ command: 'gitIQ.showCodeReviewReport' });
		}

		function dismissReview() {
			var panel = document.getElementById('codeReviewPanel');
			if (panel) panel.style.display = 'none';
		}

		window.toggleFinding = toggleFinding;
		window.openFile = openFile;
		window.runReviewAgain = runReviewAgain;
		window.openReport = openReport;
		window.dismissReview = dismissReview;

		function escapeHtml(text) {
			if (!text) return '';
			return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
		}

		function escapeJs(text) {
			if (!text) return '';
			return String(text).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
		}
	</script>
</body>
</html>`;
	}
}

function escapeHtmlServer(text: string): string {
	return String(text)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function getNonce(): string {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}
