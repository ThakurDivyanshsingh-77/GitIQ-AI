import * as vscode from 'vscode';
import { SUPPORTED_GROQ_MODELS, type SettingsService } from '../services/SettingsService';
import type { LoggerService } from '../services/loggerService';
import { COMMAND_IDS } from '../utils/constants';

interface ModelQuickPickItem extends vscode.QuickPickItem {
	targetModel: string;
}

/**
 * Registers the Select Groq Model command handler.
 *
 * @param context ExtensionContext for subscription management.
 * @param settingsService SettingsService instance for configuration updates.
 * @param logger Optional LoggerService for output diagnostics.
 */
export function registerSelectModelCommand(
	context: vscode.ExtensionContext,
	settingsService: SettingsService,
	logger?: LoggerService
): void {
	const command = vscode.commands.registerCommand(
		COMMAND_IDS.selectModel,
		async (): Promise<void> => {
			const currentModel = settingsService.getModel();

			const items: ModelQuickPickItem[] = SUPPORTED_GROQ_MODELS.map((item) => ({
				label: item.label === currentModel ? `$(check) ${item.label}` : item.label,
				description: item.description,
				targetModel: item.targetModel
			}));

			const selected = await vscode.window.showQuickPick(items, {
				title: 'GitIQ: Select Groq Model',
				placeHolder: 'Select a Groq AI model for commit and PR generation...'
			});

			if (!selected) {
				logger?.info('User cancelled model selection.');
				return;
			}

			try {
				await settingsService.setModel(selected.targetModel);
				logger?.info(`Model updated to: ${selected.targetModel}`);
				void vscode.window.showInformationMessage(`✓ Groq model set to: ${selected.targetModel}`);
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				logger?.error(`Failed to update model: ${message}`, error);
				void vscode.window.showErrorMessage(`Unable to set Groq model: ${message}`);
			}
		}
	);

	context.subscriptions.push(command);
}
