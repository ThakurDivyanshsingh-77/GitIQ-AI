import * as vscode from 'vscode';
import type { PullRequestProvider } from '../providers/pullRequestProvider';
import type { PullRequestContent, PullRequestService } from '../services/pullRequestService';
import type { LoggerService } from '../services/loggerService';
import { COMMAND_IDS } from '../utils/constants';

/** Module-level cache for the last generated PR, shared with copy/save commands. */
let lastGeneratedPR: PullRequestContent | undefined;

/** Returns the last generated pull request content (used by copy/save commands). */
export function getLastGeneratedPR(): PullRequestContent | undefined {
	return lastGeneratedPR;
}

/**
 * Registers the Generate Pull Request command handler.
 */
export function registerGeneratePullRequestCommand(
	context: vscode.ExtensionContext,
	pullRequestService: PullRequestService,
	pullRequestProvider: PullRequestProvider,
	logger?: LoggerService
): void {
	const command = vscode.commands.registerCommand(
		COMMAND_IDS.generatePullRequest,
		async (): Promise<void> => {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

			if (!workspaceFolder) {
				logger?.warn('Generate PR executed without an open workspace.');
				void vscode.window.showWarningMessage('Please open a project.');
				return;
			}

			const workspacePath = workspaceFolder.uri.fsPath;

			try {
				logger?.info('Starting AI pull request generation...');

				const prContent = await vscode.window.withProgress(
					{
						location: vscode.ProgressLocation.Notification,
						title: '$(loading~spin) Generating Pull Request with AI...',
						cancellable: false
					},
					() => pullRequestService.generatePullRequest(workspacePath)
				);

				lastGeneratedPR = prContent;
				await pullRequestProvider.showPullRequest(prContent.fullMarkdown);

				logger?.info('Pull request generated and displayed successfully.');
				void vscode.window.showInformationMessage(
					'✓ Pull Request generated! Use copy/save commands to export.',
					'Copy Title',
					'Copy All',
					'Save'
				).then((action) => {
					if (action === 'Copy Title') {
						void vscode.commands.executeCommand(COMMAND_IDS.copyPRTitle);
					} else if (action === 'Copy All') {
						void vscode.commands.executeCommand(COMMAND_IDS.copyEntirePR);
					} else if (action === 'Save') {
						void vscode.commands.executeCommand(COMMAND_IDS.savePullRequest);
					}
				});
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				logger?.error(`PR generation failed: ${message}`, error);
				void vscode.window.showErrorMessage(message);
			}
		}
	);

	context.subscriptions.push(command);
}
