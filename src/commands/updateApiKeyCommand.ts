import * as vscode from 'vscode';
import type { SettingsService } from '../services/SettingsService';
import type { LoggerService } from '../services/loggerService';
import { COMMAND_IDS } from '../utils/constants';
import { promptAndStoreApiKey } from './setApiKeyCommand';

/**
 * Registers the Update Groq API Key command handler.
 *
 * @param context ExtensionContext for subscription management.
 * @param settingsService SettingsService instance for SecretStorage.
 * @param logger Optional LoggerService for output diagnostics.
 */
export function registerUpdateApiKeyCommand(
	context: vscode.ExtensionContext,
	settingsService: SettingsService,
	logger?: LoggerService
): void {
	const command = vscode.commands.registerCommand(
		COMMAND_IDS.updateApiKey,
		async (): Promise<void> => {
			await promptAndStoreApiKey(settingsService, logger);
		}
	);

	context.subscriptions.push(command);
}
