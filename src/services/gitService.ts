import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { GitCommitError } from '../utils/errors';
import type { LoggerService } from './loggerService';

const execFileAsync = promisify(execFile);

/** A staged Git diff returned from a successful Git command invocation. */
export interface StagedDiff {
	readonly content: string;
	readonly hasChanges: boolean;
	readonly originalLength: number;
	readonly filteredLength: number;
}

/** Represents a single commit item in Git log history. */
export interface CommitHistoryItem {
	readonly hash: string;
	readonly shortHash: string;
	readonly author: string;
	readonly relativeDate: string;
	readonly subject: string;
}

/** Detailed information for a single Git commit including stats and diff. */
export interface CommitDetails {
	readonly hash: string;
	readonly author: string;
	readonly date: string;
	readonly subject: string;
	readonly fullOutput: string;
}

/** Summary information for a Git repository. */
export interface RepositoryInfo {
	readonly repoName: string;
	readonly currentBranch: string;
	readonly remoteUrl: string;
	readonly latestCommit: string;
	readonly totalCommits: string;
	readonly gitStatus: string;
}

/** Pathspecs passed to `git diff --cached` to automatically ignore build artifacts and lock files. */
const EXCLUDE_PATHSPECS = [
	'--',
	'.',
	':(exclude)node_modules',
	':(exclude).next',
	':(exclude)dist',
	':(exclude)build',
	':(exclude)coverage',
	':(exclude)*.map',
	':(exclude)package-lock.json',
	':(exclude)pnpm-lock.yaml',
	':(exclude)yarn.lock'
];

/**
 * Encapsulates all local Git process interaction for the extension.
 */
export class GitService {
	public constructor(private readonly logger?: LoggerService) {}

	/**
	 * Determines whether a directory belongs to a Git working tree.
	 * `execFile` avoids a shell, so the workspace path is never interpolated.
	 */
	public async isGitRepository(workspacePath: string): Promise<boolean> {
		this.logger?.info(`Checking Git repository status for: ${workspacePath}`);
		try {
			const { stdout } = await execFileAsync(
				'git',
				['rev-parse', '--is-inside-work-tree'],
				{
					cwd: workspacePath,
					windowsHide: true
				}
			);

			const isRepo = stdout.trim() === 'true';
			this.logger?.info(`Git repository status: ${isRepo ? 'Detected' : 'Not detected'}`);
			return isRepo;
		} catch (error: unknown) {
			this.logger?.warn(`Git repository check failed: ${error instanceof Error ? error.message : String(error)}`);
			return false;
		}
	}

	/**
	 * Reads the staged changes for a repository, excluding generated files and lock files.
	 * Reads the diff once to maximize performance.
	 */
	public async getStagedDiff(workspacePath: string): Promise<StagedDiff> {
		this.logger?.info('Git diff read started (excluding generated files and lock files)...');
		
		const { stdout } = await execFileAsync(
			'git',
			['diff', '--cached', ...EXCLUDE_PATHSPECS],
			{
				cwd: workspacePath,
				windowsHide: true,
				maxBuffer: 20 * 1024 * 1024 // 20 MB buffer limit for large repos
			}
		);

		const rawContent = stdout.toString();
		const filteredContent = this.filterDiffContent(rawContent);
		const trimmedContent = filteredContent.trim();

		this.logger?.info(
			`Git diff retrieved successfully. Raw size: ${rawContent.length} chars, Filtered size: ${trimmedContent.length} chars`
		);

		return {
			content: trimmedContent,
			hasChanges: trimmedContent.length > 0,
			originalLength: rawContent.length,
			filteredLength: trimmedContent.length
		};
	}

	/**
	 * Executes `git commit -m "<message>"` in the specified workspace directory.
	 */
	public async commit(workspacePath: string, message: string): Promise<void> {
		this.logger?.info(`Executing git commit in ${workspacePath}...`);
		try {
			await execFileAsync('git', ['commit', '-m', message], {
				cwd: workspacePath,
				windowsHide: true
			});
			this.logger?.info('Git commit executed successfully.');
		} catch (error: unknown) {
			const stderr =
				typeof error === 'object' && error !== null && 'stderr' in error
					? String(error.stderr).trim()
					: '';
			const details = stderr || (error instanceof Error ? error.message : String(error));
			this.logger?.error(`Git commit failed: ${details}`, error);
			throw new GitCommitError(`Failed to execute git commit: ${details}`);
		}
	}

	/**
	 * Fetches recent commit history for the workspace (`git log -n <limit>`).
	 */
	public async getCommitHistory(
		workspacePath: string,
		limit: number = 20
	): Promise<CommitHistoryItem[]> {
		this.logger?.info(`Fetching commit history (limit: ${limit}) for: ${workspacePath}`);
		try {
			const { stdout } = await execFileAsync(
				'git',
				['log', `-n`, String(limit), '--pretty=format:%H|%h|%an|%cr|%s'],
				{
					cwd: workspacePath,
					windowsHide: true
				}
			);

			const lines = stdout.toString().split(/\r?\n/).filter((line) => line.trim().length > 0);
			const commits: CommitHistoryItem[] = [];

			for (const line of lines) {
				const parts = line.split('|');
				if (parts.length >= 5) {
					commits.push({
						hash: parts[0] || '',
						shortHash: parts[1] || '',
						author: parts[2] || 'Unknown Author',
						relativeDate: parts[3] || 'Unknown Date',
						subject: parts.slice(4).join('|') || 'No commit message'
					});
				}
			}

			this.logger?.info(`Fetched ${commits.length} commits successfully.`);
			return commits;
		} catch (error: unknown) {
			this.logger?.error(`Failed to fetch commit history: ${error instanceof Error ? error.message : String(error)}`);
			return [];
		}
	}

	/**
	 * Fetches detailed output for a specific commit (`git show <hash> --stat --patch`).
	 */
	public async getCommitDetails(workspacePath: string, hash: string): Promise<CommitDetails> {
		this.logger?.info(`Fetching commit details for hash: ${hash}`);
		try {
			const { stdout } = await execFileAsync('git', ['show', hash, '--stat', '--patch'], {
				cwd: workspacePath,
				windowsHide: true,
				maxBuffer: 10 * 1024 * 1024
			});

			const fullOutput = stdout.toString();
			const authorMatch = fullOutput.match(/^Author:\s*(.+)$/m);
			const dateMatch = fullOutput.match(/^Date:\s*(.+)$/m);
			const subjectMatch = fullOutput.match(/\n\n\s{4}(.+)\n/);

			return {
				hash,
				author: authorMatch ? authorMatch[1].trim() : 'Unknown',
				date: dateMatch ? dateMatch[1].trim() : 'Unknown',
				subject: subjectMatch ? subjectMatch[1].trim() : 'Commit details',
				fullOutput
			};
		} catch (error: unknown) {
			const details = error instanceof Error ? error.message : String(error);
			this.logger?.error(`Failed to fetch commit details for ${hash}: ${details}`);
			throw new GitCommitError(`Failed to fetch commit details: ${details}`);
		}
	}

	/**
	 * Reads raw `git show <hash>` output for AI commit explanation.
	 */
	public async getCommitShowRaw(workspacePath: string, hash: string): Promise<string> {
		this.logger?.info(`Fetching raw git show for AI explanation (hash: ${hash})...`);
		try {
			const { stdout } = await execFileAsync('git', ['show', hash], {
				cwd: workspacePath,
				windowsHide: true,
				maxBuffer: 10 * 1024 * 1024
			});

			return stdout.toString();
		} catch (error: unknown) {
			const details = error instanceof Error ? error.message : String(error);
			this.logger?.error(`Failed to fetch raw git show for ${hash}: ${details}`);
			throw new GitCommitError(`Failed to read commit for AI explanation: ${details}`);
		}
	}

	/** Returns the currently checked-out branch name (`git branch --show-current`). */
	public async getCurrentBranch(workspacePath: string): Promise<string> {
		this.logger?.info(`Fetching current Git branch for: ${workspacePath}`);
		try {
			const { stdout } = await execFileAsync('git', ['branch', '--show-current'], {
				cwd: workspacePath,
				windowsHide: true
			});

			const branch = stdout.trim();
			return branch || 'HEAD (detached)';
		} catch (error: unknown) {
			const details = error instanceof Error ? error.message : String(error);
			this.logger?.error(`Failed to get current branch: ${details}`);
			throw new GitCommitError(`Unable to determine current Git branch: ${details}`);
		}
	}

	/** Pushes local commits to remote origin for the active branch (`git push`). */
	public async push(workspacePath: string): Promise<void> {
		const branch = await this.getCurrentBranch(workspacePath);
		this.logger?.info(`Pushing branch "${branch}" to origin...`);

		try {
			await execFileAsync('git', ['push', 'origin', branch], {
				cwd: workspacePath,
				windowsHide: true
			});
			this.logger?.info(`Pushed branch "${branch}" successfully.`);
		} catch (error: unknown) {
			const stderr =
				typeof error === 'object' && error !== null && 'stderr' in error
					? String(error.stderr).trim()
					: '';
			const details = stderr || (error instanceof Error ? error.message : String(error));
			this.logger?.error(`Git push failed: ${details}`, error);
			throw new GitCommitError(`Git push failed: ${details}`);
		}
	}

	/** Pulls changes from remote origin into the active branch (`git pull`). */
	public async pull(workspacePath: string): Promise<void> {
		const branch = await this.getCurrentBranch(workspacePath);
		this.logger?.info(`Pulling branch "${branch}" from origin...`);

		try {
			await execFileAsync('git', ['pull', 'origin', branch], {
				cwd: workspacePath,
				windowsHide: true
			});
			this.logger?.info(`Pulled branch "${branch}" successfully.`);
		} catch (error: unknown) {
			const stderr =
				typeof error === 'object' && error !== null && 'stderr' in error
					? String(error.stderr).trim()
					: '';
			const details = stderr || (error instanceof Error ? error.message : String(error));
			this.logger?.error(`Git pull failed: ${details}`, error);
			throw new GitCommitError(`Git pull failed: ${details}`);
		}
	}

	/** Fetches remote references (`git fetch`). */
	public async fetch(workspacePath: string): Promise<void> {
		this.logger?.info(`Fetching remote updates...`);
		try {
			await execFileAsync('git', ['fetch'], {
				cwd: workspacePath,
				windowsHide: true
			});
			this.logger?.info('Git fetch completed successfully.');
		} catch (error: unknown) {
			const stderr =
				typeof error === 'object' && error !== null && 'stderr' in error
					? String(error.stderr).trim()
					: '';
			const details = stderr || (error instanceof Error ? error.message : String(error));
			this.logger?.error(`Git fetch failed: ${details}`, error);
			throw new GitCommitError(`Git fetch failed: ${details}`);
		}
	}

	/** Returns remote origin URL (`git remote get-url origin`). */
	public async getRemoteUrl(workspacePath: string, remoteName: string = 'origin'): Promise<string> {
		try {
			const { stdout } = await execFileAsync('git', ['remote', 'get-url', remoteName], {
				cwd: workspacePath,
				windowsHide: true
			});
			return stdout.trim();
		} catch {
			return '';
		}
	}

	/** Converts a Git remote URL (SSH or HTTPS) into a clean browser web URL. */
	public async getGitHubWebUrl(workspacePath: string): Promise<string> {
		const remoteUrl = await this.getRemoteUrl(workspacePath, 'origin');

		if (!remoteUrl) {
			throw new GitCommitError('No remote "origin" URL configured for this repository.');
		}

		let webUrl = remoteUrl;

		// Convert SSH format (git@github.com:user/repo.git) to HTTPS (https://github.com/user/repo)
		if (webUrl.startsWith('git@')) {
			webUrl = webUrl.replace(/^git@([^:]+):/, 'https://$1/');
		}

		// Remove trailing .git
		webUrl = webUrl.replace(/\.git$/, '');

		if (!webUrl.startsWith('http://') && !webUrl.startsWith('https://')) {
			throw new GitCommitError(`Remote URL "${remoteUrl}" is not a valid HTTP/HTTPS repository URL.`);
		}

		return webUrl;
	}

	/** Returns web URL for the currently checked-out branch on GitHub. */
	public async getGitHubBranchUrl(workspacePath: string): Promise<string> {
		const webUrl = await this.getGitHubWebUrl(workspacePath);
		const branch = await this.getCurrentBranch(workspacePath);

		return `${webUrl}/tree/${encodeURIComponent(branch)}`;
	}

	/** Collects repository summary info for read-only document display. */
	public async getRepositoryInfo(workspacePath: string): Promise<RepositoryInfo> {
		this.logger?.info(`Collecting repository info for: ${workspacePath}`);

		const currentBranch = await this.getCurrentBranch(workspacePath);
		const remoteUrl = (await this.getRemoteUrl(workspacePath)) || 'None';

		let latestCommit = 'No commits found';
		try {
			const { stdout } = await execFileAsync(
				'git',
				['log', '-1', '--pretty=format:%h - %s (%cr) by %an'],
				{ cwd: workspacePath, windowsHide: true }
			);
			latestCommit = stdout.trim() || 'No commits found';
		} catch {
			// Empty repo
		}

		let totalCommits = '0';
		try {
			const { stdout } = await execFileAsync('git', ['rev-list', '--count', 'HEAD'], {
				cwd: workspacePath,
				windowsHide: true
			});
			totalCommits = stdout.trim() || '0';
		} catch {
			// Empty repo
		}

		let gitStatus = 'Clean working tree';
		try {
			const { stdout } = await execFileAsync('git', ['status', '--short'], {
				cwd: workspacePath,
				windowsHide: true
			});
			gitStatus = stdout.trim() || 'Clean working tree (no uncommitted changes)';
		} catch {
			// Failed status
		}

		const folderName = workspacePath.split(/[/\\]/).pop() || 'Repository';

		return {
			repoName: folderName,
			currentBranch,
			remoteUrl,
			latestCommit,
			totalCommits,
			gitStatus
		};
	}

	/** Detects the default branch (main or master) by checking local refs. */
	public async getDefaultBranch(workspacePath: string): Promise<string> {
		this.logger?.info('Detecting default branch (main/master)...');

		// Try to identify the remote HEAD
		try {
			const { stdout } = await execFileAsync(
				'git',
				['symbolic-ref', 'refs/remotes/origin/HEAD', '--short'],
				{ cwd: workspacePath, windowsHide: true }
			);
			const branch = stdout.trim().replace(/^origin\//, '');
			if (branch) {
				this.logger?.info(`Default branch detected via remote HEAD: ${branch}`);
				return branch;
			}
		} catch {
			// Fallback to heuristic
		}

		// Heuristic: check if 'main' or 'master' exist as remote branches
		for (const candidate of ['main', 'master']) {
			try {
				await execFileAsync(
					'git',
					['rev-parse', '--verify', `origin/${candidate}`],
					{ cwd: workspacePath, windowsHide: true }
				);
				this.logger?.info(`Default branch detected via heuristic: ${candidate}`);
				return candidate;
			} catch {
				// Try next candidate
			}
		}

		this.logger?.warn('Could not detect default branch, falling back to "main".');
		return 'main';
	}

	/** Returns the diff between the current branch and the default branch (`git diff origin/<default>...HEAD`). */
	public async getBranchDiff(workspacePath: string): Promise<string> {
		const defaultBranch = await this.getDefaultBranch(workspacePath);
		this.logger?.info(`Generating branch diff (origin/${defaultBranch}...HEAD)...`);

		try {
			const { stdout } = await execFileAsync(
				'git',
				['diff', `origin/${defaultBranch}...HEAD`],
				{
					cwd: workspacePath,
					windowsHide: true,
					maxBuffer: 20 * 1024 * 1024
				}
			);

			const filtered = this.filterDiffContent(stdout.toString());
			return filtered.trim();
		} catch (error: unknown) {
			const details = error instanceof Error ? error.message : String(error);
			this.logger?.error(`Branch diff failed: ${details}`);
			throw new GitCommitError(`Unable to compute branch diff: ${details}`);
		}
	}

	/** Returns oneline commit log between the current branch and the default branch. */
	public async getBranchCommits(workspacePath: string): Promise<string> {
		const defaultBranch = await this.getDefaultBranch(workspacePath);
		this.logger?.info(`Fetching branch commits (origin/${defaultBranch}..HEAD)...`);

		try {
			const { stdout } = await execFileAsync(
				'git',
				['log', `origin/${defaultBranch}..HEAD`, '--oneline'],
				{
					cwd: workspacePath,
					windowsHide: true
				}
			);

			return stdout.trim();
		} catch (error: unknown) {
			const details = error instanceof Error ? error.message : String(error);
			this.logger?.error(`Branch commits fetch failed: ${details}`);
			throw new GitCommitError(`Unable to fetch branch commits: ${details}`);
		}
	}

	/** Builds a GitHub compare URL for creating a pull request (`/compare/main...currentBranch`). */
	public async getCompareUrl(workspacePath: string): Promise<string> {
		const webUrl = await this.getGitHubWebUrl(workspacePath);
		const defaultBranch = await this.getDefaultBranch(workspacePath);
		const currentBranch = await this.getCurrentBranch(workspacePath);

		return `${webUrl}/compare/${encodeURIComponent(defaultBranch)}...${encodeURIComponent(currentBranch)}`;
	}

	/**
	 * Fallback secondary filter to strip any diff blocks matching generated/lock files.
	 */
	private filterDiffContent(diff: string): string {
		if (!diff.includes('diff --git')) {
			return diff;
		}

		const blocks = diff.split(/^diff --git /m);
		const filteredBlocks = blocks.filter((block) => {
			if (!block.trim()) {
				return false;
			}
			const firstLine = block.split('\n')[0] || '';
			return !this.isIgnoredPath(firstLine);
		});

		if (filteredBlocks.length === 0) {
			return '';
		}

		return 'diff --git ' + filteredBlocks.join('diff --git ');
	}

	/** Checks if a diff header line references an ignored generated/lock file. */
	private isIgnoredPath(line: string): boolean {
		const lower = line.toLowerCase();
		return (
			lower.includes('node_modules/') ||
			lower.includes('.next/') ||
			lower.includes('dist/') ||
			lower.includes('build/') ||
			lower.includes('coverage/') ||
			lower.includes('.map') ||
			lower.includes('package-lock.json') ||
			lower.includes('pnpm-lock.yaml') ||
			lower.includes('yarn.lock')
		);
	}
}
