import * as path from 'node:path';
import * as vscode from 'vscode';
import type { GitService } from '../services/gitService';
import { COMMAND_IDS } from '../utils/constants';

/**
 * Tree item representing a header, category, or actionable command in the GitIQ sidebar.
 * Includes stable IDs so VS Code reliably persists user expansion/collapse state.
 */
export class GitIQTreeItem extends vscode.TreeItem {
	public children?: GitIQTreeItem[];

	public constructor(
		label: string,
		collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None,
		options?: {
			id?: string;
			commandId?: string;
			commandTitle?: string;
			iconName?: string;
			iconUri?: vscode.Uri;
			description?: string;
			tooltip?: string;
			contextValue?: string;
			children?: GitIQTreeItem[];
		}
	) {
		super(label, collapsibleState);

		if (options?.id) {
			this.id = options.id;
		}

		if (options?.iconUri) {
			this.iconPath = options.iconUri;
		} else if (options?.iconName) {
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
 * Compact by default: only Primary Actions are expanded initially.
 * All secondary categories are collapsed by default and their expansion state is persisted via stable IDs.
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

	public constructor(
		private readonly gitService?: GitService,
		private readonly extensionUri?: vscode.Uri
	) {}

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

		const items: GitIQTreeItem[] = [];

		// 1. Compact Branded Header
		items.push(this.createHeaderItem());

		// 2. Compact Repository Summary
		const repoStatusItem = await this.getRepositoryStatusItem();
		items.push(repoStatusItem);

		// 3. Quick Actions (Expanded by default, top 3 workflows)
		items.push(this.createQuickActionsCategory());

		// 4. Secondary Sections (All COLLAPSED by default)
		items.push(
			this.createGitGitHubCategory(),
			this.createPullRequestsCategory(),
			this.createCommitAnalyticsCategory(),
			this.createAIToolsCategory(),
			this.createAISettingsCategory()
		);

		return items;
	}

	/**
	 * Compact header showing GitIQ logo and subtitle.
	 */
	private createHeaderItem(): GitIQTreeItem {
		const iconUri = this.extensionUri
			? vscode.Uri.joinPath(this.extensionUri, 'resources', 'icon.svg')
			: undefined;

		return new GitIQTreeItem('GitIQ', vscode.TreeItemCollapsibleState.None, {
			id: 'gitiq.header',
			description: 'AI Git Assistant',
			iconUri,
			iconName: iconUri ? undefined : 'hubot',
			tooltip: 'GitIQ — AI Git Assistant for Visual Studio Code\nClick to view repository info.',
			commandId: COMMAND_IDS.repositoryInfo,
			commandTitle: 'Repository Information'
		});
	}

	/**
	 * Compact repository summary showing real repo name & branch without opening markdown automatically.
	 */
	private async getRepositoryStatusItem(): Promise<GitIQTreeItem> {
		const workspaceFolders = vscode.workspace.workspaceFolders;

		if (!workspaceFolders || workspaceFolders.length === 0) {
			return new GitIQTreeItem('No Workspace Open', vscode.TreeItemCollapsibleState.None, {
				id: 'gitiq.repoStatus',
				description: 'Open folder',
				iconName: 'folder-opened',
				tooltip: 'No workspace folder is currently open.\nClick to open a folder.',
				commandId: 'vscode.openFolder',
				commandTitle: 'Open Folder'
			});
		}

		const workspacePath = workspaceFolders[0].uri.fsPath;
		const folderName = path.basename(workspacePath);

		if (this.gitService) {
			try {
				const isRepo = await this.gitService.isGitRepository(workspacePath);
				if (!isRepo) {
					return new GitIQTreeItem('No Git Repository', vscode.TreeItemCollapsibleState.None, {
						id: 'gitiq.repoStatus',
						description: 'Not detected',
						iconName: 'warning',
						tooltip: `Folder "${folderName}" is not a Git repository.\nClick to run Git repository verification.`,
						commandId: COMMAND_IDS.checkGitRepository,
						commandTitle: 'Check Git Repository'
					});
				}

				// Real repository data
				let repoName = folderName;
				try {
					const remoteUrl = await this.gitService.getRemoteUrl(workspacePath);
					if (remoteUrl) {
						const match = remoteUrl.match(/[:/]([^/:]+\/[^/:]+?)(?:\.git)?$/);
						if (match && match[1]) {
							repoName = match[1];
						}
					}
				} catch {
					// Fallback to directory name
				}

				let currentBranch = 'HEAD';
				try {
					currentBranch = await this.gitService.getCurrentBranch(workspacePath);
				} catch {
					currentBranch = 'unknown';
				}

				return new GitIQTreeItem(repoName, vscode.TreeItemCollapsibleState.None, {
					id: 'gitiq.repoStatus',
					description: currentBranch,
					iconName: 'repo',
					tooltip: `Repository: ${repoName}\nBranch: ${currentBranch}\nStatus: Active Git repository\nClick to view full repository details.`,
					commandId: COMMAND_IDS.repositoryInfo,
					commandTitle: 'Repository Information'
				});
			} catch {
				// Non-blocking fallback
			}
		}

		return new GitIQTreeItem(folderName, vscode.TreeItemCollapsibleState.None, {
			id: 'gitiq.repoStatus',
			description: 'Active',
			iconName: 'repo',
			tooltip: 'Click to view repository details.',
			commandId: COMMAND_IDS.repositoryInfo,
			commandTitle: 'Repository Information'
		});
	}

	/**
	 * Primary actions section — immediately accessible without scrolling.
	 */
	private createQuickActionsCategory(): GitIQTreeItem {
		const children: GitIQTreeItem[] = [
			new GitIQTreeItem('AI Commit', vscode.TreeItemCollapsibleState.None, {
				id: 'gitiq.qa.aiCommit',
				commandId: COMMAND_IDS.generateCommitMessage,
				commandTitle: 'Generate Commit Message',
				iconName: 'sparkle',
				tooltip: 'Analyze staged changes and generate a Conventional Commit message with AI.'
			}),
			new GitIQTreeItem('Create PR', vscode.TreeItemCollapsibleState.None, {
				id: 'gitiq.qa.createPr',
				commandId: COMMAND_IDS.generatePullRequest,
				commandTitle: 'Generate Pull Request',
				iconName: 'git-pull-request',
				tooltip: 'Generate complete pull request title, description, and checklist with AI.'
			}),
			new GitIQTreeItem('Commit History', vscode.TreeItemCollapsibleState.None, {
				id: 'gitiq.qa.commitHistory',
				commandId: COMMAND_IDS.viewCommitHistory,
				commandTitle: 'View Commit History',
				iconName: 'history',
				tooltip: 'Browse recent commit history with interactive search and detail view.'
			})
		];

		return new GitIQTreeItem('Quick Actions', vscode.TreeItemCollapsibleState.Expanded, {
			id: 'gitiq.group.quickActions',
			iconName: 'zap',
			tooltip: 'Primary GitIQ workflows.',
			children
		});
	}

	/**
	 * Git & GitHub section — COLLAPSED by default.
	 */
	private createGitGitHubCategory(): GitIQTreeItem {
		const children: GitIQTreeItem[] = [
			new GitIQTreeItem('Current Branch', vscode.TreeItemCollapsibleState.None, {
				id: 'gitiq.git.currentBranch',
				commandId: COMMAND_IDS.currentBranch,
				commandTitle: 'Show Current Branch',
				iconName: 'git-branch',
				tooltip: 'Display the active Git branch name in the status notification.'
			}),
			new GitIQTreeItem('Repository Info', vscode.TreeItemCollapsibleState.None, {
				id: 'gitiq.git.repoInfo',
				commandId: COMMAND_IDS.repositoryInfo,
				commandTitle: 'Repository Information',
				iconName: 'info',
				tooltip: 'View an overview of repository branch, remote URL, commit count, and status.'
			}),
			new GitIQTreeItem('Push', vscode.TreeItemCollapsibleState.None, {
				id: 'gitiq.git.push',
				commandId: COMMAND_IDS.push,
				commandTitle: 'Push Branch',
				iconName: 'repo-push',
				tooltip: 'Push current branch commits to the remote origin.'
			}),
			new GitIQTreeItem('Pull', vscode.TreeItemCollapsibleState.None, {
				id: 'gitiq.git.pull',
				commandId: COMMAND_IDS.pull,
				commandTitle: 'Pull Branch',
				iconName: 'repo-pull',
				tooltip: 'Pull incoming updates from the remote tracking branch.'
			}),
			new GitIQTreeItem('Fetch', vscode.TreeItemCollapsibleState.None, {
				id: 'gitiq.git.fetch',
				commandId: COMMAND_IDS.fetch,
				commandTitle: 'Fetch Updates',
				iconName: 'repo-sync',
				tooltip: 'Fetch branches and tags from remote origin without merging.'
			}),
			new GitIQTreeItem('Open on GitHub', vscode.TreeItemCollapsibleState.None, {
				id: 'gitiq.git.openRepo',
				commandId: COMMAND_IDS.openRepository,
				commandTitle: 'Open GitHub Repository',
				iconName: 'github-inverted',
				tooltip: 'Open the remote GitHub repository in your default web browser.'
			}),
			new GitIQTreeItem('Open Branch on GitHub', vscode.TreeItemCollapsibleState.None, {
				id: 'gitiq.git.openBranch',
				commandId: COMMAND_IDS.openBranch,
				commandTitle: 'Open Current Branch on GitHub',
				iconName: 'globe',
				tooltip: 'Open the current branch tree view on GitHub.'
			})
		];

		return new GitIQTreeItem('Git & GitHub', vscode.TreeItemCollapsibleState.Collapsed, {
			id: 'gitiq.group.gitGitHub',
			iconName: 'source-control',
			tooltip: 'Branch, remote, push, pull, fetch, and GitHub navigation actions.',
			children
		});
	}

	/**
	 * Pull Requests section — COLLAPSED by default.
	 */
	private createPullRequestsCategory(): GitIQTreeItem {
		const children: GitIQTreeItem[] = [
			new GitIQTreeItem('Create PR', vscode.TreeItemCollapsibleState.None, {
				id: 'gitiq.pr.generatePr',
				commandId: COMMAND_IDS.generatePullRequest,
				commandTitle: 'Generate Pull Request',
				iconName: 'git-pull-request',
				tooltip: 'Generate complete pull request title, summary, description, and checklist with AI.'
			}),
			new GitIQTreeItem('Open PR Page', vscode.TreeItemCollapsibleState.None, {
				id: 'gitiq.pr.openPage',
				commandId: COMMAND_IDS.openPullRequestPage,
				commandTitle: 'Open Pull Request Page',
				iconName: 'link-external',
				tooltip: 'Open the GitHub compare and pull request creation page in your browser.'
			}),
			new GitIQTreeItem('Copy PR Title', vscode.TreeItemCollapsibleState.None, {
				id: 'gitiq.pr.copyTitle',
				commandId: COMMAND_IDS.copyPRTitle,
				commandTitle: 'Copy PR Title',
				iconName: 'copy',
				tooltip: 'Copy the generated PR title to your clipboard.'
			}),
			new GitIQTreeItem('Copy PR Description', vscode.TreeItemCollapsibleState.None, {
				id: 'gitiq.pr.copyDesc',
				commandId: COMMAND_IDS.copyPRDescription,
				commandTitle: 'Copy PR Description',
				iconName: 'clippy',
				tooltip: 'Copy the generated PR description markdown to your clipboard.'
			}),
			new GitIQTreeItem('Copy Entire PR', vscode.TreeItemCollapsibleState.None, {
				id: 'gitiq.pr.copyEntire',
				commandId: COMMAND_IDS.copyEntirePullRequest,
				commandTitle: 'Copy Entire Pull Request',
				iconName: 'files',
				tooltip: 'Copy the entire generated pull request document to your clipboard.'
			}),
			new GitIQTreeItem('Save PR', vscode.TreeItemCollapsibleState.None, {
				id: 'gitiq.pr.save',
				commandId: COMMAND_IDS.savePullRequest,
				commandTitle: 'Save Pull Request',
				iconName: 'save',
				tooltip: 'Save the generated pull request as pull-request.md in workspace root.'
			})
		];

		return new GitIQTreeItem('Pull Requests', vscode.TreeItemCollapsibleState.Collapsed, {
			id: 'gitiq.group.pullRequests',
			iconName: 'git-pull-request',
			tooltip: 'Create, review, copy, and export GitHub pull requests.',
			children
		});
	}

	/**
	 * Commit Analytics section — COLLAPSED by default.
	 */
	private createCommitAnalyticsCategory(): GitIQTreeItem {
		const children: GitIQTreeItem[] = [
			new GitIQTreeItem('Search Commits', vscode.TreeItemCollapsibleState.None, {
				id: 'gitiq.analytics.search',
				commandId: COMMAND_IDS.searchCommitHistory,
				commandTitle: 'Search Commit History',
				iconName: 'search',
				tooltip: 'Search commit history offline by commit message, author, or keyword.'
			}),
			new GitIQTreeItem('Commit Statistics', vscode.TreeItemCollapsibleState.None, {
				id: 'gitiq.analytics.stats',
				commandId: COMMAND_IDS.commitStatistics,
				commandTitle: 'Commit Statistics',
				iconName: 'graph',
				tooltip: 'View summary statistics: total commits, contributors, and active branches.'
			}),
			new GitIQTreeItem('Top Contributors', vscode.TreeItemCollapsibleState.None, {
				id: 'gitiq.analytics.contributors',
				commandId: COMMAND_IDS.topContributors,
				commandTitle: 'Top Contributors',
				iconName: 'organization',
				tooltip: 'View ranked list of top repository contributors and commit counts.'
			}),
			new GitIQTreeItem('Commit Activity', vscode.TreeItemCollapsibleState.None, {
				id: 'gitiq.analytics.activity',
				commandId: COMMAND_IDS.commitActivity,
				commandTitle: 'Commit Activity',
				iconName: 'pulse',
				tooltip: 'View 7-day commit activity frequency table.'
			}),
			new GitIQTreeItem('Export Report', vscode.TreeItemCollapsibleState.None, {
				id: 'gitiq.analytics.export',
				commandId: COMMAND_IDS.exportHistoryReport,
				commandTitle: 'Export History Report',
				iconName: 'file-text',
				tooltip: 'Export complete commit history metrics to commit-history-report.md.'
			})
		];

		return new GitIQTreeItem('Commit Analytics', vscode.TreeItemCollapsibleState.Collapsed, {
			id: 'gitiq.group.commitAnalytics',
			iconName: 'graph',
			tooltip: 'Offline commit analytics, searches, contributor insights, and reports.',
			children
		});
	}

	/**
	 * AI Tools section — COLLAPSED by default.
	 */
	private createAIToolsCategory(): GitIQTreeItem {
		const children: GitIQTreeItem[] = [
			new GitIQTreeItem('Preview Staged Diff', vscode.TreeItemCollapsibleState.None, {
				id: 'gitiq.ai.previewDiff',
				commandId: COMMAND_IDS.previewGitDiff,
				commandTitle: 'Preview Git Diff',
				iconName: 'diff',
				tooltip: 'Preview clean, filtered staged Git diff changes before committing.'
			}),
			new GitIQTreeItem('Explain Commit', vscode.TreeItemCollapsibleState.None, {
				id: 'gitiq.ai.explainCommit',
				commandId: COMMAND_IDS.explainCommit,
				commandTitle: 'Explain Commit',
				iconName: 'comment-discussion',
				tooltip: 'Select a commit from history and generate an AI explanation of its changes.'
			})
		];

		return new GitIQTreeItem('AI Tools', vscode.TreeItemCollapsibleState.Collapsed, {
			id: 'gitiq.group.aiTools',
			iconName: 'sparkle',
			tooltip: 'Secondary AI utilities including diff previews and commit explanations.',
			children
		});
	}

	/**
	 * AI Settings section — COLLAPSED by default.
	 */
	private createAISettingsCategory(): GitIQTreeItem {
		const children: GitIQTreeItem[] = [
			new GitIQTreeItem('Set API Key', vscode.TreeItemCollapsibleState.None, {
				id: 'gitiq.settings.setKey',
				commandId: COMMAND_IDS.setApiKey,
				commandTitle: 'Set Groq API Key',
				iconName: 'key',
				tooltip: 'Configure Groq API key securely in VS Code SecretStorage.'
			}),
			new GitIQTreeItem('Update API Key', vscode.TreeItemCollapsibleState.None, {
				id: 'gitiq.settings.updateKey',
				commandId: COMMAND_IDS.updateApiKey,
				commandTitle: 'Update Groq API Key',
				iconName: 'edit',
				tooltip: 'Update existing Groq API key stored in VS Code SecretStorage.'
			}),
			new GitIQTreeItem('Remove API Key', vscode.TreeItemCollapsibleState.None, {
				id: 'gitiq.settings.removeKey',
				commandId: COMMAND_IDS.removeApiKey,
				commandTitle: 'Remove Groq API Key',
				iconName: 'trash',
				tooltip: 'Remove Groq API key from VS Code SecretStorage.'
			}),
			new GitIQTreeItem('Select AI Model', vscode.TreeItemCollapsibleState.None, {
				id: 'gitiq.settings.selectModel',
				commandId: COMMAND_IDS.selectModel,
				commandTitle: 'Select Groq Model',
				iconName: 'gear',
				tooltip: 'Choose active AI model (e.g. llama-3.3-70b-versatile).'
			})
		];

		return new GitIQTreeItem('AI Settings', vscode.TreeItemCollapsibleState.Collapsed, {
			id: 'gitiq.group.aiSettings',
			iconName: 'settings-gear',
			tooltip: 'Secure API key management and AI model configuration.',
			children
		});
	}

	public dispose(): void {
		this._onDidChangeTreeData.dispose();
	}
}
