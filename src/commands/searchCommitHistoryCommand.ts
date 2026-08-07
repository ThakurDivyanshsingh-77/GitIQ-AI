import * as vscode from 'vscode';
import type { HistoryPreviewProvider } from '../providers/historyPreviewProvider';
import type { HistoryService } from '../services/historyService';
import type { LoggerService } from '../services/loggerService';
import { COMMAND_IDS } from '../utils/constants';

/**
 * Registers the Search Commit History command handler.
 *
 * @param context VS Code Extension Context for subscription management.
 * @param historyService HistoryService instance for Git CLI search execution.
 * @param historyPreviewProvider Virtual document provider for rendering search results.
 * @param logger Optional LoggerService instance for diagnostic output.
 */
export function registerSearchCommitHistoryCommand(
	context: vscode.ExtensionContext,
	historyService: HistoryService,
	historyPreviewProvider: HistoryPreviewProvider,
	logger?: LoggerService
): void {
	const command = vscode.commands.registerCommand(
		COMMAND_IDS.searchCommitHistory,
		async (): Promise<void> => {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

			if (!workspaceFolder) {
				logger?.warn('Search Commit History executed without an open workspace.');
				void vscode.window.showWarningMessage('Please open a project.');
				return;
			}

			const keyword = await vscode.window.showInputBox({
				title: 'Commit Pilot AI: Search Commit History',
				prompt: 'Enter a keyword to search commit history...',
				placeHolder: 'e.g. login, fix, refactor'
			});

			if (keyword === undefined) {
				logger?.info('User cancelled search commit history prompt.');
				return;
			}

			const trimmedKeyword = keyword.trim();
			if (!trimmedKeyword) {
				void vscode.window.showWarningMessage('Please enter a valid search keyword.');
				return;
			}

			const workspacePath = workspaceFolder.uri.fsPath;

			try {
				logger?.info(`Executing search commit history for keyword: "${trimmedKeyword}"...`);
				const results = await historyService.searchCommitHistory(workspacePath, trimmedKeyword);

				if (results.length === 0) {
					void vscode.window.showInformationMessage(`No commits found matching keyword: "${trimmedKeyword}"`);
					return;
				}

				const markdownBlocks: string[] = [
					'# Search Results',
					'',
					'Keyword:',
					trimmedKeyword,
					''
				];

				for (const commit of results) {
					markdownBlocks.push(
						'-----------------------------------',
						'',
						commit.shortHash,
						`Author: ${commit.author}`,
						'Date:',
						commit.date,
						'',
						commit.subject,
						''
					);
				}

				markdownBlocks.push('-----------------------------------');

				await historyPreviewProvider.showPreview('search-results', markdownBlocks.join('\n'));
				logger?.info('Commit search results displayed successfully.');
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				logger?.error(`Search commit history failed: ${message}`, error);
				void vscode.window.showErrorMessage(`Unable to search commit history: ${message}`);
			}
		}
	);

	context.subscriptions.push(command);
}
