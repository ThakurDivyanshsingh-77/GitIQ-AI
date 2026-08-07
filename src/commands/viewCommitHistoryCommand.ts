import * as vscode from 'vscode';
import type { CommitDetailsProvider } from '../providers/commitDetailsProvider';
import type { CommitHistoryItem, GitService } from '../services/gitService';
import type { LoggerService } from '../services/loggerService';
import { COMMAND_IDS } from '../utils/constants';

interface CommitQuickPickItem extends vscode.QuickPickItem {
	commit: CommitHistoryItem;
}

/**
 * Registers the View Commit History command handler.
 */
export function registerViewCommitHistoryCommand(
	context: vscode.ExtensionContext,
	gitService: GitService,
	commitDetailsProvider: CommitDetailsProvider,
	logger?: LoggerService
): void {
	const command = vscode.commands.registerCommand(
		COMMAND_IDS.viewCommitHistory,
		async (): Promise<void> => {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

			if (!workspaceFolder) {
				logger?.warn('View Commit History executed without an open workspace.');
				void vscode.window.showWarningMessage('Please open a project.');
				return;
			}

			const workspacePath = workspaceFolder.uri.fsPath;

			if (!(await gitService.isGitRepository(workspacePath))) {
				void vscode.window.showWarningMessage('This workspace is not a Git repository.');
				return;
			}

			logger?.info('Fetching recent Git commits...');
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
				placeHolder: 'Select a commit to view details (type to filter)...',
				matchOnDescription: true,
				matchOnDetail: true
			});

			if (!selected) {
				logger?.info('User cancelled View Commit History selection.');
				return;
			}

			try {
				logger?.info(`Fetching commit details for ${selected.commit.shortHash}...`);
				const details = await gitService.getCommitDetails(workspacePath, selected.commit.hash);
				await commitDetailsProvider.showDetails(selected.commit.hash, details.fullOutput);
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				logger?.error(`Failed to show commit details: ${message}`, error);
				void vscode.window.showErrorMessage(`Unable to view commit details: ${message}`);
			}
		}
	);

	context.subscriptions.push(command);
}
