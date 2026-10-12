import * as vscode from 'vscode';
import { Provider } from '../types/provider';
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
			const activeProvider = settingsService.getProvider();
			const targetProvider = activeProvider === Provider.Gemini ? Provider.Gemini : Provider.Groq;
			const providerLabel = targetProvider === Provider.Gemini ? 'Google Gemini' : 'Groq';

			const hasKey = await settingsService.hasApiKey(targetProvider);

			if (!hasKey) {
				void vscode.window.showInformationMessage(`No ${providerLabel} API Key is currently stored.`);
				return;
			}

			const choice = await vscode.window.showWarningMessage(
				`Are you sure you want to remove your stored ${providerLabel} API Key?`,
				'Yes',
				'No'
			);

			if (choice !== 'Yes') {
				logger?.info(`User cancelled ${providerLabel} API key removal.`);
				return;
			}

			try {
				await settingsService.removeApiKey(targetProvider);
				logger?.info(`${providerLabel} API key removed from SecretStorage.`);
				void vscode.window.showInformationMessage(`✓ ${providerLabel} API key removed successfully.`);
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				logger?.error(`Failed to remove ${providerLabel} API key: ${message}`, error);
				void vscode.window.showErrorMessage(`Unable to remove API key: ${message}`);
			}
		}
	);

	context.subscriptions.push(command);
}
