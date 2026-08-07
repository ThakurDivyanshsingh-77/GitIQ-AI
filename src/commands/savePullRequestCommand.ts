import * as vscode from 'vscode';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { getLastGeneratedPR } from './generatePullRequestCommand';
import type { LoggerService } from '../services/loggerService';
import { COMMAND_IDS } from '../utils/constants';

/**
 * Registers the Save Pull Request command handler.
 */
export function registerSavePullRequestCommand(
	context: vscode.ExtensionContext,
	logger?: LoggerService
): void {
	const command = vscode.commands.registerCommand(
		COMMAND_IDS.savePullRequest,
		async (): Promise<void> => {
			const pr = getLastGeneratedPR();

			if (!pr) {
				void vscode.window.showWarningMessage('No pull request generated yet. Run "Generate Pull Request" first.');
				return;
			}

			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			if (!workspaceFolder) {
				void vscode.window.showWarningMessage('Please open a project.');
				return;
			}

			const filePath = path.join(workspaceFolder.uri.fsPath, 'pull-request.md');

			try {
				await fs.writeFile(filePath, pr.fullMarkdown, 'utf-8');
				logger?.info(`Saved pull request to: ${filePath}`);

				const openAction = await vscode.window.showInformationMessage(
					'✓ Pull request saved to pull-request.md',
					'Open File'
				);

				if (openAction === 'Open File') {
					const document = await vscode.workspace.openTextDocument(filePath);
					await vscode.window.showTextDocument(document, { preview: false });
				}
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				logger?.error(`Failed to save pull request: ${message}`, error);
				void vscode.window.showErrorMessage(`Unable to save pull request: ${message}`);
			}
		}
	);

	context.subscriptions.push(command);
}
