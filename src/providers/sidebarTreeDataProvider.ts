import * as path from 'node:path';
import * as vscode from 'vscode';
import type { GitService } from '../services/gitService';
import { COMMAND_IDS } from '../utils/constants';

/**
 * Tree item representing a header, category, or actionable command in the GitIQ sidebar.
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
			iconUri?: vscode.Uri;
			description?: string;
			tooltip?: string;
			contextValue?: string;
			children?: GitIQTreeItem[];
		}
	) {
		super(label, collapsibleState);

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
 * Designed for high information density, clean visual hierarchy, and instant access to top workflows.
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

		// 1. Sidebar Header (Branded identity & subtitle)
		items.push(this.createHeaderItem());

		// 2. Repository Status (Live summary or empty state)
		const repoStatusItem = await this.getRepositoryStatusItem();
		items.push(repoStatusItem);

		// 3. Quick Actions (High-frequency actions expanded at top)
		items.push(this.createQuickActionsCategory());

		// 4. Remaining tools organized into concise, collapsed categories
		items.push(
			this.createGitGitHubCategory(),
			this.createPullRequestsCategory(),
			this.createCommitAnalyticsCategory(),
			this.createAISettingsCategory(),
			this.createAdditionalAIToolsCategory()
		);

		return items;
	}

	/**
	 * Header item showing GitIQ product name and subtitle.
	 */
	private createHeaderItem(): GitIQTreeItem {
		const iconUri = this.extensionUri
			? vscode.Uri.joinPath(this.extensionUri, 'resources', 'icon.svg')
			: undefined;

		return new GitIQTreeItem('GitIQ', vscode.TreeItemCollapsibleState.None, {
			description: 'AI Git Assistant',
			iconUri,
			iconName: iconUri ? undefined : 'hubot',
			tooltip: 'GitIQ — AI Git Assistant for Visual Studio Code\nClick to view repository overview.',
			commandId: COMMAND_IDS.repositoryInfo,
			commandTitle: 'Repository Information'
		});
	}

	/**
	 * Returns a live repository summary or an informative empty state.
	 */
	private async getRepositoryStatusItem(): Promise<GitIQTreeItem> {
		const workspaceFolders = vscode.workspace.workspaceFolders;

		if (!workspaceFolders || workspaceFolders.length === 0) {
			return new GitIQTreeItem('No Workspace Open', vscode.TreeItemCollapsibleState.None, {
				description: 'Open a project',
				iconName: 'folder-opened',
				tooltip: 'No workspace folder is currently open.\nClick to open a folder and start using GitIQ.',
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
						description: 'Not detected',
						iconName: 'warning',
						tooltip: `The active folder "${folderName}" is not a Git repository.\nClick to run Git repository verification.`,
						commandId: COMMAND_IDS.checkGitRepository,
						commandTitle: 'Check Git Repository'
					});
				}

				// Real repository data: get remote name or folder name and current branch
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
					// Fall back to folder name
				}

				let currentBranch = 'HEAD';
				try {
					currentBranch = await this.gitService.getCurrentBranch(workspacePath);
				} catch {
					currentBranch = 'unknown';
				}

				return new GitIQTreeItem(repoName, vscode.TreeItemCollapsibleState.None, {
					description: `${currentBranch} • Active`,
					iconName: 'repo',
					tooltip: `Repository: ${repoName}\nBranch: ${currentBranch}\nStatus: Git detected & ready\nClick to view full repository details.`,
					commandId: COMMAND_IDS.repositoryInfo,
					commandTitle: 'Repository Information'
				});
			} catch {
				// Non-blocking fallback
			}
		}

		return new GitIQTreeItem(folderName, vscode.TreeItemCollapsibleState.None, {
			description: 'Git Status Ready',
			iconName: 'repo',
			tooltip: 'Click to view repository information.',
			commandId: COMMAND_IDS.repositoryInfo,
			commandTitle: 'Repository Information'
		});
	}

	/**
	 * Top prioritized actions (expanded by default for instant access).
	 */
	private createQuickActionsCategory(): GitIQTreeItem {
		const children: GitIQTreeItem[] = [
			new GitIQTreeItem('AI Commit', vscode.TreeItemCollapsibleState.None, {
				commandId: COMMAND_IDS.generateCommitMessage,
				commandTitle: 'Generate Commit Message',
				iconName: 'sparkle',
				description: 'Generate & commit',
				tooltip: 'Analyze staged changes and generate a Conventional Commit message with AI.'
			}),
			new GitIQTreeItem('Create PR', vscode.TreeItemCollapsibleState.None, {
				commandId: COMMAND_IDS.generatePullRequest,
				commandTitle: 'Generate Pull Request',
				iconName: 'git-pull-request',
				description: 'Generate with AI',
				tooltip: 'Generate complete pull request title, description, and checklist with AI.'
			}),
			new GitIQTreeItem('Commit History', vscode.TreeItemCollapsibleState.None, {
				commandId: COMMAND_IDS.viewCommitHistory,
				commandTitle: 'View Commit History',
				iconName: 'history',
				description: 'Explore log',
				tooltip: 'Browse recent commit history with interactive QuickPick search and detail view.'
			})
		];

		return new GitIQTreeItem('Quick Actions', vscode.TreeItemCollapsibleState.Expanded, {
			iconName: 'zap',
			tooltip: 'High-frequency AI and Git actions.',
			children
		});
	}

	/**
	 * Git & GitHub section (collapsed by default).
	 */
	private createGitGitHubCategory(): GitIQTreeItem {
		const children: GitIQTreeItem[] = [
			new GitIQTreeItem('Current Branch', vscode.TreeItemCollapsibleState.None, {
				commandId: COMMAND_IDS.currentBranch,
				commandTitle: 'Show Current Branch',
				iconName: 'git-branch',
				tooltip: 'Display the active Git branch name in the status notification.'
			}),
			new GitIQTreeItem('Repository Info', vscode.TreeItemCollapsibleState.None, {
				commandId: COMMAND_IDS.repositoryInfo,
				commandTitle: 'Repository Information',
				iconName: 'info',
				tooltip: 'View an overview of repository branch, remote URL, commit count, and status.'
			}),
			new GitIQTreeItem('Push', vscode.TreeItemCollapsibleState.None, {
				commandId: COMMAND_IDS.push,
				commandTitle: 'Push Branch',
				iconName: 'repo-push',
				tooltip: 'Push current branch commits to the remote origin.'
			}),
			new GitIQTreeItem('Pull', vscode.TreeItemCollapsibleState.None, {
				commandId: COMMAND_IDS.pull,
				commandTitle: 'Pull Branch',
				iconName: 'repo-pull',
				tooltip: 'Pull incoming updates from the remote tracking branch.'
			}),
			new GitIQTreeItem('Fetch', vscode.TreeItemCollapsibleState.None, {
				commandId: COMMAND_IDS.fetch,
				commandTitle: 'Fetch Updates',
				iconName: 'repo-sync',
				tooltip: 'Fetch branches and tags from remote origin without merging.'
			}),
			new GitIQTreeItem('Open on GitHub', vscode.TreeItemCollapsibleState.None, {
				commandId: COMMAND_IDS.openRepository,
				commandTitle: 'Open GitHub Repository',
				iconName: 'github-inverted',
				tooltip: 'Open the remote GitHub repository in your default web browser.'
			}),
			new GitIQTreeItem('Open Branch on GitHub', vscode.TreeItemCollapsibleState.None, {
				commandId: COMMAND_IDS.openBranch,
				commandTitle: 'Open Current Branch on GitHub',
				iconName: 'globe',
				tooltip: 'Open the current branch tree view on GitHub.'
			})
		];

		return new GitIQTreeItem('Git & GitHub', vscode.TreeItemCollapsibleState.Collapsed, {
			iconName: 'source-control',
			tooltip: 'Branch, remote, push, pull, fetch, and GitHub navigation actions.',
			children
		});
	}

	/**
	 * Pull Requests section (collapsed by default).
	 */
	private createPullRequestsCategory(): GitIQTreeItem {
		const children: GitIQTreeItem[] = [
			new GitIQTreeItem('Generate PR', vscode.TreeItemCollapsibleState.None, {
				commandId: COMMAND_IDS.generatePullRequest,
				commandTitle: 'Generate Pull Request',
				iconName: 'git-pull-request',
				tooltip: 'Generate complete pull request title, summary, description, and checklist with AI.'
			}),
			new GitIQTreeItem('Open PR Page', vscode.TreeItemCollapsibleState.None, {
				commandId: COMMAND_IDS.openPullRequestPage,
				commandTitle: 'Open Pull Request Page',
				iconName: 'link-external',
				tooltip: 'Open the GitHub compare and pull request creation page in your browser.'
			}),
			new GitIQTreeItem('Copy PR Title', vscode.TreeItemCollapsibleState.None, {
				commandId: COMMAND_IDS.copyPRTitle,
				commandTitle: 'Copy PR Title',
				iconName: 'copy',
				tooltip: 'Copy the generated PR title to your clipboard.'
			}),
			new GitIQTreeItem('Copy PR Description', vscode.TreeItemCollapsibleState.None, {
				commandId: COMMAND_IDS.copyPRDescription,
				commandTitle: 'Copy PR Description',
				iconName: 'clippy',
				tooltip: 'Copy the generated PR description markdown to your clipboard.'
			}),
			new GitIQTreeItem('Copy Entire PR', vscode.TreeItemCollapsibleState.None, {
				commandId: COMMAND_IDS.copyEntirePullRequest,
				commandTitle: 'Copy Entire Pull Request',
				iconName: 'files',
				tooltip: 'Copy the entire generated pull request document to your clipboard.'
			}),
			new GitIQTreeItem('Save PR (pull-request.md)', vscode.TreeItemCollapsibleState.None, {
				commandId: COMMAND_IDS.savePullRequest,
				commandTitle: 'Save Pull Request',
				iconName: 'save',
				tooltip: 'Save the generated pull request as pull-request.md in workspace root.'
			})
		];

		return new GitIQTreeItem('Pull Requests', vscode.TreeItemCollapsibleState.Collapsed, {
			iconName: 'git-pull-request',
			tooltip: 'Create, review, copy, and export GitHub pull requests.',
			children
		});
	}

	/**
	 * Commit Analytics section (collapsed by default).
	 */
	private createCommitAnalyticsCategory(): GitIQTreeItem {
		const children: GitIQTreeItem[] = [
			new GitIQTreeItem('Search Commits', vscode.TreeItemCollapsibleState.None, {
				commandId: COMMAND_IDS.searchCommitHistory,
				commandTitle: 'Search Commit History',
				iconName: 'search',
				tooltip: 'Search commit history offline by commit message, author, or keyword.'
			}),
			new GitIQTreeItem('Commit Statistics', vscode.TreeItemCollapsibleState.None, {
				commandId: COMMAND_IDS.commitStatistics,
				commandTitle: 'Commit Statistics',
				iconName: 'graph',
				tooltip: 'View summary statistics: total commits, contributors, and active branches.'
			}),
			new GitIQTreeItem('Top Contributors', vscode.TreeItemCollapsibleState.None, {
				commandId: COMMAND_IDS.topContributors,
				commandTitle: 'Top Contributors',
				iconName: 'organization',
				tooltip: 'View ranked list of top repository contributors and commit counts.'
			}),
			new GitIQTreeItem('7-Day Activity', vscode.TreeItemCollapsibleState.None, {
				commandId: COMMAND_IDS.commitActivity,
				commandTitle: 'Commit Activity',
				iconName: 'pulse',
				tooltip: 'View 7-day commit activity frequency table.'
			}),
			new GitIQTreeItem('Export History Report', vscode.TreeItemCollapsibleState.None, {
				commandId: COMMAND_IDS.exportHistoryReport,
				commandTitle: 'Export History Report',
				iconName: 'file-text',
				tooltip: 'Export complete commit history metrics to commit-history-report.md.'
			})
		];

		return new GitIQTreeItem('Commit Analytics', vscode.TreeItemCollapsibleState.Collapsed, {
			iconName: 'graph',
			tooltip: 'Offline commit analytics, searches, contributor insights, and reports.',
			children
		});
	}

	/**
	 * AI Settings section (collapsed by default).
	 */
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
				tooltip: 'Choose active AI model (e.g. llama-3.3-70b-versatile).'
			})
		];

		return new GitIQTreeItem('AI Settings', vscode.TreeItemCollapsibleState.Collapsed, {
			iconName: 'settings-gear',
			tooltip: 'Secure API key management and AI model configuration.',
			children
		});
	}

	/**
	 * Additional AI Tools section (collapsed by default).
	 */
	private createAdditionalAIToolsCategory(): GitIQTreeItem {
		const children: GitIQTreeItem[] = [
			new GitIQTreeItem('Preview Staged Diff', vscode.TreeItemCollapsibleState.None, {
				commandId: COMMAND_IDS.previewGitDiff,
				commandTitle: 'Preview Git Diff',
				iconName: 'diff',
				tooltip: 'Preview clean, filtered staged Git diff changes before committing.'
			}),
			new GitIQTreeItem('Explain Commit', vscode.TreeItemCollapsibleState.None, {
				commandId: COMMAND_IDS.explainCommit,
				commandTitle: 'Explain Commit',
				iconName: 'comment-discussion',
				tooltip: 'Select a commit from history and generate an AI explanation of its changes.'
			})
		];

		return new GitIQTreeItem('Additional AI Tools', vscode.TreeItemCollapsibleState.Collapsed, {
			iconName: 'sparkle',
			tooltip: 'Diff previews and commit explanations powered by AI.',
			children
		});
	}

	public dispose(): void {
		this._onDidChangeTreeData.dispose();
	}
}
