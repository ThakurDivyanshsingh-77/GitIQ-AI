import * as vscode from 'vscode';
import type { GitService } from '../services/gitService';
import type { LoggerService } from '../services/loggerService';
import { COMMAND_IDS } from '../utils/constants';

/**
 * Registers the Git Push command handler.
 */
export function registerPushCommand(
	context: vscode.ExtensionContext,
	gitService: GitService,
	logger?: LoggerService
): void {
	const command = vscode.commands.registerCommand(
		COMMAND_IDS.push,
		async (): Promise<void> => {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

			if (!workspaceFolder) {
				logger?.warn('Push command executed without an open workspace.');
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
				logger?.info(`Pushing branch "${branch}"...`);

				await vscode.window.withProgress(
					{
						location: vscode.ProgressLocation.Notification,
						title: `Pushing branch "${branch}" to remote origin...`,
						cancellable: false
					},
					() => gitService.push(workspacePath)
				);

				logger?.info('Branch pushed successfully.');
				void vscode.window.showInformationMessage('✓ Branch pushed successfully.');
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				logger?.error(`Push failed: ${message}`, error);
				void vscode.window.showErrorMessage(message);
			}
		}
	);

	context.subscriptions.push(command);
}
