import * as vscode from 'vscode';
import { getLastGeneratedPR } from './generatePullRequestCommand';
import type { LoggerService } from '../services/loggerService';
import { COMMAND_IDS } from '../utils/constants';

/**
 * Registers the Copy PR Description command handler.
 */
export function registerCopyPRDescriptionCommand(
	context: vscode.ExtensionContext,
	logger?: LoggerService
): void {
	const command = vscode.commands.registerCommand(
		COMMAND_IDS.copyPRDescription,
		async (): Promise<void> => {
			const pr = getLastGeneratedPR();

			if (!pr) {
				void vscode.window.showWarningMessage('No pull request generated yet. Run "Generate Pull Request" first.');
				return;
			}

			await vscode.env.clipboard.writeText(pr.description);
			logger?.info('Copied PR description to clipboard.');
			void vscode.window.showInformationMessage('✓ PR description copied to clipboard.');
		}
	);

	context.subscriptions.push(command);
}
