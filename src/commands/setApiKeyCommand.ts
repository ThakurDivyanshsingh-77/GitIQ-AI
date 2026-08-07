import * as vscode from 'vscode';
import type { SettingsService } from '../services/SettingsService';
import type { LoggerService } from '../services/loggerService';
import { COMMAND_IDS } from '../utils/constants';

/**
 * Helper function containing the shared API key input, validation, confirmation, and storage logic.
 *
 * @param settingsService SettingsService instance for SecretStorage management.
 * @param logger Optional LoggerService instance for diagnostic logging.
 */
export async function promptAndStoreApiKey(
	settingsService: SettingsService,
	logger?: LoggerService
): Promise<void> {
	if (await settingsService.hasApiKey()) {
		const choice = await vscode.window.showWarningMessage(
			'A Groq API key is already saved securely. Replace existing API key?',
			'Yes',
			'No'
		);

		if (choice !== 'Yes') {
			logger?.info('User cancelled API key replacement.');
			return;
		}
	}

	const rawKey = await vscode.window.showInputBox({
		title: 'GitIQ: Set Groq API Key',
		prompt: 'Enter your Groq API key (starts with "gsk_")',
		password: true,
		ignoreFocusOut: true,
		validateInput: (value) => {
			const trimmed = value.trim();
			if (!trimmed) {
				return 'API key cannot be empty.';
			}
			if (!trimmed.startsWith('gsk_')) {
				return 'Invalid Groq API key format. API key must start with "gsk_".';
			}
			return null;
		}
	});

	if (rawKey === undefined) {
		logger?.info('User cancelled API key input.');
		return;
	}

	const trimmed = rawKey.trim();
	if (!trimmed) {
		return;
	}

	try {
		await settingsService.setApiKey(trimmed);
		logger?.info('Groq API Key saved securely in SecretStorage.');
		void vscode.window.showInformationMessage('✓ API Key saved securely.');
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logger?.error(`Failed to store API key: ${message}`, error);
		void vscode.window.showErrorMessage(`Unable to save API key: ${message}`);
	}
}

/**
 * Registers the Set Groq API Key command handler.
 *
 * @param context ExtensionContext for subscription management.
 * @param settingsService SettingsService instance for SecretStorage.
 * @param logger Optional LoggerService for output diagnostics.
 */
export function registerSetApiKeyCommand(
	context: vscode.ExtensionContext,
	settingsService: SettingsService,
	logger?: LoggerService
): void {
	const command = vscode.commands.registerCommand(
		COMMAND_IDS.setApiKey,
		async (): Promise<void> => {
			await promptAndStoreApiKey(settingsService, logger);
		}
	);

	context.subscriptions.push(command);
}
