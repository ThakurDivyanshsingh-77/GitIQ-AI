import * as vscode from 'vscode';
import type { GitService } from '../services/gitService';
import type { LoggerService } from '../services/loggerService';
import { COMMAND_IDS } from '../utils/constants';

/**
 * Registers the Open GitHub Repository command handler.
 */
export function registerOpenRepositoryCommand(
	context: vscode.ExtensionContext,
	gitService: GitService,
	logger?: LoggerService
): void {
	const command = vscode.commands.registerCommand(
		COMMAND_IDS.openRepository,
		async (): Promise<void> => {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

			if (!workspaceFolder) {
				logger?.warn('Open GitHub Repository executed without an open workspace.');
				void vscode.window.showWarningMessage('Please open a project.');
				return;
			}

			const workspacePath = workspaceFolder.uri.fsPath;

			if (!(await gitService.isGitRepository(workspacePath))) {
				void vscode.window.showWarningMessage('This workspace is not a Git repository.');
				return;
			}

			try {
				logger?.info('Opening GitHub repository in external browser...');
				const webUrl = await gitService.getGitHubWebUrl(workspacePath);
				await vscode.env.openExternal(vscode.Uri.parse(webUrl));
				logger?.info(`Opened GitHub repository: ${webUrl}`);
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				logger?.error(`Failed to open GitHub repository: ${message}`, error);
				void vscode.window.showErrorMessage(`Unable to open GitHub repository: ${message}`);
			}
		}
	);

	context.subscriptions.push(command);
}
