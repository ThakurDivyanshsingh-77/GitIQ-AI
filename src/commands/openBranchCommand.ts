import * as vscode from 'vscode';
import type { GitService } from '../services/gitService';
import type { LoggerService } from '../services/loggerService';
import { COMMAND_IDS } from '../utils/constants';

/**
 * Registers the Open Current Branch on GitHub command handler.
 */
export function registerOpenBranchCommand(
	context: vscode.ExtensionContext,
	gitService: GitService,
	logger?: LoggerService
): void {
	const command = vscode.commands.registerCommand(
		COMMAND_IDS.openBranch,
		async (): Promise<void> => {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

			if (!workspaceFolder) {
				logger?.warn('Open Branch on GitHub executed without an open workspace.');
				void vscode.window.showWarningMessage('Please open a project.');
				return;
			}

			const workspacePath = workspaceFolder.uri.fsPath;

			if (!(await gitService.isGitRepository(workspacePath))) {
				void vscode.window.showWarningMessage('This workspace is not a Git repository.');
				return;
			}

			try {
				logger?.info('Opening current branch on GitHub...');
				const branchUrl = await gitService.getGitHubBranchUrl(workspacePath);
				await vscode.env.openExternal(vscode.Uri.parse(branchUrl));
				logger?.info(`Opened GitHub branch URL: ${branchUrl}`);
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				logger?.error(`Failed to open GitHub branch: ${message}`, error);
				void vscode.window.showErrorMessage(`Unable to open GitHub branch: ${message}`);
			}
		}
	);

	context.subscriptions.push(command);
}
