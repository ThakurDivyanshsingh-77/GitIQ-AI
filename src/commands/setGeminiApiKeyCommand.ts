import * as vscode from 'vscode';
import { Provider } from '../types/provider';
import type { SettingsService } from '../services/SettingsService';
import type { LoggerService } from '../services/loggerService';

export async function executeSetGeminiApiKeyCommand(
	settingsService: SettingsService,
	logger?: LoggerService
): Promise<void> {
	logger?.info('Prompting for Gemini API key...');

	const apiKey = await vscode.window.showInputBox({
		title: 'GitIQ: Set Google Gemini API Key',
		prompt: 'Enter your Google Gemini API Key (starts with AIza...)',
		password: true,
		ignoreFocusOut: true,
		validateInput: (value) => {
			if (!value || !value.trim()) {
				return 'API key cannot be empty.';
			}
			return null;
		}
	});

	if (!apiKey) {
		logger?.info('Set Gemini API key prompt was cancelled.');
		return;
	}

	await settingsService.setApiKey(apiKey.trim(), Provider.Gemini);
	logger?.info('Gemini API key stored successfully.');
	void vscode.window.showInformationMessage('✓ Google Gemini API Key stored securely in SecretStorage.');
}

export function registerSetGeminiApiKeyCommand(
	context: vscode.ExtensionContext,
	settingsService: SettingsService,
	logger?: LoggerService
): vscode.Disposable {
	const disposable = vscode.commands.registerCommand('gitIQ.setGeminiApiKey', async () => {
		try {
			await executeSetGeminiApiKeyCommand(settingsService, logger);
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : String(error);
			logger?.error(`Set Gemini API key error: ${msg}`);
			void vscode.window.showErrorMessage(`GitIQ: Failed to store Gemini API key: ${msg}`);
		}
	});

	context.subscriptions.push(disposable);
	return disposable;
}
