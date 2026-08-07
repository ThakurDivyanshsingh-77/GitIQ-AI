import * as vscode from 'vscode';
import type { HistoryPreviewProvider } from '../providers/historyPreviewProvider';
import type { HistoryService } from '../services/historyService';
import type { LoggerService } from '../services/loggerService';
import { COMMAND_IDS } from '../utils/constants';

/**
 * Registers the Top Contributors command handler.
 *
 * @param context VS Code Extension Context for subscription management.
 * @param historyService HistoryService instance for Git CLI shortlog collection.
 * @param historyPreviewProvider Virtual document provider for rendering contributors list.
 * @param logger Optional LoggerService instance for diagnostic output.
 */
export function registerTopContributorsCommand(
	context: vscode.ExtensionContext,
	historyService: HistoryService,
	historyPreviewProvider: HistoryPreviewProvider,
	logger?: LoggerService
): void {
	const command = vscode.commands.registerCommand(
		COMMAND_IDS.topContributors,
		async (): Promise<void> => {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

			if (!workspaceFolder) {
				logger?.warn('Top Contributors executed without an open workspace.');
				void vscode.window.showWarningMessage('Please open a project.');
				return;
			}

			const workspacePath = workspaceFolder.uri.fsPath;

			try {
				logger?.info('Fetching top contributors via Git CLI...');
				const contributors = await historyService.getTopContributors(workspacePath);

				if (contributors.length === 0) {
					void vscode.window.showInformationMessage('No contributor statistics available.');
					return;
				}

				const markdownLines: string[] = [
					'# Top Contributors',
					''
				];

				for (const c of contributors) {
					markdownLines.push(
						c.name,
						`${c.commitCount} commits`,
						''
					);
				}

				await historyPreviewProvider.showPreview('top-contributors', markdownLines.join('\n'));
				logger?.info('Top contributors displayed successfully.');
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				logger?.error(`Top contributors failed: ${message}`, error);
				void vscode.window.showErrorMessage(`Unable to display top contributors: ${message}`);
			}
		}
	);

	context.subscriptions.push(command);
}
