import * as vscode from 'vscode';
import type { RepoInfoProvider } from '../providers/repoInfoProvider';
import type { GitService } from '../services/gitService';
import type { LoggerService } from '../services/loggerService';
import { COMMAND_IDS } from '../utils/constants';

/**
 * Registers the Repository Information command handler.
 */
export function registerRepositoryInfoCommand(
	context: vscode.ExtensionContext,
	gitService: GitService,
	repoInfoProvider: RepoInfoProvider,
	logger?: LoggerService
): void {
	const command = vscode.commands.registerCommand(
		COMMAND_IDS.repositoryInfo,
		async (): Promise<void> => {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

			if (!workspaceFolder) {
				logger?.warn('Repository Information executed without an open workspace.');
				void vscode.window.showWarningMessage('Please open a project.');
				return;
			}

			const workspacePath = workspaceFolder.uri.fsPath;

			if (!(await gitService.isGitRepository(workspacePath))) {
				void vscode.window.showWarningMessage('This workspace is not a Git repository.');
				return;
			}

			try {
				logger?.info('Collecting repository information...');
				const info = await gitService.getRepositoryInfo(workspacePath);
				await repoInfoProvider.showRepositoryInfo(info);
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				logger?.error(`Failed to collect repository information: ${message}`, error);
				void vscode.window.showErrorMessage(`Unable to display repository info: ${message}`);
			}
		}
	);

	context.subscriptions.push(command);
}
