import * as path from 'node:path';
import * as vscode from 'vscode';
import type { GitService } from '../services/gitService';
import type { LoggerService } from '../services/loggerService';
import type { SettingsService } from '../services/SettingsService';
import { COMMAND_IDS } from '../utils/constants';

interface RepoState {
	hasWorkspace: boolean;
	isGitRepo: boolean;
	repoName: string;
	branch: string;
	remoteUrl?: string;
	activeProvider?: string;
}

/**
 * WebviewViewProvider that renders the modern GitIQ dashboard in the Activity Bar sidebar.
 * Replicates the modern dark card-based dashboard layout:
 * - Current Repository status card with active repo name & branch
 * - 2x2 Quick Actions grid (AI Commit, Code Review, Create PR, History)
 * - Expandable All Tools section (Git & GitHub, Pull Requests, Commit Analytics, AI Settings)
 */
export class SidebarWebviewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'gitiq.sidebarView';

	private _view?: vscode.WebviewView;

	public constructor(
		private readonly extensionUri: vscode.Uri,
		private readonly gitService?: GitService,
		private readonly settingsService?: SettingsService,
		private readonly logger?: LoggerService
	) {}

	public resolveWebviewView(webviewView: vscode.WebviewView): void {
		this._view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this.extensionUri]
		};

		webviewView.webview.html = this.getHtmlForWebview();

		webviewView.webview.onDidReceiveMessage(async (data: { command: string; args?: unknown[] }) => {
			if (!data || !data.command) {
				return;
			}

			if (data.command === 'refresh') {
				await this.updateState();
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

		// Push initial state once webview is ready
		void this.updateState();
	}

	/**
	 * Computes the current repository state and pushes it to the Webview.
	 */
	public async updateState(): Promise<void> {
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
				remoteUrl
			};
		} catch {
			return {
				hasWorkspace: true,
				isGitRepo: false,
				repoName: folderName,
				branch: 'unknown'
			};
		}
	}

	private getHtmlForWebview(): string {
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
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

		.status-dot {
			width: 7px;
			height: 7px;
			border-radius: 50%;
			background-color: var(--accent-green);
			box-shadow: 0 0 6px rgba(63, 185, 80, 0.4);
			flex-shrink: 0;
		}

		.status-dot.warning {
			background-color: var(--accent-amber);
			box-shadow: 0 0 6px rgba(210, 153, 34, 0.4);
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
			<span id="repoName">Loading...</span>
		</div>
		<div class="repo-status-row">
			<div class="status-dot" id="statusDot"></div>
			<span id="statusText">Detecting repository...</span>
		</div>
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

	<!-- All Tools Section -->
	<div class="section-header with-margin">
		<span>ALL TOOLS</span>
	</div>
	<div class="tools-list">
		<!-- Git & GitHub -->
		<div class="tool-accordion" id="accordion-git">
			<div class="tool-header" onclick="toggleAccordion('accordion-git')">
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
			<div class="tool-header" onclick="toggleAccordion('accordion-pr')">
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
			<div class="tool-header" onclick="toggleAccordion('accordion-analytics')">
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
			<div class="tool-header" onclick="toggleAccordion('accordion-settings')">
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
					<div class="tool-desc">Provider, model and API key</div>
				</div>
				<div class="tool-chevron">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<polyline points="9 18 15 12 9 6"></polyline>
					</svg>
				</div>
			</div>
			<div class="tool-content">
				<button class="sub-item-btn" data-cmd="${COMMAND_IDS.setApiKey}">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2l-2 2m-1.5 1.5L16 7l-4 4-2-2-4 4 4 4 2-2 4-4 1.5-1.5z"/></svg>
					Set Groq API Key
				</button>
				<button class="sub-item-btn" data-cmd="${COMMAND_IDS.updateApiKey}">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>
					Update Groq API Key
				</button>
				<button class="sub-item-btn" data-cmd="${COMMAND_IDS.selectModel}">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="15" x2="23" y2="15"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="15" x2="4" y2="15"/></svg>
					Select Groq Model
				</button>
				<button class="sub-item-btn" data-cmd="${COMMAND_IDS.removeApiKey}">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
					Remove Groq API Key
				</button>
			</div>
		</div>
	</div>

	<div class="footer-note">GitIQ • AI-Powered Git Assistant</div>

	<script>
		const vscode = acquireVsCodeApi();

		// Attach action card clicks
		document.querySelectorAll('.action-card, .sub-item-btn').forEach(btn => {
			btn.addEventListener('click', (e) => {
				e.stopPropagation();
				const cmd = btn.getAttribute('data-cmd');
				if (cmd) {
					vscode.postMessage({ command: cmd });
				}
			});
		});

		// Refresh button
		document.getElementById('refreshBtn').addEventListener('click', (e) => {
			e.stopPropagation();
			vscode.postMessage({ command: 'refresh' });
		});

		// Toggle accordions
		function toggleAccordion(id) {
			const el = document.getElementById(id);
			if (el) {
				el.classList.toggle('open');
			}
		}

		// Handle updates from extension host
		window.addEventListener('message', (event) => {
			const msg = event.data;
			if (msg && msg.type === 'updateRepoState' && msg.state) {
				const state = msg.state;
				const repoNameEl = document.getElementById('repoName');
				const statusDotEl = document.getElementById('statusDot');
				const statusTextEl = document.getElementById('statusText');

				if (state.isGitRepo) {
					repoNameEl.textContent = state.repoName;
					statusDotEl.className = 'status-dot';
					statusTextEl.textContent = 'Repository detected (' + state.branch + ')';
				} else if (state.hasWorkspace) {
					repoNameEl.textContent = state.repoName;
					statusDotEl.className = 'status-dot warning';
					statusTextEl.textContent = 'Not a Git repository';
				} else {
					repoNameEl.textContent = 'No Workspace';
					statusDotEl.className = 'status-dot warning';
					statusTextEl.textContent = 'Open a folder to start';
				}
			}
		});
	</script>
</body>
</html>`;
	}
}
