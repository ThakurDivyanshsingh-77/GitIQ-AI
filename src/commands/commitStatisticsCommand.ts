import * as vscode from 'vscode';
import type { HistoryPreviewProvider } from '../providers/historyPreviewProvider';
import type { HistoryService } from '../services/historyService';
import type { LoggerService } from '../services/loggerService';
import { COMMAND_IDS } from '../utils/constants';

/**
 * Registers the Commit Statistics command handler.
 *
 * @param context VS Code Extension Context for subscription management.
 * @param historyService HistoryService instance for Git CLI statistics collection.
 * @param historyPreviewProvider Virtual document provider for rendering statistics.
 * @param logger Optional LoggerService instance for diagnostic output.
 */
export function registerCommitStatisticsCommand(
	context: vscode.ExtensionContext,
	historyService: HistoryService,
	historyPreviewProvider: HistoryPreviewProvider,
	logger?: LoggerService
): void {
	const command = vscode.commands.registerCommand(
		COMMAND_IDS.commitStatistics,
		async (): Promise<void> => {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

			if (!workspaceFolder) {
				logger?.warn('Commit Statistics executed without an open workspace.');
				void vscode.window.showWarningMessage('Please open a project.');
				return;
			}

			const workspacePath = workspaceFolder.uri.fsPath;

			try {
				logger?.info('Collecting commit statistics...');
				const stats = await historyService.getCommitStatistics(workspacePath);

				const markdown = [
					'# 📊 GitIQ — Repository Statistics',
					'',
					'> [!NOTE]',
					`> **Active Branch:** \`${stats.branchName}\` • **Project Lifetime:** \`${stats.repositoryAgeDays} days\` • **Total Commits:** **${stats.totalCommits}**`,
					'',
					'---',
					'',
					'### 🚀 Velocity & Commit Throughput',
					'',
					'| Metric | Value | Description |',
					'| :--- | :---: | :--- |',
					`| 📦 **Total Lifetime Commits** | **${stats.totalCommits}** | Total commits on active branch |`,
					`| ⚡ **Commits Today** | **${stats.commitsToday}** | Recorded in the last 24 hours |`,
					`| 📅 **Last 7 Days** | **${stats.commitsLast7Days}** | Weekly commit activity |`,
					`| 🗓️ **Last 30 Days** | **${stats.commitsLast30Days}** | Monthly commit pace |`,
					`| 📈 **Average Velocity** | **${stats.averageCommitsPerDay} commits/day** | Mean daily contribution throughput |`,
					'',
					'---',
					'',
					'### 🕒 Project Timeline Milestones',
					'',
					'| Milestone | Details |',
					'| :--- | :--- |',
					`| 🌿 **Working Branch** | \`${stats.branchName}\` |`,
					`| 🚀 **First Inception Commit** | \`${stats.firstCommit}\` |`,
					`| 🎯 **Latest HEAD Commit** | \`${stats.latestCommit}\` |`,
					`| ⏳ **Total Project Age** | **${stats.repositoryAgeDays} days** |`,
					'',
					'---',
					'',
					'> [!TIP]',
					'> Want team insights? Run **GitIQ: Top Contributors** or **GitIQ: Commit Activity (Last 7 Days)**.'
				].join('\n');

				await historyPreviewProvider.showPreview('commit-statistics', markdown);
				logger?.info('Commit statistics displayed successfully.');
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				logger?.error(`Commit statistics failed: ${message}`, error);
				void vscode.window.showErrorMessage(`Unable to display commit statistics: ${message}`);
			}
		}
	);

	context.subscriptions.push(command);
}
