import * as vscode from 'vscode';
import type { GitService } from '../services/gitService';
import type { LoggerService } from '../services/loggerService';
import { COMMAND_IDS } from '../utils/constants';

/**
 * Registers the Git Pull command handler.
 */
export function registerPullCommand(
	context: vscode.ExtensionContext,
	gitService: GitService,
	logger?: LoggerService
): void {
	const command = vscode.commands.registerCommand(
		COMMAND_IDS.pull,
		async (): Promise<void> => {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

			if (!workspaceFolder) {
				logger?.warn('Pull command executed without an open workspace.');
				void vscode.window.showWarningMessage('Please open a project.');
				return;
			}

			const workspacePath = workspaceFolder.uri.fsPath;

			if (!(await gitService.isGitRepository(workspacePath))) {
				void vscode.window.showWarningMessage('This workspace is not a Git repository.');
				return;
			}

			try {
				const branch = await gitService.getCurrentBranch(workspacePath);
				logger?.info(`Pulling branch "${branch}"...`);

				await vscode.window.withProgress(
					{
						location: vscode.ProgressLocation.Notification,
						title: `Pulling branch "${branch}" from remote origin...`,
						cancellable: false
					},
					() => gitService.pull(workspacePath)
				);

				logger?.info('Branch pulled successfully.');
				void vscode.window.showInformationMessage('✓ Branch pulled successfully.');
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				logger?.error(`Pull failed: ${message}`, error);
				void vscode.window.showErrorMessage(message);
			}
		}
	);

	context.subscriptions.push(command);
}
