import * as vscode from 'vscode';
import type { SettingsService } from '../services/SettingsService';
import type { LoggerService } from '../services/loggerService';
import { COMMAND_IDS } from '../utils/constants';

/**
 * Registers the Remove Groq API Key command handler.
 *
 * @param context ExtensionContext for subscription management.
 * @param settingsService SettingsService instance for SecretStorage.
 * @param logger Optional LoggerService for output diagnostics.
 */
export function registerRemoveApiKeyCommand(
	context: vscode.ExtensionContext,
	settingsService: SettingsService,
	logger?: LoggerService
): void {
	const command = vscode.commands.registerCommand(
		COMMAND_IDS.removeApiKey,
		async (): Promise<void> => {
			const hasKey = await settingsService.hasApiKey();

			if (!hasKey) {
				void vscode.window.showInformationMessage('No Groq API Key is currently stored.');
				return;
			}

			const choice = await vscode.window.showWarningMessage(
				'Are you sure you want to remove your stored Groq API Key?',
				'Yes',
				'No'
			);

			if (choice !== 'Yes') {
				logger?.info('User cancelled API key removal.');
				return;
			}

			try {
				await settingsService.removeApiKey();
				logger?.info('Groq API key removed from SecretStorage.');
				void vscode.window.showInformationMessage('API key removed successfully.');
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				logger?.error(`Failed to remove API key: ${message}`, error);
				void vscode.window.showErrorMessage(`Unable to remove API key: ${message}`);
			}
		}
	);

	context.subscriptions.push(command);
}
