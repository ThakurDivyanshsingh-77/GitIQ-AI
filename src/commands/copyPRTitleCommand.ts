import * as vscode from 'vscode';
import { getLastGeneratedPR } from './generatePullRequestCommand';
import type { LoggerService } from '../services/loggerService';
import { COMMAND_IDS } from '../utils/constants';

/**
 * Registers the Copy PR Title command handler.
 */
export function registerCopyPRTitleCommand(
	context: vscode.ExtensionContext,
	logger?: LoggerService
): void {
	const command = vscode.commands.registerCommand(
		COMMAND_IDS.copyPRTitle,
		async (): Promise<void> => {
			const pr = getLastGeneratedPR();

			if (!pr) {
				void vscode.window.showWarningMessage('No pull request generated yet. Run "Generate Pull Request" first.');
				return;
			}

			await vscode.env.clipboard.writeText(pr.title);
			logger?.info(`Copied PR title to clipboard: "${pr.title}"`);
			void vscode.window.showInformationMessage('✓ PR title copied to clipboard.');
		}
	);

	context.subscriptions.push(command);
}
