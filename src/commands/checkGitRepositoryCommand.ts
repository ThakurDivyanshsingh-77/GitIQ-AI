import * as vscode from 'vscode';
import { GitService } from '../services/gitService';
import { COMMAND_IDS } from '../utils/constants';

/**
 * Registers the command that reports whether any folder in the current
 * VS Code workspace is a Git working tree.
 */
export function registerCheckGitRepositoryCommand(
	context: vscode.ExtensionContext,
	gitService: GitService
): void {
	console.log(`[GitIQ] Registering command: ${COMMAND_IDS.checkGitRepository}`);
	const checkGitRepositoryCommand = vscode.commands.registerCommand(
		COMMAND_IDS.checkGitRepository,
		async (): Promise<void> => {
			const workspaceFolders = vscode.workspace.workspaceFolders;

			if (!workspaceFolders || workspaceFolders.length === 0) {
				void vscode.window.showWarningMessage('⚠ Please open a project folder first.');
				return;
			}

			try {
				const repositoryChecks = workspaceFolders.map((workspaceFolder) =>
					gitService.isGitRepository(workspaceFolder.uri.fsPath)
				);
				const isGitRepository = (await Promise.all(repositoryChecks)).some(Boolean);

				if (isGitRepository) {
					void vscode.window.showInformationMessage('✅ Git repository detected.');
					return;
				}

				void vscode.window.showWarningMessage('❌ Current workspace is not a Git repository.');
			} catch {
				// The command must never fail visibly if an unexpected runtime error occurs.
				void vscode.window.showWarningMessage('❌ Current workspace is not a Git repository.');
			}
		}
	);

	context.subscriptions.push(checkGitRepositoryCommand);
}
