import * as vscode from 'vscode';
import type { HistoryPreviewProvider } from '../providers/historyPreviewProvider';
import type { HistoryService } from '../services/historyService';
import type { LoggerService } from '../services/loggerService';
import { COMMAND_IDS } from '../utils/constants';

/**
 * Registers the Commit Activity command handler.
 *
 * @param context VS Code Extension Context for subscription management.
 * @param historyService HistoryService instance for Git CLI daily commit aggregation.
 * @param historyPreviewProvider Virtual document provider for rendering activity table.
 * @param logger Optional LoggerService instance for diagnostic output.
 */
export function registerCommitActivityCommand(
	context: vscode.ExtensionContext,
	historyService: HistoryService,
	historyPreviewProvider: HistoryPreviewProvider,
	logger?: LoggerService
): void {
	const command = vscode.commands.registerCommand(
		COMMAND_IDS.commitActivity,
		async (): Promise<void> => {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

			if (!workspaceFolder) {
				logger?.warn('Commit Activity executed without an open workspace.');
				void vscode.window.showWarningMessage('Please open a project.');
				return;
			}

			const workspacePath = workspaceFolder.uri.fsPath;

			try {
				logger?.info('Fetching commit activity for last 7 days...');
				const activity = await historyService.getCommitActivity(workspacePath, 7);

				const tableLines = [
					'# Commit Activity (Last 7 Days)',
					'',
					'| Day | Date | Commits |',
					'| :--- | :--- | :--- |',
					...activity.map((item) => `| ${item.dayName} | ${item.dateStr} | ${item.count} commits |`)
				];

				await historyPreviewProvider.showPreview('commit-activity', tableLines.join('\n'));
				logger?.info('Commit activity displayed successfully.');
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				logger?.error(`Commit activity failed: ${message}`, error);
				void vscode.window.showErrorMessage(`Unable to display commit activity: ${message}`);
			}
		}
	);

	context.subscriptions.push(command);
}
