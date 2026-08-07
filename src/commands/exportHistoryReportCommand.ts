import * as vscode from 'vscode';
import type { HistoryService } from '../services/historyService';
import type { LoggerService } from '../services/loggerService';
import { COMMAND_IDS } from '../utils/constants';

/**
 * Registers the Export History Report command handler.
 *
 * @param context VS Code Extension Context for subscription management.
 * @param historyService HistoryService instance for report file generation.
 * @param logger Optional LoggerService instance for diagnostic output.
 */
export function registerExportHistoryReportCommand(
	context: vscode.ExtensionContext,
	historyService: HistoryService,
	logger?: LoggerService
): void {
	const command = vscode.commands.registerCommand(
		COMMAND_IDS.exportHistoryReport,
		async (): Promise<void> => {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

			if (!workspaceFolder) {
				logger?.warn('Export History Report executed without an open workspace.');
				void vscode.window.showWarningMessage('Please open a project.');
				return;
			}

			const workspacePath = workspaceFolder.uri.fsPath;

			try {
				logger?.info('Exporting commit history analytics report...');
				const savedPath = await historyService.exportHistoryReport(workspacePath);
				logger?.info(`History report exported to ${savedPath}`);

				const action = await vscode.window.showInformationMessage(
					'✓ Commit history report saved to commit-history-report.md',
					'Open Report'
				);

				if (action === 'Open Report') {
					const document = await vscode.workspace.openTextDocument(savedPath);
					await vscode.window.showTextDocument(document, { preview: false });
				}
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				logger?.error(`Export history report failed: ${message}`, error);
				void vscode.window.showErrorMessage(`Unable to export history report: ${message}`);
			}
		}
	);

	context.subscriptions.push(command);
}
