import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { GitAPI, GitExtension, Repository } from '../types/vscodeGit';
import type { GitService } from './gitService';
import type { LoggerService } from './loggerService';

export type RepositoryDetectionStatus =
	| 'detecting'
	| 'detected'
	| 'no-repo'
	| 'git-unavailable'
	| 'detection-failed';

export interface DetectedRepoInfo {
	readonly id: string;
	readonly rootPath: string;
	readonly repoName: string;
	readonly branch: string;
	readonly remoteUrl?: string;
	readonly stagedCount: number;
	readonly uncommittedCount: number;
	readonly isClean: boolean;
	readonly isEmpty: boolean;
	readonly statusSummary: string;
}

export interface RepositoryDetectionState {
	readonly status: RepositoryDetectionStatus;
	readonly activeRepo?: DetectedRepoInfo;
	readonly allRepos: readonly DetectedRepoInfo[];
	readonly errorMessage?: string;
}

/**
 * Manages reliable Git repository discovery, lifecycle tracking, multi-root
 * workspace handling, and synchronization between VS Code Git extension API and GitIQ.
 */
export class RepositoryDetector implements vscode.Disposable {
	private readonly _disposables: vscode.Disposable[] = [];
	private readonly _repoDisposables = new Map<string, vscode.Disposable[]>();
	private readonly _stateEmitter = new vscode.EventEmitter<RepositoryDetectionState>();

	private _state: RepositoryDetectionState = {
		status: 'detecting',
		allRepos: []
	};

	private _selectedRepoId?: string;
	private _gitApi?: GitAPI;
	private _detectionSeq = 0;
	private _isDisposed = false;

	/** Emits whenever the detected repository state or selection changes. */
	public readonly onDidChangeState = this._stateEmitter.event;

	public constructor(
		private readonly gitService?: GitService,
		private readonly logger?: LoggerService
	) {
		this.initEventListeners();
	}

	public get state(): RepositoryDetectionState {
		return this._state;
	}

	public getActiveRepository(): DetectedRepoInfo | undefined {
		return this._state.activeRepo;
	}

	public getAllRepositories(): readonly DetectedRepoInfo[] {
		return this._state.allRepos;
	}

	/**
	 * Initializes extension host event listeners (workspace folders, active editor).
	 */
	private initEventListeners(): void {
		this._disposables.push(
			vscode.workspace.onDidChangeWorkspaceFolders(() => {
				this.logger?.info('Workspace folders changed, refreshing repository detection...');
				void this.detectRepositories();
			}),
			vscode.window.onDidChangeActiveTextEditor((editor) => {
				if (editor && editor.document && editor.document.uri.scheme === 'file') {
					this.handleActiveEditorChange(editor.document.uri);
				}
			})
		);
	}

	/**
	 * Connects to the built-in VS Code Git extension API if available.
	 */
	public async initGitExtension(): Promise<GitAPI | undefined> {
		if (this._gitApi) {
			return this._gitApi;
		}

		try {
			const extension = vscode.extensions.getExtension<GitExtension>('vscode.git');
			if (!extension) {
				this.logger?.warn('Built-in VS Code Git extension ("vscode.git") is not installed or available.');
				return undefined;
			}

			if (!extension.isActive) {
				this.logger?.info('Activating built-in VS Code Git extension...');
				await extension.activate();
			}

			const api = extension.exports.getAPI(1);
			this._gitApi = api;

			// Subscribe to Git API life-cycle events
			this._disposables.push(
				api.onDidOpenRepository((repo) => {
					this.logger?.info(`Git repository opened: ${repo.rootUri.fsPath}`);
					this.attachRepoListener(repo);
					void this.detectRepositories();
				}),
				api.onDidCloseRepository((repo) => {
					this.logger?.info(`Git repository closed: ${repo.rootUri.fsPath}`);
					this.detachRepoListener(repo.rootUri.fsPath);
					void this.detectRepositories();
				}),
				api.onDidChangeState((gitState) => {
					this.logger?.info(`VS Code Git API state changed: ${gitState}`);
					void this.detectRepositories();
				})
			);

			// Attach to any initially known repositories
			for (const repo of api.repositories) {
				this.attachRepoListener(repo);
			}

			return api;
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : String(error);
			this.logger?.warn(`Failed to connect to VS Code Git extension API: ${msg}`);
			return undefined;
		}
	}

	/**
	 * Attaches state change listeners to a specific VS Code Git repository.
	 */
	private attachRepoListener(repo: Repository): void {
		const repoPath = repo.rootUri.fsPath;
		if (this._repoDisposables.has(repoPath)) {
			return;
		}

		const disposables: vscode.Disposable[] = [];
		try {
			disposables.push(
				repo.state.onDidChange(() => {
					this.logger?.info(`Git state changed for repository: ${repoPath}`);
					void this.detectRepositories();
				})
			);
			if (repo.ui && repo.ui.onDidChange) {
				disposables.push(
					repo.ui.onDidChange(() => {
						if (repo.ui.selected) {
							this._selectedRepoId = repoPath;
							void this.detectRepositories();
						}
					})
				);
			}
		} catch (err: unknown) {
			this.logger?.warn(`Could not attach state listener to repo ${repoPath}: ${String(err)}`);
		}

		this._repoDisposables.set(repoPath, disposables);
	}

	private detachRepoListener(repoPath: string): void {
		const disposables = this._repoDisposables.get(repoPath);
		if (disposables) {
			for (const d of disposables) {
				try {
					d.dispose();
				} catch {
					// Ignore disposal error
				}
			}
			this._repoDisposables.delete(repoPath);
		}
	}

	/**
	 * Switches the active repository when the active editor points to a file within another known repo.
	 */
	private handleActiveEditorChange(fileUri: vscode.Uri): void {
		if (this._state.allRepos.length <= 1) {
			return;
		}

		const filePath = fileUri.fsPath;
		const matchingRepo = this._state.allRepos.find((r) => {
			const relative = path.relative(r.rootPath, filePath);
			return !relative.startsWith('..') && !path.isAbsolute(relative);
		});

		if (matchingRepo && matchingRepo.id !== this._state.activeRepo?.id) {
			this.logger?.info(`Auto-selecting repository based on active editor: ${matchingRepo.repoName}`);
			this._selectedRepoId = matchingRepo.id;
			this.updateState({
				status: 'detected',
				activeRepo: matchingRepo,
				allRepos: this._state.allRepos
			});
		}
	}

	/**
	 * Main repository detection entry point. Discovers repositories via Git API and fallback,
	 * handles multi-root workspaces and subfolders, and updates lifecycle state.
	 */
	public async detectRepositories(): Promise<RepositoryDetectionState> {
		if (this._isDisposed) {
			return this._state;
		}

		const currentSeq = ++this._detectionSeq;

		// Immediately broadcast "detecting" state if not already in that state
		if (this._state.status !== 'detecting') {
			this.updateState({
				status: 'detecting',
				activeRepo: this._state.activeRepo,
				allRepos: this._state.allRepos
			});
		}

		const detectionPromise = this.executeDetection(currentSeq);
		const timeoutPromise = new Promise<RepositoryDetectionState>((resolve) => {
			setTimeout(() => {
				if (currentSeq === this._detectionSeq && !this._isDisposed) {
					this.logger?.warn('Repository detection timed out after 10 seconds.');
					resolve({
						status: 'detection-failed',
						allRepos: [],
						errorMessage: 'Repository detection timed out. Please click refresh.'
					});
				}
			}, 10000);
		});

		try {
			const result = await Promise.race([detectionPromise, timeoutPromise]);
			if (currentSeq === this._detectionSeq && !this._isDisposed) {
				this.updateState(result);
			}
			return this._state;
		} catch (error: unknown) {
			if (currentSeq === this._detectionSeq && !this._isDisposed) {
				const msg = error instanceof Error ? error.message : String(error);
				this.logger?.error(`Repository detection failed unexpectedly: ${msg}`);
				this.updateState({
					status: 'detection-failed',
					allRepos: [],
					errorMessage: msg
				});
			}
			return this._state;
		}
	}

	private async executeDetection(seq: number): Promise<RepositoryDetectionState> {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			this.logger?.info('No workspace folders open in VS Code.');
			return {
				status: 'no-repo',
				allRepos: [],
				errorMessage: 'No workspace folder open.'
			};
		}

		// Ensure Git API connection is established
		const gitApi = await this.initGitExtension();

		if (seq !== this._detectionSeq || this._isDisposed) {
			return this._state;
		}

		const detectedMap = new Map<string, DetectedRepoInfo>();

		// 1. Gather repositories from VS Code Git API
		if (gitApi) {
			for (const repo of gitApi.repositories) {
				this.attachRepoListener(repo);
				const info = this.extractFromGitApiRepo(repo);
				detectedMap.set(info.rootPath, info);
			}
		}

		// 2. Check each workspace folder and its subfolders
		for (const folder of workspaceFolders) {
			const folderPath = folder.uri.fsPath;

			// If gitApi can give us a repository directly for this folder URI
			if (gitApi) {
				const folderRepo = gitApi.getRepository(folder.uri);
				if (folderRepo) {
					this.attachRepoListener(folderRepo);
					const info = this.extractFromGitApiRepo(folderRepo);
					detectedMap.set(info.rootPath, info);
				}
			}

			// If not detected via Git API, try CLI GitService fallback on the folder
			if (!detectedMap.has(folderPath) && this.gitService) {
				const isRepo = await this.gitService.isGitRepository(folderPath);
				if (isRepo) {
					const info = await this.extractFromGitService(folderPath);
					detectedMap.set(info.rootPath, info);
				} else {
					// Check immediate subdirectories for nested repositories (e.g. monorepo / subproject)
					await this.scanSubfoldersForGit(folderPath, detectedMap);
				}
			}
		}

		if (seq !== this._detectionSeq || this._isDisposed) {
			return this._state;
		}

		const allRepos = Array.from(detectedMap.values());

		if (allRepos.length === 0) {
			// If gitApi is absent and gitService couldn't detect anything, check if git CLI is working
			if (!gitApi && this.gitService) {
				const gitInstalled = await this.checkIfGitInstalled();
				if (!gitInstalled) {
					return {
						status: 'git-unavailable',
						allRepos: [],
						errorMessage: 'Git is not installed or the VS Code Git extension is unavailable.'
					};
				}
			}

			return {
				status: 'no-repo',
				allRepos: [],
				errorMessage: 'No Git repository found in workspace.'
			};
		}

		// Determine active repository
		let activeRepo: DetectedRepoInfo | undefined;
		if (this._selectedRepoId) {
			activeRepo = allRepos.find((r) => r.id === this._selectedRepoId);
		}

		// If no prior selection or selection no longer exists, check active text editor
		if (!activeRepo) {
			const activeEditorUri = vscode.window.activeTextEditor?.document.uri;
			if (activeEditorUri && activeEditorUri.scheme === 'file') {
				const filePath = activeEditorUri.fsPath;
				activeRepo = allRepos.find((r) => {
					const rel = path.relative(r.rootPath, filePath);
					return !rel.startsWith('..') && !path.isAbsolute(rel);
				});
			}
		}

		// Default to first discovered repository
		if (!activeRepo) {
			activeRepo = allRepos[0];
		}

		this._selectedRepoId = activeRepo.id;

		return {
			status: 'detected',
			activeRepo,
			allRepos
		};
	}

	/**
	 * Scans immediate subdirectories of a folder to find nested Git repositories.
	 */
	private async scanSubfoldersForGit(
		parentPath: string,
		detectedMap: Map<string, DetectedRepoInfo>
	): Promise<void> {
		if (!this.gitService) {
			return;
		}

		try {
			const entries = await fs.readdir(parentPath, { withFileTypes: true });
			for (const entry of entries) {
				if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') {
					continue;
				}

				const subPath = path.join(parentPath, entry.name);
				if (detectedMap.has(subPath)) {
					continue;
				}

				const isRepo = await this.gitService.isGitRepository(subPath);
				if (isRepo) {
					const info = await this.extractFromGitService(subPath);
					detectedMap.set(info.rootPath, info);
				}
			}
		} catch {
			// Subfolder scanning failure is non-fatal
		}
	}

	/**
	 * Extracts repo metadata from a VS Code Git extension Repository instance.
	 */
	private extractFromGitApiRepo(repo: Repository): DetectedRepoInfo {
		const rootPath = repo.rootUri.fsPath;
		let repoName = path.basename(rootPath);

		// Remote URL
		const remotes = repo.state.remotes || [];
		const originRemote = remotes.find((r) => r.name === 'origin') || remotes[0];
		const remoteUrl = originRemote?.fetchUrl || originRemote?.pushUrl;

		if (remoteUrl) {
			const match = remoteUrl.match(/[:/]([^/:]+\/[^/:]+?)(?:\.git)?$/);
			if (match && match[1]) {
				repoName = match[1];
			}
		}

		// Branch and detached HEAD handling
		let branch = 'unknown';
		const head = repo.state.HEAD;
		if (head) {
			if (head.name) {
				branch = head.name;
			} else if (head.commit) {
				branch = `HEAD (detached at ${head.commit.slice(0, 7)})`;
			} else {
				branch = 'HEAD (unborn)';
			}
		}

		const stagedCount = repo.state.indexChanges?.length ?? 0;
		const uncommittedCount = repo.state.workingTreeChanges?.length ?? 0;
		const isClean = stagedCount === 0 && uncommittedCount === 0 && (repo.state.mergeChanges?.length ?? 0) === 0;
		const isEmpty = !head?.commit;

		let statusSummary = 'Clean working tree';
		if (!isClean) {
			const parts: string[] = [];
			if (stagedCount > 0) {
				parts.push(`${stagedCount} staged`);
			}
			if (uncommittedCount > 0) {
				parts.push(`${uncommittedCount} uncommitted`);
			}
			statusSummary = parts.length > 0 ? parts.join(' • ') : 'Changes detected';
		}

		return {
			id: rootPath,
			rootPath,
			repoName,
			branch,
			remoteUrl,
			stagedCount,
			uncommittedCount,
			isClean,
			isEmpty,
			statusSummary
		};
	}

	/**
	 * Extracts repo metadata using GitService CLI fallback.
	 */
	private async extractFromGitService(rootPath: string): Promise<DetectedRepoInfo> {
		if (!this.gitService) {
			throw new Error('GitService is unavailable.');
		}

		let repoName = path.basename(rootPath);
		let remoteUrl: string | undefined;

		try {
			remoteUrl = await this.gitService.getRemoteUrl(rootPath);
			if (remoteUrl) {
				const match = remoteUrl.match(/[:/]([^/:]+\/[^/:]+?)(?:\.git)?$/);
				if (match && match[1]) {
					repoName = match[1];
				}
			}
		} catch {
			// Keep folder name
		}

		let branch = 'HEAD';
		try {
			branch = await this.gitService.getCurrentBranch(rootPath);
		} catch {
			branch = 'unknown';
		}

		let stagedCount = 0;
		let uncommittedCount = 0;

		try {
			const stagedDiff = await this.gitService.getStagedDiff(rootPath);
			stagedCount = stagedDiff.hasChanges ? 1 : 0;
		} catch {
			stagedCount = 0;
		}

		try {
			const workingTreeDiff = await this.gitService.getWorkingTreeDiff(rootPath);
			uncommittedCount = workingTreeDiff.hasChanges ? 1 : 0;
		} catch {
			uncommittedCount = 0;
		}

		const isClean = stagedCount === 0 && uncommittedCount === 0;
		const statusSummary = isClean
			? 'Clean working tree'
			: [stagedCount > 0 ? 'Staged changes' : '', uncommittedCount > 0 ? 'Uncommitted changes' : '']
					.filter(Boolean)
					.join(' • ');

		return {
			id: rootPath,
			rootPath,
			repoName,
			branch,
			remoteUrl: remoteUrl || undefined,
			stagedCount,
			uncommittedCount,
			isClean,
			isEmpty: branch === 'HEAD (detached)' && stagedCount === 0,
			statusSummary
		};
	}

	private async checkIfGitInstalled(): Promise<boolean> {
		if (!this.gitService) {
			return false;
		}
		try {
			// Test by checking a dummy directory
			await this.gitService.isGitRepository(process.cwd());
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Prompts the user to select an active repository from all detected repositories.
	 */
	public async selectActiveRepository(): Promise<DetectedRepoInfo | undefined> {
		const repos = this._state.allRepos;
		if (repos.length === 0) {
			void vscode.window.showWarningMessage('No Git repositories detected in current workspace.');
			return undefined;
		}

		if (repos.length === 1) {
			void vscode.window.showInformationMessage(`Only one Git repository detected: ${repos[0].repoName}`);
			return repos[0];
		}

		interface RepoQuickPickItem extends vscode.QuickPickItem {
			repo: DetectedRepoInfo;
		}

		const items: RepoQuickPickItem[] = repos.map((repo) => ({
			label: `$(repo) ${repo.repoName}`,
			description: repo.id === this._selectedRepoId ? `[Active] (${repo.branch})` : `(${repo.branch})`,
			detail: `${repo.rootPath} • ${repo.statusSummary}`,
			repo
		}));

		const selected = await vscode.window.showQuickPick(items, {
			placeHolder: 'Select active Git repository for GitIQ'
		});

		if (selected) {
			this._selectedRepoId = selected.repo.id;
			this.logger?.info(`User switched active repository to: ${selected.repo.repoName}`);
			this.updateState({
				status: 'detected',
				activeRepo: selected.repo,
				allRepos: this._state.allRepos
			});
			return selected.repo;
		}

		return undefined;
	}

	/**
	 * Forces a manual refresh of repository detection.
	 */
	public async refresh(): Promise<RepositoryDetectionState> {
		this.logger?.info('Manual refresh of Git repository detection requested.');
		return this.detectRepositories();
	}

	private updateState(newState: RepositoryDetectionState): void {
		this._state = newState;
		this._stateEmitter.fire(this._state);
	}

	public dispose(): void {
		this._isDisposed = true;
		for (const disposables of this._repoDisposables.values()) {
			for (const d of disposables) {
				try {
					d.dispose();
				} catch {
					// Ignore
				}
			}
		}
		this._repoDisposables.clear();

		for (const d of this._disposables) {
			try {
				d.dispose();
			} catch {
				// Ignore
			}
		}
		this._disposables.length = 0;
		this._stateEmitter.dispose();
	}
}
