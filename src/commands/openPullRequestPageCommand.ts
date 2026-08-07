import * as vscode from 'vscode';
import type { GitService } from '../services/gitService';
import type { LoggerService } from '../services/loggerService';
import { COMMAND_IDS } from '../utils/constants';

/**
 * Registers the Open Pull Request Page command handler.
 */
export function registerOpenPullRequestPageCommand(
	context: vscode.ExtensionContext,
	gitService: GitService,
	logger?: LoggerService
): void {
	const command = vscode.commands.registerCommand(
		COMMAND_IDS.openPullRequestPage,
		async (): Promise<void> => {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

			if (!workspaceFolder) {
				logger?.warn('Open PR Page executed without an open workspace.');
				void vscode.window.showWarningMessage('Please open a project.');
				return;
			}

			const workspacePath = workspaceFolder.uri.fsPath;

			if (!(await gitService.isGitRepository(workspacePath))) {
				void vscode.window.showWarningMessage('This workspace is not a Git repository.');
				return;
			}

			try {
				logger?.info('Opening GitHub compare page...');
				const compareUrl = await gitService.getCompareUrl(workspacePath);
				await vscode.env.openExternal(vscode.Uri.parse(compareUrl));
				logger?.info(`Opened GitHub compare URL: ${compareUrl}`);
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				logger?.error(`Failed to open PR page: ${message}`, error);
				void vscode.window.showErrorMessage(`Unable to open pull request page: ${message}`);
			}
		}
	);

	context.subscriptions.push(command);
}
