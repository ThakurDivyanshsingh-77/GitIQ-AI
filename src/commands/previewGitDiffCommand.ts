import * as vscode from 'vscode';
import { GitDiffPreviewProvider } from '../providers/gitDiffPreviewProvider';
import { GitService } from '../services/gitService';

const PREVIEW_GIT_DIFF_COMMAND_ID = 'commitPilotAI.previewGitDiff';

/**
 * Registers the staged-diff preview command. Git execution remains in
 * GitService; this command only coordinates workspace state and presentation.
 */
export function registerPreviewGitDiffCommand(
	context: vscode.ExtensionContext,
	gitService: GitService,
	previewProvider: GitDiffPreviewProvider
): void {
	const previewGitDiffCommand = vscode.commands.registerCommand(
		PREVIEW_GIT_DIFF_COMMAND_ID,
		async (): Promise<void> => {
			const workspaceFolders = vscode.workspace.workspaceFolders;

			if (!workspaceFolders || workspaceFolders.length === 0) {
				void vscode.window.showWarningMessage('Please open a project first.');
				return;
			}

			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: 'CommitPilot AI: Reading staged Git changes...',
					cancellable: false
				},
				async (): Promise<void> => {
					try {
						const workspaceFolder = workspaceFolders[0];
						const isGitRepository = await gitService.isGitRepository(
							workspaceFolder.uri.fsPath
						);

						if (!isGitRepository) {
							void vscode.window.showWarningMessage('This workspace is not a Git repository.');
							return;
						}

						const stagedDiff = await gitService.getStagedDiff(workspaceFolder.uri.fsPath);

						if (!stagedDiff.hasChanges) {
							void vscode.window.showInformationMessage(
								'No staged changes found.\n\nStage your files first using:\n\ngit add .'
							);
							return;
						}

						await previewProvider.showPreview(stagedDiff.content);
					} catch {
						// Do not expose process errors or let an unexpected failure crash the host.
						void vscode.window.showErrorMessage('Unable to read staged Git changes.');
					}
				}
			);
		}
	);

	context.subscriptions.push(previewGitDiffCommand);
}
