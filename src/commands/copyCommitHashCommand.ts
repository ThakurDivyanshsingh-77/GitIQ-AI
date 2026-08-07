import * as vscode from 'vscode';
import type { CommitHistoryItem, GitService } from '../services/gitService';
import type { LoggerService } from '../services/loggerService';
import { COMMAND_IDS } from '../utils/constants';

interface CommitQuickPickItem extends vscode.QuickPickItem {
	commit: CommitHistoryItem;
}

/**
 * Registers the Copy Commit Hash command handler.
 */
export function registerCopyCommitHashCommand(
	context: vscode.ExtensionContext,
	gitService: GitService,
	logger?: LoggerService
): void {
	const command = vscode.commands.registerCommand(
		COMMAND_IDS.copyCommitHash,
		async (): Promise<void> => {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

			if (!workspaceFolder) {
				logger?.warn('Copy Commit Hash executed without an open workspace.');
				void vscode.window.showWarningMessage('Please open a project.');
				return;
			}

			const workspacePath = workspaceFolder.uri.fsPath;

			if (!(await gitService.isGitRepository(workspacePath))) {
				void vscode.window.showWarningMessage('This workspace is not a Git repository.');
				return;
			}

			logger?.info('Fetching recent Git commits for hash copying...');
			const commits = await gitService.getCommitHistory(workspacePath, 20);

			if (commits.length === 0) {
				void vscode.window.showInformationMessage('No commits found in this repository.');
				return;
			}

			const items: CommitQuickPickItem[] = commits.map((commit) => ({
				label: `$(git-commit) ${commit.subject}`,
				description: commit.shortHash,
				detail: `Author: ${commit.author} | ${commit.relativeDate}`,
				commit
			}));

			const selected = await vscode.window.showQuickPick(items, {
				placeHolder: 'Select a commit to copy its hash (type to filter)...',
				matchOnDescription: true,
				matchOnDetail: true
			});

			if (!selected) {
				logger?.info('User cancelled Copy Commit Hash selection.');
				return;
			}

			await vscode.env.clipboard.writeText(selected.commit.hash);
			logger?.info(`Copied commit hash ${selected.commit.hash} to clipboard.`);
			void vscode.window.showInformationMessage('✓ Commit hash copied.');
		}
	);

	context.subscriptions.push(command);
}
