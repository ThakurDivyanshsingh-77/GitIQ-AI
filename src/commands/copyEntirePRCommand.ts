import * as vscode from 'vscode';
import { getLastGeneratedPR } from './generatePullRequestCommand';
import type { LoggerService } from '../services/loggerService';
import { COMMAND_IDS } from '../utils/constants';

/**
 * Registers the Copy Entire PR command handler.
 * Supports both commitPilotAI.copyEntirePR and commitPilotAI.copyEntirePullRequest command IDs.
 */
export function registerCopyEntirePRCommand(
	context: vscode.ExtensionContext,
	logger?: LoggerService
): void {
	const copyHandler = async (): Promise<void> => {
		const pr = getLastGeneratedPR();

		if (!pr) {
			void vscode.window.showWarningMessage('No pull request generated yet. Run "Generate Pull Request" first.');
			return;
		}

		await vscode.env.clipboard.writeText(pr.fullMarkdown);
		logger?.info('Copied entire pull request to clipboard.');
		void vscode.window.showInformationMessage('✓ Entire pull request copied to clipboard.');
	};

	context.subscriptions.push(
		vscode.commands.registerCommand(COMMAND_IDS.copyEntirePR, copyHandler),
		vscode.commands.registerCommand(COMMAND_IDS.copyEntirePullRequest, copyHandler)
	);
}
