import * as vscode from 'vscode';
import type { CommitExplainProvider } from '../providers/commitExplainProvider';
import type { CommitMessageService } from '../services/commitMessageService';
import type { CommitHistoryItem, GitService } from '../services/gitService';
import type { LoggerService } from '../services/loggerService';
import { COMMAND_IDS } from '../utils/constants';

interface CommitQuickPickItem extends vscode.QuickPickItem {
	commit: CommitHistoryItem;
}

/**
 * Registers the Explain Commit command handler.
 */
export function registerExplainCommitCommand(
	context: vscode.ExtensionContext,
	gitService: GitService,
	commitMessageService: CommitMessageService,
	commitExplainProvider: CommitExplainProvider,
	logger?: LoggerService
): void {
	const command = vscode.commands.registerCommand(
		COMMAND_IDS.explainCommit,
		async (): Promise<void> => {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

			if (!workspaceFolder) {
				logger?.warn('Explain Commit executed without an open workspace.');
				void vscode.window.showWarningMessage('Please open a project.');
				return;
			}

			const workspacePath = workspaceFolder.uri.fsPath;

			if (!(await gitService.isGitRepository(workspacePath))) {
				void vscode.window.showWarningMessage('This workspace is not a Git repository.');
				return;
			}

			logger?.info('Fetching recent Git commits for AI explanation...');
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
				placeHolder: 'Select a commit for AI explanation (type to filter)...',
				matchOnDescription: true,
				matchOnDetail: true
			});

			if (!selected) {
				logger?.info('User cancelled Explain Commit selection.');
				return;
			}

			try {
				logger?.info(`Generating AI explanation for commit ${selected.commit.shortHash}...`);
				const explanation = await vscode.window.withProgress(
					{
						location: vscode.ProgressLocation.Notification,
						title: `Explaining commit ${selected.commit.shortHash} with AI...`,
						cancellable: false
					},
					() => commitMessageService.explainCommit(workspacePath, selected.commit.hash)
				);

				await commitExplainProvider.showExplanation(selected.commit.hash, explanation);
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				logger?.error(`Failed to explain commit: ${message}`, error);
				void vscode.window.showErrorMessage(`Unable to explain commit: ${message}`);
			}
		}
	);

	context.subscriptions.push(command);
}
