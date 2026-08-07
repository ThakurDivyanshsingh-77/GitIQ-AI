import * as vscode from 'vscode';
import type { GitService } from '../services/gitService';
import type { LoggerService } from '../services/loggerService';
import { COMMAND_IDS } from '../utils/constants';

/**
 * Registers the Git Fetch command handler.
 */
export function registerFetchCommand(
	context: vscode.ExtensionContext,
	gitService: GitService,
	logger?: LoggerService
): void {
	const command = vscode.commands.registerCommand(
		COMMAND_IDS.fetch,
		async (): Promise<void> => {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

			if (!workspaceFolder) {
				logger?.warn('Fetch command executed without an open workspace.');
				void vscode.window.showWarningMessage('Please open a project.');
				return;
			}

			const workspacePath = workspaceFolder.uri.fsPath;

			if (!(await gitService.isGitRepository(workspacePath))) {
				void vscode.window.showWarningMessage('This workspace is not a Git repository.');
				return;
			}

			try {
				logger?.info('Fetching remote updates...');
				await vscode.window.withProgress(
					{
						location: vscode.ProgressLocation.Notification,
						title: 'Fetching remote updates...',
						cancellable: false
					},
					() => gitService.fetch(workspacePath)
				);

				logger?.info('Fetch completed successfully.');
				void vscode.window.showInformationMessage('Repository updated.');
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				logger?.error(`Fetch failed: ${message}`, error);
				void vscode.window.showErrorMessage(message);
			}
		}
	);

	context.subscriptions.push(command);
}
