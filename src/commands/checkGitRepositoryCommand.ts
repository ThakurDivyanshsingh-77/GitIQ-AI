import * as vscode from 'vscode';
import type { GitService } from '../services/gitService';
import type { RepositoryDetector } from '../services/repositoryDetector';
import { COMMAND_IDS } from '../utils/constants';

/**
 * Registers the command that reports whether any folder in the current
 * VS Code workspace is a Git working tree.
 */
export function registerCheckGitRepositoryCommand(
	context: vscode.ExtensionContext,
	gitService: GitService,
	repositoryDetector?: RepositoryDetector
): void {
	console.log(`[GitIQ] Registering command: ${COMMAND_IDS.checkGitRepository}`);
	const checkGitRepositoryCommand = vscode.commands.registerCommand(
		COMMAND_IDS.checkGitRepository,
		async (): Promise<void> => {
			const workspaceFolders = vscode.workspace.workspaceFolders;

			if (!workspaceFolders || workspaceFolders.length === 0) {
				const action = await vscode.window.showWarningMessage(
					'⚠ Please open a project folder first.',
					'Open Folder'
				);
				if (action === 'Open Folder') {
					await vscode.commands.executeCommand('vscode.openFolder');
				}
				return;
			}

			try {
				// Check active detected repository first
				const activeRepo = repositoryDetector?.getActiveRepository();
				if (activeRepo) {
					void vscode.window.showInformationMessage(
						`✅ Git repository detected: ${activeRepo.repoName} (${activeRepo.branch})`
					);
					return;
				}

				// Check each workspace folder with GitService
				const repositoryChecks = workspaceFolders.map((workspaceFolder) =>
					gitService.isGitRepository(workspaceFolder.uri.fsPath)
				);
				const isGitRepository = (await Promise.all(repositoryChecks)).some(Boolean);

				if (isGitRepository) {
					void vscode.window.showInformationMessage('✅ Git repository detected.');
					return;
				}

				// If not detected via GitService, trigger repository detector refresh
				if (repositoryDetector) {
					const detState = await repositoryDetector.detectRepositories();
					if (detState.status === 'detected' && detState.activeRepo) {
						void vscode.window.showInformationMessage(
							`✅ Git repository detected: ${detState.activeRepo.repoName} (${detState.activeRepo.branch})`
						);
						return;
					}
				}

				const initAction = await vscode.window.showWarningMessage(
					'❌ Current workspace is not a Git repository.',
					'Initialize Repository'
				);
				if (initAction === 'Initialize Repository') {
					await vscode.commands.executeCommand('git.init');
					if (repositoryDetector) {
						setTimeout(() => {
							void repositoryDetector?.refresh();
						}, 800);
					}
				}
			} catch {
				// The command must never fail visibly if an unexpected runtime error occurs.
				void vscode.window.showWarningMessage('❌ Current workspace is not a Git repository.');
			}
		}
	);

	context.subscriptions.push(checkGitRepositoryCommand);
}
