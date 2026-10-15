import * as vscode from 'vscode';
import type { HistoryPreviewProvider } from '../providers/historyPreviewProvider';
import type { HistoryService } from '../services/historyService';
import type { LoggerService } from '../services/loggerService';
import { COMMAND_IDS } from '../utils/constants';
import { renderProgressBar } from '../utils/markdownUtils';

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

				const totalWeeklyCommits = activity.reduce((sum, item) => sum + item.count, 0);
				const maxDaily = Math.max(...activity.map((item) => item.count), 1);
				const peakDay = activity.slice().sort((a, b) => b.count - a.count)[0];
				const avgDaily = (totalWeeklyCommits / Math.max(activity.length, 1)).toFixed(1);

				const tableLines = [
					'# 📅 GitIQ — Commit Activity (Last 7 Days)',
					'',
					'> [!NOTE]',
					`> **Weekly Throughput:** **${totalWeeklyCommits} commits** • **Daily Average:** **${avgDaily} / day** • **Peak Day:** **${peakDay ? `${peakDay.dayName} (${peakDay.count})` : 'N/A'}**`,
					'',
					'---',
					'',
					'| Day of Week | Calendar Date | Commits | Activity Meter |',
					'| :--- | :---: | :---: | :--- |',
					...activity.map((item) => {
						const bar = renderProgressBar(item.count, maxDaily, 12);
						return `| **${item.dayName}** | \`${item.dateStr}\` | **${item.count} commits** | \`${bar}\` |`;
					}),
					'',
					'---',
					'',
					'### 📊 Weekly Momentum Insights',
					'',
					`- **Total Commits This Week:** **${totalWeeklyCommits}**`,
					`- **Daily Average:** **${avgDaily} commits/day**`,
					`- **Most Active Date:** ${peakDay ? `**${peakDay.dateStr}** (${peakDay.dayName}) with **${peakDay.count} commits**` : 'N/A'}`,
					'',
					'---',
					'',
					'> [!TIP]',
					'> Need a permanent copy? Use **GitIQ: Export Commit History Report** to generate `commit-history-report.md`.'
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
