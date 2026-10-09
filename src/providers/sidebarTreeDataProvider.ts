import * as vscode from 'vscode';
import type { GitService } from '../services/gitService';
import { COMMAND_IDS } from '../utils/constants';

/**
 * Tree item representing either a category header or an actionable command in the GitIQ sidebar.
 */
export class GitIQTreeItem extends vscode.TreeItem {
	public children?: GitIQTreeItem[];

	public constructor(
		label: string,
		collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None,
		options?: {
			commandId?: string;
			commandTitle?: string;
			iconName?: string;
			description?: string;
			tooltip?: string;
			contextValue?: string;
			children?: GitIQTreeItem[];
		}
	) {
		super(label, collapsibleState);

		if (options?.iconName) {
			this.iconPath = new vscode.ThemeIcon(options.iconName);
		}

		if (options?.description) {
			this.description = options.description;
		}

		if (options?.tooltip) {
			this.tooltip = options.tooltip;
		}

		if (options?.contextValue) {
			this.contextValue = options.contextValue;
		}

		if (options?.commandId) {
			this.command = {
				command: options.commandId,
				title: options.commandTitle ?? label
			};
		}

		this.children = options?.children;
	}
}

/**
 * Native VS Code TreeDataProvider powering the GitIQ Activity Bar sidebar dashboard.
 * Organizes AI tools, pull request generation, repository commands, history analytics, and settings.
 */
export class SidebarTreeDataProvider
	implements vscode.TreeDataProvider<GitIQTreeItem>, vscode.Disposable
{
	private readonly _onDidChangeTreeData: vscode.EventEmitter<
		GitIQTreeItem | undefined | null | void
	> = new vscode.EventEmitter<GitIQTreeItem | undefined | null | void>();

	public readonly onDidChangeTreeData: vscode.Event<
		GitIQTreeItem | undefined | null | void
	> = this._onDidChangeTreeData.event;

	public constructor(private readonly gitService?: GitService) {}

	/**
	 * Manually triggers a refresh of the sidebar tree.
	 */
	public refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	public getTreeItem(element: GitIQTreeItem): vscode.TreeItem {
		return element;
	}

	public async getChildren(element?: GitIQTreeItem): Promise<GitIQTreeItem[]> {
		if (element) {
			return element.children ?? [];
		}

		// Top-level categories
		const categories: GitIQTreeItem[] = [];

		// Check workspace & Git repository status for the top header banner
		const repoStatusItem = await this.getRepositoryStatusItem();
		if (repoStatusItem) {
			categories.push(repoStatusItem);
		}

		categories.push(
			this.createAIToolsCategory(),
			this.createPullRequestsCategory(),
			this.createGitGitHubCategory(),
			this.createCommitHistoryCategory(),
			this.createAISettingsCategory()
		);

		return categories;
	}

	/**
	 * Returns an informative status tree item when outside a workspace or outside a Git repository.
	 */
	private async getRepositoryStatusItem(): Promise<GitIQTreeItem | undefined> {
		const workspaceFolders = vscode.workspace.workspaceFolders;

		if (!workspaceFolders || workspaceFolders.length === 0) {
			return new GitIQTreeItem('No Workspace Open', vscode.TreeItemCollapsibleState.None, {
				iconName: 'folder',
				description: 'Click to open',
				tooltip: 'Open a project folder to start using GitIQ features.',
				commandId: 'vscode.openFolder',
				commandTitle: 'Open Folder'
			});
		}

		if (this.gitService) {
			try {
				const isRepo = await this.gitService.isGitRepository(
					workspaceFolders[0].uri.fsPath
				);
				if (!isRepo) {
					return new GitIQTreeItem(
						'No Git Repository',
						vscode.TreeItemCollapsibleState.None,
						{
							iconName: 'warning',
							description: 'Check status',
							tooltip:
								'Workspace is not a Git repository. Click to run repository verification.',
							commandId: COMMAND_IDS.checkGitRepository,
							commandTitle: 'Check Git Repository'
						}
					);
				}
			} catch {
				// Non-blocking; continue to render categories
			}
		}

		return undefined;
	}

	private createAIToolsCategory(): GitIQTreeItem {
		const children: GitIQTreeItem[] = [
			new GitIQTreeItem(
				'Generate Commit Message',
				vscode.TreeItemCollapsibleState.None,
				{
					commandId: COMMAND_IDS.generateCommitMessage,
					commandTitle: 'Generate Commit Message',
					iconName: 'sparkle',
					tooltip: 'Analyze staged changes and generate a Conventional Commit message using AI.'
				}
			),
			new GitIQTreeItem(
				'Preview Staged Diff',
				vscode.TreeItemCollapsibleState.None,
				{
					commandId: COMMAND_IDS.previewGitDiff,
					commandTitle: 'Preview Git Diff',
					iconName: 'diff',
					tooltip: 'Preview clean, filtered staged Git diff changes before committing.'
				}
			),
			new GitIQTreeItem(
				'Explain Commit',
				vscode.TreeItemCollapsibleState.None,
				{
					commandId: COMMAND_IDS.explainCommit,
					commandTitle: 'Explain Commit',
					iconName: 'comment-discussion',
					tooltip: 'Select a commit from history and generate an AI explanation of its changes.'
				}
			),
			new GitIQTreeItem(
				'AI Code Review',
				vscode.TreeItemCollapsibleState.None,
				{
					commandId: COMMAND_IDS.aiCodeReview,
					commandTitle: 'AI Code Review',
					iconName: 'beaker',
					description: '(Planned)',
					tooltip: 'Automated AI code review for staged diffs (planned for an upcoming release).'
				}
			)
		];

		return new GitIQTreeItem('AI Tools', vscode.TreeItemCollapsibleState.Expanded, {
			iconName: 'hubot',
			tooltip: 'AI-assisted commit messages, diff analysis, and commit explanations.',
			children
		});
	}

	private createPullRequestsCategory(): GitIQTreeItem {
		const children: GitIQTreeItem[] = [
			new GitIQTreeItem(
				'Generate Pull Request',
				vscode.TreeItemCollapsibleState.None,
				{
					commandId: COMMAND_IDS.generatePullRequest,
					commandTitle: 'Generate Pull Request',
					iconName: 'git-pull-request',
					tooltip: 'Generate complete pull request title, summary, description, and checklist with AI.'
				}
			),
			new GitIQTreeItem(
				'Open Pull Request Page',
				vscode.TreeItemCollapsibleState.None,
				{
					commandId: COMMAND_IDS.openPullRequestPage,
					commandTitle: 'Open Pull Request Page',
					iconName: 'link-external',
					tooltip: 'Open the GitHub compare and pull request creation page in your browser.'
				}
			),
			new GitIQTreeItem(
				'Copy PR Title',
				vscode.TreeItemCollapsibleState.None,
				{
					commandId: COMMAND_IDS.copyPRTitle,
					commandTitle: 'Copy PR Title',
					iconName: 'copy',
					tooltip: 'Copy the generated PR title to your clipboard.'
				}
			),
			new GitIQTreeItem(
				'Copy PR Description',
				vscode.TreeItemCollapsibleState.None,
				{
					commandId: COMMAND_IDS.copyPRDescription,
					commandTitle: 'Copy PR Description',
					iconName: 'clippy',
					tooltip: 'Copy the generated PR description markdown to your clipboard.'
				}
			),
			new GitIQTreeItem(
				'Copy Entire PR',
				vscode.TreeItemCollapsibleState.None,
				{
					commandId: COMMAND_IDS.copyEntirePullRequest,
					commandTitle: 'Copy Entire Pull Request',
					iconName: 'files',
					tooltip: 'Copy the entire generated pull request document to your clipboard.'
				}
			),
			new GitIQTreeItem(
				'Save Pull Request',
				vscode.TreeItemCollapsibleState.None,
				{
					commandId: COMMAND_IDS.savePullRequest,
					commandTitle: 'Save Pull Request',
					iconName: 'save',
					tooltip: 'Save the generated pull request as pull-request.md in workspace root.'
				}
			)
		];

		return new GitIQTreeItem(
			'Pull Requests',
			vscode.TreeItemCollapsibleState.Expanded,
			{
				iconName: 'git-pull-request',
				tooltip: 'Create, review, copy, and export GitHub pull requests.',
				children
			}
		);
	}

	private createGitGitHubCategory(): GitIQTreeItem {
		const children: GitIQTreeItem[] = [
			new GitIQTreeItem(
				'Show Current Branch',
				vscode.TreeItemCollapsibleState.None,
				{
					commandId: COMMAND_IDS.currentBranch,
					commandTitle: 'Show Current Branch',
					iconName: 'git-branch',
					tooltip: 'Display the active Git branch name in the status notification.'
				}
			),
			new GitIQTreeItem(
				'Repository Information',
				vscode.TreeItemCollapsibleState.None,
				{
					commandId: COMMAND_IDS.repositoryInfo,
					commandTitle: 'Repository Information',
					iconName: 'info',
					tooltip: 'View an overview of repository branch, remote URL, commit count, and status.'
				}
			),
			new GitIQTreeItem(
				'Push Branch',
				vscode.TreeItemCollapsibleState.None,
				{
					commandId: COMMAND_IDS.push,
					commandTitle: 'Push Branch',
					iconName: 'repo-push',
					tooltip: 'Push current branch commits to the remote origin.'
				}
			),
			new GitIQTreeItem(
				'Pull Branch',
				vscode.TreeItemCollapsibleState.None,
				{
					commandId: COMMAND_IDS.pull,
					commandTitle: 'Pull Branch',
					iconName: 'repo-pull',
					tooltip: 'Pull incoming updates from the remote tracking branch.'
				}
			),
			new GitIQTreeItem(
				'Fetch Updates',
				vscode.TreeItemCollapsibleState.None,
				{
					commandId: COMMAND_IDS.fetch,
					commandTitle: 'Fetch Updates',
					iconName: 'repo-sync',
					tooltip: 'Fetch branches and tags from remote origin without merging.'
				}
			),
			new GitIQTreeItem(
				'Open GitHub Repository',
				vscode.TreeItemCollapsibleState.None,
				{
					commandId: COMMAND_IDS.openRepository,
					commandTitle: 'Open GitHub Repository',
					iconName: 'github-inverted',
					tooltip: 'Open the remote GitHub repository in your default web browser.'
				}
			),
			new GitIQTreeItem(
				'Open Current Branch on GitHub',
				vscode.TreeItemCollapsibleState.None,
				{
					commandId: COMMAND_IDS.openBranch,
					commandTitle: 'Open Current Branch on GitHub',
					iconName: 'globe',
					tooltip: 'Open the current branch tree view on GitHub.'
				}
			)
		];

		return new GitIQTreeItem(
			'Git & GitHub',
			vscode.TreeItemCollapsibleState.Expanded,
			{
				iconName: 'source-control',
				tooltip: 'Quick branch, remote, push, pull, fetch, and GitHub navigation actions.',
				children
			}
		);
	}

	private createCommitHistoryCategory(): GitIQTreeItem {
		const children: GitIQTreeItem[] = [
			new GitIQTreeItem(
				'View Commit History',
				vscode.TreeItemCollapsibleState.None,
				{
					commandId: COMMAND_IDS.viewCommitHistory,
					commandTitle: 'View Commit History',
					iconName: 'history',
					tooltip: 'Browse commit history with interactive QuickPick search and detail view.'
				}
			),
			new GitIQTreeItem(
				'Search Commit History',
				vscode.TreeItemCollapsibleState.None,
				{
					commandId: COMMAND_IDS.searchCommitHistory,
					commandTitle: 'Search Commit History',
					iconName: 'search',
					tooltip: 'Search commit history offline by commit message, author, or keyword.'
				}
			),
			new GitIQTreeItem(
				'Commit Statistics',
				vscode.TreeItemCollapsibleState.None,
				{
					commandId: COMMAND_IDS.commitStatistics,
					commandTitle: 'Commit Statistics',
					iconName: 'graph',
					tooltip: 'View summary statistics: total commits, contributors, and active branches.'
				}
			),
			new GitIQTreeItem(
				'Top Contributors',
				vscode.TreeItemCollapsibleState.None,
				{
					commandId: COMMAND_IDS.topContributors,
					commandTitle: 'Top Contributors',
					iconName: 'organization',
					tooltip: 'View ranked list of top repository contributors and commit counts.'
				}
			),
			new GitIQTreeItem(
				'Commit Activity',
				vscode.TreeItemCollapsibleState.None,
				{
					commandId: COMMAND_IDS.commitActivity,
					commandTitle: 'Commit Activity',
					iconName: 'pulse',
					tooltip: 'View 7-day commit activity frequency table.'
				}
			),
			new GitIQTreeItem(
				'Export History Report',
				vscode.TreeItemCollapsibleState.None,
				{
					commandId: COMMAND_IDS.exportHistoryReport,
					commandTitle: 'Export History Report',
					iconName: 'file-text',
					tooltip: 'Export complete commit history metrics to commit-history-report.md.'
				}
			)
		];

		return new GitIQTreeItem(
			'Commit History',
			vscode.TreeItemCollapsibleState.Expanded,
			{
				iconName: 'git-commit',
				tooltip: 'Offline commit analytics, searches, contributor insights, and reports.',
				children
			}
		);
	}

	private createAISettingsCategory(): GitIQTreeItem {
		const children: GitIQTreeItem[] = [
			new GitIQTreeItem('Set API Key', vscode.TreeItemCollapsibleState.None, {
				commandId: COMMAND_IDS.setApiKey,
				commandTitle: 'Set Groq API Key',
				iconName: 'key',
				tooltip: 'Configure Groq API key securely in VS Code SecretStorage.'
			}),
			new GitIQTreeItem('Update API Key', vscode.TreeItemCollapsibleState.None, {
				commandId: COMMAND_IDS.updateApiKey,
				commandTitle: 'Update Groq API Key',
				iconName: 'edit',
				tooltip: 'Update existing Groq API key stored in VS Code SecretStorage.'
			}),
			new GitIQTreeItem('Remove API Key', vscode.TreeItemCollapsibleState.None, {
				commandId: COMMAND_IDS.removeApiKey,
				commandTitle: 'Remove Groq API Key',
				iconName: 'trash',
				tooltip: 'Remove Groq API key from VS Code SecretStorage.'
			}),
			new GitIQTreeItem('Select AI Model', vscode.TreeItemCollapsibleState.None, {
				commandId: COMMAND_IDS.selectModel,
				commandTitle: 'Select Groq Model',
				iconName: 'gear',
				tooltip: 'Choose AI model (e.g. llama-3.3-70b-versatile, mixtral, etc.).'
			})
		];

		return new GitIQTreeItem('AI Settings', vscode.TreeItemCollapsibleState.Expanded, {
			iconName: 'settings-gear',
			tooltip: 'Secure API key management and AI model configuration.',
			children
		});
	}

	public dispose(): void {
		this._onDidChangeTreeData.dispose();
	}
}
