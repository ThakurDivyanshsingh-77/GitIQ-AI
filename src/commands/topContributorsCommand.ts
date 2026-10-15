import * as vscode from 'vscode';
import type { HistoryPreviewProvider } from '../providers/historyPreviewProvider';
import type { HistoryService } from '../services/historyService';
import type { LoggerService } from '../services/loggerService';
import { COMMAND_IDS } from '../utils/constants';
import { formatPercentage, getRankBadge, renderProgressBar } from '../utils/markdownUtils';

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

				const totalCommits = contributors.reduce((sum, c) => sum + c.commitCount, 0) || 1;
				const maxCommits = contributors[0]?.commitCount || 1;

				const markdownLines: string[] = [
					'# 🏆 GitIQ — Top Contributors Leaderboard',
					'',
					'> [!NOTE]',
					`> **Total Contributors:** \`${contributors.length}\` • **Total Tracked Commits:** **${totalCommits}**`,
					'',
					'---',
					'',
					'| Rank | Contributor | Commits | Contribution Share | Visual Distribution |',
					'| :---: | :--- | :---: | :---: | :--- |'
				];

				for (let i = 0; i < contributors.length; i++) {
					const c = contributors[i];
					const rankBadge = getRankBadge(i);
					const share = formatPercentage(c.commitCount, totalCommits);
					const bar = renderProgressBar(c.commitCount, maxCommits, 12);
					markdownLines.push(
						`| ${rankBadge} | **${c.name}** | **${c.commitCount}** | ${share} | \`${bar}\` |`
					);
				}

				markdownLines.push(
					'',
					'---',
					'',
					'> [!TIP]',
					'> Want to check recent activity? Run **GitIQ: Commit Activity (Last 7 Days)**.'
				);

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
