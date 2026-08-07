import * as vscode from 'vscode';
import type { GitService } from '../services/gitService';
import type { LoggerService } from '../services/loggerService';
import { COMMAND_IDS } from '../utils/constants';

/**
 * Registers the Show Current Branch command handler.
 */
export function registerCurrentBranchCommand(
	context: vscode.ExtensionContext,
	gitService: GitService,
	logger?: LoggerService
): void {
	const command = vscode.commands.registerCommand(
		COMMAND_IDS.currentBranch,
		async (): Promise<void> => {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

			if (!workspaceFolder) {
				logger?.warn('Show Current Branch command executed without an open workspace.');
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
				logger?.info(`Current branch: ${branch}`);
				void vscode.window.showInformationMessage(`Current Branch: ${branch}`);
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				logger?.error(`Failed to get current branch: ${message}`, error);
				void vscode.window.showErrorMessage(`Unable to determine current branch: ${message}`);
			}
		}
	);

	context.subscriptions.push(command);
}
