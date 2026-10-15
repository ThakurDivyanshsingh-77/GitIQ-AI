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
	private _isDisposed = false;

	// Single-flight and debouncing management
	private _inFlightDetectionPromise?: Promise<RepositoryDetectionState>;
	private _rerunAfterInFlight = false;
	private _debounceTimer?: ReturnType<typeof setTimeout>;

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
	 * Normalizes file paths for reliable cross-platform comparison (case-insensitive drive letters on Windows).
	 */
	public normalizePath(p: string): string {
		const normalized = path.normalize(p);
		if (process.platform === 'win32' && /^[a-zA-Z]:/.test(normalized)) {
			return normalized[0].toLowerCase() + normalized.slice(1);
		}
		return normalized;
	}

	/**
	 * Initializes extension host event listeners (workspace folders, active editor).
	 */
	private initEventListeners(): void {
		this._disposables.push(
			vscode.workspace.onDidChangeWorkspaceFolders(() => {
				this.logger?.info('Workspace folders changed, refreshing repository detection...');
				void this.scheduleDetection(100);
			}),
			vscode.window.onDidChangeActiveTextEditor((editor) => {
				if (editor && editor.document && editor.document.uri.scheme === 'file') {
					this.handleActiveEditorChange(editor.document.uri);
				}
			})
		);
	}

	/**
	 * Schedules debounced detection to prevent race conditions and redundant process spawns.
	 */
	public scheduleDetection(delayMs: number = 100): Promise<RepositoryDetectionState> {
		if (this._debounceTimer) {
			clearTimeout(this._debounceTimer);
			this._debounceTimer = undefined;
		}

		return new Promise<RepositoryDetectionState>((resolve) => {
			this._debounceTimer = setTimeout(() => {
				this._debounceTimer = undefined;
				resolve(this.detectRepositories());
			}, delayMs);
		});
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

			if (!extension.exports || typeof extension.exports.getAPI !== 'function') {
				this.logger?.warn('Built-in VS Code Git extension does not export getAPI().');
				return undefined;
			}

			const api = extension.exports.getAPI(1);
			this._gitApi = api;

			// If API is uninitialized, wait briefly for initialization event
			if (api.state === 'uninitialized') {
				await new Promise<void>((resolve) => {
					let resolved = false;
					const timer = setTimeout(() => {
						if (!resolved) {
							resolved = true;
							disposable.dispose();
							resolve();
						}
					}, 1500);

					const disposable = api.onDidChangeState((s) => {
						if (s === 'initialized' && !resolved) {
							resolved = true;
							clearTimeout(timer);
							disposable.dispose();
							resolve();
						}
					});
				});
			}

			// Subscribe to Git API life-cycle events with debounced scheduling
			this._disposables.push(
				api.onDidOpenRepository((repo) => {
					this.logger?.info(`Git repository opened: ${repo.rootUri.fsPath}`);
					this.attachRepoListener(repo);
					void this.scheduleDetection(50);
				}),
				api.onDidCloseRepository((repo) => {
					this.logger?.info(`Git repository closed: ${repo.rootUri.fsPath}`);
					this.detachRepoListener(repo.rootUri.fsPath);
					void this.scheduleDetection(50);
				}),
				api.onDidChangeState((gitState) => {
					this.logger?.info(`VS Code Git API state changed: ${gitState}`);
					void this.scheduleDetection(50);
				})
			);

			// Attach to any initially known repositories
			if (Array.isArray(api.repositories)) {
				for (const repo of api.repositories) {
					this.attachRepoListener(repo);
				}
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
		const repoKey = this.normalizePath(repo.rootUri.fsPath);
		if (this._repoDisposables.has(repoKey)) {
			return;
		}

		const disposables: vscode.Disposable[] = [];
		try {
			if (repo.state && typeof repo.state.onDidChange === 'function') {
				disposables.push(
					repo.state.onDidChange(() => {
						this.logger?.info(`Git state changed for repository: ${repo.rootUri.fsPath}`);
						void this.scheduleDetection(50);
					})
				);
			}
			if (repo.ui && typeof repo.ui.onDidChange === 'function') {
				disposables.push(
					repo.ui.onDidChange(() => {
						if (repo.ui.selected) {
							this._selectedRepoId = repo.rootUri.fsPath;
							void this.scheduleDetection(50);
						}
					})
				);
			}
		} catch (err: unknown) {
			this.logger?.warn(`Could not attach state listener to repo ${repo.rootUri.fsPath}: ${String(err)}`);
		}

		this._repoDisposables.set(repoKey, disposables);
	}

	private detachRepoListener(repoPath: string): void {
		const repoKey = this.normalizePath(repoPath);
		const disposables = this._repoDisposables.get(repoKey);
		if (disposables) {
			for (const d of disposables) {
				try {
					d.dispose();
				} catch {
					// Ignore disposal error
				}
			}
			this._repoDisposables.delete(repoKey);
		}
	}

	/**
	 * Switches the active repository when the active editor points to a file within another known repo.
	 */
	private handleActiveEditorChange(fileUri: vscode.Uri): void {
		if (this._state.allRepos.length <= 1) {
			return;
		}

		const filePathNorm = this.normalizePath(fileUri.fsPath);
		const matchingRepo = this._state.allRepos.find((r) => {
			const rootNorm = this.normalizePath(r.rootPath);
			const relative = path.relative(rootNorm, filePathNorm);
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
	 * Main repository detection entry point.
	 * Utilizes single-flight execution so concurrent callers share in-flight detection
	 * without invalidating or cancelling state updates.
	 */
	public async detectRepositories(): Promise<RepositoryDetectionState> {
		if (this._isDisposed) {
			return this._state;
		}

		// If a detection cycle is already running, join it and schedule follow-up if needed
		if (this._inFlightDetectionPromise) {
			this._rerunAfterInFlight = true;
			return this._inFlightDetectionPromise;
		}

		this._inFlightDetectionPromise = this.runDetectionCycle();

		try {
			const result = await this._inFlightDetectionPromise;
			return result;
		} finally {
			this._inFlightDetectionPromise = undefined;
			if (this._rerunAfterInFlight && !this._isDisposed) {
				this._rerunAfterInFlight = false;
				void this.scheduleDetection(50);
			}
		}
	}

	/**
	 * Executes a single detection cycle wrapped in timeout protection.
	 */
	private async runDetectionCycle(): Promise<RepositoryDetectionState> {
		if (this._state.status !== 'detected' && this._state.status !== 'detecting') {
			this.updateState({
				status: 'detecting',
				activeRepo: this._state.activeRepo,
				allRepos: this._state.allRepos
			});
		}

		const timeoutMs = 8000;
		let timerId: ReturnType<typeof setTimeout> | undefined;

		const timeoutPromise = new Promise<RepositoryDetectionState>((resolve) => {
			timerId = setTimeout(() => {
				this.logger?.warn(`Repository detection timed out after ${timeoutMs / 1000}s.`);
				resolve({
					status: 'detection-failed',
					allRepos: [],
					errorMessage: 'Repository detection timed out. Please check Git and click Retry.'
				});
			}, timeoutMs);
		});

		try {
			const detectionPromise = this.executeDetection();
			const result = await Promise.race([detectionPromise, timeoutPromise]);
			if (timerId) {
				clearTimeout(timerId);
			}

			if (!this._isDisposed) {
				this.updateState(result);
			}
			return this._state;
		} catch (error: unknown) {
			if (timerId) {
				clearTimeout(timerId);
			}
			const msg = error instanceof Error ? error.message : String(error);
			this.logger?.error(`Repository detection failed unexpectedly: ${msg}`);
			const errState: RepositoryDetectionState = {
				status: 'detection-failed',
				allRepos: [],
				errorMessage: msg || 'Unexpected error occurred during repository detection.'
			};
			if (!this._isDisposed) {
				this.updateState(errState);
			}
			return errState;
		}
	}

	private async executeDetection(): Promise<RepositoryDetectionState> {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			this.logger?.info('No workspace folders open in VS Code.');
			return {
				status: 'no-repo',
				allRepos: [],
				errorMessage: 'No workspace folder open.'
			};
		}

		// 1. Initialize VS Code Git extension API
		const gitApi = await this.initGitExtension();

		if (this._isDisposed) {
			return this._state;
		}

		const detectedMap = new Map<string, DetectedRepoInfo>();

		// 2. Discover repositories from official VS Code Git extension API
		if (gitApi) {
			// First add any already tracked repositories in gitApi
			if (Array.isArray(gitApi.repositories)) {
				for (const repo of gitApi.repositories) {
					this.attachRepoListener(repo);
					const info = this.extractFromGitApiRepo(repo);
					detectedMap.set(this.normalizePath(info.rootPath), info);
				}
			}

			// Explicitly check/open repositories for each workspace folder
			for (const folder of workspaceFolders) {
				let folderRepo = gitApi.getRepository(folder.uri);

				// If not yet opened by VS Code Git extension, try opening it
				if (!folderRepo && typeof gitApi.openRepository === 'function') {
					try {
						folderRepo = await gitApi.openRepository(folder.uri);
					} catch (err: unknown) {
						this.logger?.warn(`gitApi.openRepository error for "${folder.uri.fsPath}": ${String(err)}`);
					}
				}

				if (folderRepo) {
					this.attachRepoListener(folderRepo);
					const info = this.extractFromGitApiRepo(folderRepo);
					detectedMap.set(this.normalizePath(info.rootPath), info);
				}
			}
		}

		// 3. CLI fallback for workspace folders not recognized by Git API
		for (const folder of workspaceFolders) {
			const folderPath = folder.uri.fsPath;
			const folderKey = this.normalizePath(folderPath);

			// Check if already covered by an existing detected repo
			const alreadyCovered = Array.from(detectedMap.values()).some((r) => {
				const rel = path.relative(this.normalizePath(r.rootPath), folderKey);
				return !rel.startsWith('..') && !path.isAbsolute(rel);
			});

			if (!alreadyCovered && this.gitService) {
				// Check if directory belongs to a git worktree or has .git file/folder
				let isRepo = await this.gitService.isGitRepository(folderPath);
				if (!isRepo) {
					isRepo = await this.isGitDirectoryOrFile(folderPath);
				}

				if (isRepo) {
					let repoPath = folderPath;
					if (typeof this.gitService.getTopLevel === 'function') {
						try {
							const top = await this.gitService.getTopLevel(folderPath);
							if (top) {
								repoPath = top;
							}
						} catch {
							repoPath = folderPath;
						}
					}
					const info = await this.extractFromGitService(repoPath);
					detectedMap.set(this.normalizePath(info.rootPath), info);
				} else {
					// Scan immediate subfolders (for monorepos or nested subprojects)
					await this.scanSubfoldersForGit(folderPath, detectedMap);
				}
			}
		}

		if (this._isDisposed) {
			return this._state;
		}

		const allRepos = Array.from(detectedMap.values());

		if (allRepos.length === 0) {
			// Check if Git CLI is available
			if (this.gitService && typeof this.gitService.isGitInstalled === 'function') {
				try {
					const gitInstalled = await this.gitService.isGitInstalled();
					if (!gitInstalled && !gitApi) {
						return {
							status: 'git-unavailable',
							allRepos: [],
							errorMessage: 'Git is not installed or the VS Code Git extension is unavailable.'
						};
					}
				} catch {
					// Fall through to no-repo
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
				const filePathNorm = this.normalizePath(activeEditorUri.fsPath);
				activeRepo = allRepos.find((r) => {
					const rel = path.relative(this.normalizePath(r.rootPath), filePathNorm);
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
	 * Checks whether a .git file (worktree/submodule) or .git directory exists directly in dirPath.
	 */
	private async isGitDirectoryOrFile(dirPath: string): Promise<boolean> {
		try {
			const gitPath = path.join(dirPath, '.git');
			const stat = await fs.stat(gitPath);
			return stat.isDirectory() || stat.isFile();
		} catch {
			return false;
		}
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
				const subKey = this.normalizePath(subPath);
				if (detectedMap.has(subKey)) {
					continue;
				}

				let isRepo = await this.gitService.isGitRepository(subPath);
				if (!isRepo) {
					isRepo = await this.isGitDirectoryOrFile(subPath);
				}

				if (isRepo) {
					let repoPath = subPath;
					if (typeof this.gitService.getTopLevel === 'function') {
						try {
							const top = await this.gitService.getTopLevel(subPath);
							if (top) {
								repoPath = top;
							}
						} catch {
							repoPath = subPath;
						}
					}
					const info = await this.extractFromGitService(repoPath);
					detectedMap.set(this.normalizePath(info.rootPath), info);
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
		const remotes = repo.state?.remotes || [];
		const originRemote = remotes.find((r) => r.name === 'origin') || remotes[0];
		const remoteUrl = originRemote?.fetchUrl || originRemote?.pushUrl;

		if (remoteUrl) {
			const match = remoteUrl.match(/[:/]([^/:]+\/[^/:]+?)(?:\.git)?$/);
			if (match && match[1]) {
				repoName = match[1];
			}
		}

		// Branch and detached HEAD handling
		let branch = 'HEAD';
		const head = repo.state?.HEAD;
		if (head) {
			if (head.name) {
				branch = head.name;
			} else if (head.commit) {
				branch = `HEAD (detached at ${head.commit.slice(0, 7)})`;
			} else {
				branch = 'HEAD (unborn)';
			}
		}

		const stagedCount = repo.state?.indexChanges?.length ?? 0;
		const uncommittedCount = repo.state?.workingTreeChanges?.length ?? 0;
		const isClean =
			stagedCount === 0 &&
			uncommittedCount === 0 &&
			(repo.state?.mergeChanges?.length ?? 0) === 0;
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
		let isClean = true;

		let statusCounted = false;
		if (typeof this.gitService.getStatusCounts === 'function') {
			try {
				const counts = await this.gitService.getStatusCounts(rootPath);
				stagedCount = counts.stagedCount;
				uncommittedCount = counts.uncommittedCount;
				isClean = counts.isClean;
				statusCounted = true;
			} catch {
				statusCounted = false;
			}
		}

		if (!statusCounted) {
			if (typeof this.gitService.getStagedDiff === 'function') {
				try {
					const stagedDiff = await this.gitService.getStagedDiff(rootPath);
					stagedCount = stagedDiff.hasChanges ? 1 : 0;
				} catch {
					stagedCount = 0;
				}
			}
			if (typeof this.gitService.getWorkingTreeDiff === 'function') {
				try {
					const workingTreeDiff = await this.gitService.getWorkingTreeDiff(rootPath);
					uncommittedCount = workingTreeDiff.hasChanges ? 1 : 0;
				} catch {
					uncommittedCount = 0;
				}
			}
			isClean = stagedCount === 0 && uncommittedCount === 0;
		}

		const statusSummary = isClean
			? 'Clean working tree'
			: [stagedCount > 0 ? `${stagedCount} staged` : '', uncommittedCount > 0 ? `${uncommittedCount} uncommitted` : '']
					.filter(Boolean)
					.join(' • ') || 'Changes detected';

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
		if (this._debounceTimer) {
			clearTimeout(this._debounceTimer);
			this._debounceTimer = undefined;
		}

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
