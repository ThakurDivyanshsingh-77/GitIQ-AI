import * as path from 'node:path';
import * as fs from 'node:fs';
import { GitService } from '../services/gitService';
import { HistoryService } from '../services/historyService';
import { CommitMessageValidator } from '../services/commitMessageValidator';

export interface McpToolDefinition {
	name: string;
	description: string;
	inputSchema: {
		type: string;
		properties: Record<string, unknown>;
		required?: string[];
	};
}

export interface McpToolCallResult {
	content: Array<{
		type: 'text';
		text: string;
	}>;
	isError?: boolean;
}

/**
 * Implements safe, read-only GitIQ tools for the Model Context Protocol (MCP).
 * External agents can inspect repo status, diffs, history, and request suggestions
 * without exposing environment secrets or mutating the repository.
 */
export class GitIqMcpServer {
	private readonly gitService: GitService;
	private readonly historyService: HistoryService;
	private readonly validator: CommitMessageValidator;

	public constructor() {
		this.gitService = new GitService();
		this.historyService = new HistoryService(this.gitService);
		this.validator = new CommitMessageValidator();
	}

	/**
	 * Returns the list of tools exposed to MCP clients.
	 */
	public getToolDefinitions(): McpToolDefinition[] {
		return [
			{
				name: 'get_repository_info',
				description: 'Retrieve summary information for a Git repository (name, branch, remote URL, latest commit, total commits). Read-only.',
				inputSchema: {
					type: 'object',
					properties: {
						workspacePath: {
							type: 'string',
							description: 'Absolute path to workspace directory. Defaults to current directory.'
						}
					}
				}
			},
			{
				name: 'get_git_status',
				description: 'Get current Git branch and working tree status (clean/dirty, staged, modified, untracked files). Read-only.',
				inputSchema: {
					type: 'object',
					properties: {
						workspacePath: {
							type: 'string',
							description: 'Absolute path to workspace directory. Defaults to current directory.'
						}
					}
				}
			},
			{
				name: 'get_staged_diff',
				description: 'Read the staged Git changes (excluding lock files and build artifacts). Safe and read-only.',
				inputSchema: {
					type: 'object',
					properties: {
						workspacePath: {
							type: 'string',
							description: 'Absolute path to workspace directory. Defaults to current directory.'
						}
					}
				}
			},
			{
				name: 'search_commit_history',
				description: 'Search repository commit history by keyword or message. Read-only.',
				inputSchema: {
					type: 'object',
					properties: {
						query: {
							type: 'string',
							description: 'Search keyword to filter commits'
						},
						workspacePath: {
							type: 'string',
							description: 'Absolute path to workspace directory. Defaults to current directory.'
						},
						maxResults: {
							type: 'number',
							description: 'Maximum number of commits to return (default 10, max 50).'
						}
					},
					required: ['query']
				}
			},
			{
				name: 'generate_commit_message_suggestion',
				description: 'Analyze staged changes and generate a Conventional Commit suggestion. NOTE: This is a read-only suggestion and is NOT committed.',
				inputSchema: {
					type: 'object',
					properties: {
						workspacePath: {
							type: 'string',
							description: 'Absolute path to workspace directory. Defaults to current directory.'
						}
					}
				}
			},
			{
				name: 'prepare_pull_request_description',
				description: 'Analyze branch differences and commits against default branch to prepare PR title and description suggestion. NOTE: This is a suggestion only and is NOT submitted to GitHub.',
				inputSchema: {
					type: 'object',
					properties: {
						workspacePath: {
							type: 'string',
							description: 'Absolute path to workspace directory. Defaults to current directory.'
						}
					}
				}
			}
		];
	}

	/**
	 * Executes an MCP tool call and returns formatted output.
	 */
	public async executeTool(name: string, args: Record<string, unknown> = {}): Promise<McpToolCallResult> {
		try {
			const resolvedPath = this.resolveAndValidateWorkspacePath(args.workspacePath as string | undefined);

			const isRepo = await this.gitService.isGitRepository(resolvedPath);
			if (!isRepo) {
				return this.errorResult(`Directory "${resolvedPath}" is not a Git repository.`);
			}

			switch (name) {
				case 'get_repository_info':
					return await this.handleGetRepositoryInfo(resolvedPath);

				case 'get_git_status':
					return await this.handleGetGitStatus(resolvedPath);

				case 'get_staged_diff':
					return await this.handleGetStagedDiff(resolvedPath);

				case 'search_commit_history':
					return await this.handleSearchCommitHistory(resolvedPath, args);

				case 'generate_commit_message_suggestion':
					return await this.handleGenerateCommitMessageSuggestion(resolvedPath);

				case 'prepare_pull_request_description':
					return await this.handlePreparePullRequestDescription(resolvedPath);

				default:
					return this.errorResult(`Unknown tool: "${name}"`);
			}
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : String(error);
			return this.errorResult(`GitIQ MCP tool error: ${msg}`);
		}
	}

	private async handleGetRepositoryInfo(workspacePath: string): Promise<McpToolCallResult> {
		const info = await this.gitService.getRepositoryInfo(workspacePath);
		return this.successResult({
			tool: 'get_repository_info',
			status: 'SUCCESS',
			data: {
				repoName: info.repoName,
				currentBranch: info.currentBranch,
				remoteUrl: info.remoteUrl,
				latestCommit: info.latestCommit,
				totalCommits: info.totalCommits,
				gitStatus: info.gitStatus
			}
		});
	}

	private async handleGetGitStatus(workspacePath: string): Promise<McpToolCallResult> {
		const branch = await this.gitService.getCurrentBranch(workspacePath);
		const stagedDiff = await this.gitService.getStagedDiff(workspacePath);
		const commitHistory = await this.gitService.getCommitHistory(workspacePath, 1);

		return this.successResult({
			tool: 'get_git_status',
			status: 'SUCCESS',
			data: {
				branch,
				hasStagedChanges: stagedDiff.hasChanges,
				stagedDiffLengthChars: stagedDiff.filteredLength,
				latestCommit: commitHistory[0] ? `${commitHistory[0].shortHash} - ${commitHistory[0].subject}` : 'None'
			}
		});
	}

	private async handleGetStagedDiff(workspacePath: string): Promise<McpToolCallResult> {
		const diff = await this.gitService.getStagedDiff(workspacePath);

		if (!diff.hasChanges) {
			return this.successResult({
				tool: 'get_staged_diff',
				hasChanges: false,
				message: 'No staged changes found in repository. Stage files using git add before reading staged diff.',
				diff: ''
			});
		}

		// Security check: ensure no sensitive files were included
		const sanitizedDiff = this.sanitizeDiff(diff.content);

		return this.successResult({
			tool: 'get_staged_diff',
			hasChanges: true,
			originalLength: diff.originalLength,
			filteredLength: diff.filteredLength,
			diff: sanitizedDiff
		});
	}

	private async handleSearchCommitHistory(workspacePath: string, args: Record<string, unknown>): Promise<McpToolCallResult> {
		const query = typeof args.query === 'string' ? args.query.trim() : '';
		if (!query) {
			return this.errorResult('Parameter "query" is required and cannot be empty.');
		}

		if (query.length > 100) {
			return this.errorResult('Query string exceeds maximum allowed length of 100 characters.');
		}

		const maxResults = Math.min(Math.max(Number(args.maxResults) || 10, 1), 50);
		const results = await this.historyService.searchCommitHistory(workspacePath, query);
		const limited = results.slice(0, maxResults);

		return this.successResult({
			tool: 'search_commit_history',
			query,
			totalFound: results.length,
			returnedCount: limited.length,
			commits: limited.map((c) => ({
				hash: c.shortHash,
				author: c.author,
				date: c.date,
				subject: c.subject
			}))
		});
	}

	private async handleGenerateCommitMessageSuggestion(workspacePath: string): Promise<McpToolCallResult> {
		const stagedDiff = await this.gitService.getStagedDiff(workspacePath);

		if (!stagedDiff.hasChanges) {
			return this.successResult({
				tool: 'generate_commit_message_suggestion',
				status: 'NO_CHANGES',
				note: 'No staged changes found. Run git add first.',
				suggestion: null
			});
		}

		// Deterministic template suggestion based on staged files
		const lines = stagedDiff.content.split('\n');
		const filesChanged = lines
			.filter((l) => l.startsWith('diff --git'))
			.map((l) => {
				const parts = l.split(' ');
				return parts[2]?.replace(/^a\//, '') || '';
			})
			.filter(Boolean);

		const primaryFile = filesChanged[0] || 'code';
		const scope = path.basename(primaryFile, path.extname(primaryFile)).toLowerCase();
		const fallbackSubject = `feat(${scope}): update ${path.basename(primaryFile)}`;
		const validation = this.validator.validate(fallbackSubject);

		return this.successResult({
			tool: 'generate_commit_message_suggestion',
			status: 'SUGGESTION_ONLY',
			executed: false,
			note: 'IMPORTANT: This commit message is a suggestion only and has NOT been committed. Human approval required before running git commit.',
			filesChangedCount: filesChanged.length,
			files: filesChanged.slice(0, 10),
			suggestion: {
				subject: validation.sanitized,
				type: validation.type,
				scope: validation.scope,
				description: validation.description
			}
		});
	}

	private async handlePreparePullRequestDescription(workspacePath: string): Promise<McpToolCallResult> {
		const currentBranch = await this.gitService.getCurrentBranch(workspacePath);
		let defaultBranch = 'main';
		try {
			defaultBranch = await this.gitService.getDefaultBranch(workspacePath);
		} catch {
			// default to main
		}

		const branchCommits = await this.gitService.getBranchCommits(workspacePath);
		const branchDiff = await this.gitService.getBranchDiff(workspacePath);

		const titleSuggestion = `Pull Request: ${currentBranch} into ${defaultBranch}`;
		const descriptionSuggestion = [
			`## Summary`,
			`Changes from branch \`${currentBranch}\` to be merged into \`${defaultBranch}\`.`,
			``,
			`### Commits`,
			branchCommits ? branchCommits.split('\n').slice(0, 5).map((c) => `- ${c}`).join('\n') : '- No commits listed',
			``,
			`### Verification Checklist`,
			`- [ ] Code compiles without errors`,
			`- [ ] Tests passed`,
			`- [ ] Changes reviewed`
		].join('\n');

		return this.successResult({
			tool: 'prepare_pull_request_description',
			status: 'SUGGESTION_ONLY',
			executed: false,
			note: 'IMPORTANT: This pull request is a proposal and has NOT been created on GitHub. Human review required.',
			sourceBranch: currentBranch,
			targetBranch: defaultBranch,
			suggestion: {
				title: titleSuggestion,
				description: descriptionSuggestion
			}
		});
	}

	private resolveAndValidateWorkspacePath(inputPath?: string): string {
		const target = inputPath ? path.resolve(inputPath) : process.cwd();
		if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
			throw new Error(`Workspace path "${target}" does not exist or is not a directory.`);
		}
		return target;
	}

	private sanitizeDiff(diff: string): string {
		// Filter out sensitive patterns like PRIVATE KEY or potential secret lines
		return diff
			.split('\n')
			.filter((line) => !/PRIVATE KEY|BEGIN RSA|api[_-]?key\s*[:=]/i.test(line))
			.join('\n');
	}

	private successResult(data: Record<string, unknown>): McpToolCallResult {
		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify(data, null, 2)
				}
			]
		};
	}

	private errorResult(errorMessage: string): McpToolCallResult {
		return {
			isError: true,
			content: [
				{
					type: 'text',
					text: JSON.stringify({ status: 'ERROR', error: errorMessage }, null, 2)
				}
			]
		};
	}
}
