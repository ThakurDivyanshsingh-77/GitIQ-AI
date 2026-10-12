import * as vscode from 'vscode';
import { Provider } from '../types/provider';
import {
	SUPPORTED_GEMINI_MODELS,
	SUPPORTED_GROQ_MODELS,
	type SettingsService
} from '../services/SettingsService';
import type { LoggerService } from '../services/loggerService';
import { COMMAND_IDS } from '../utils/constants';

interface ModelQuickPickItem extends vscode.QuickPickItem {
	targetModel: string;
}

/**
 * Registers the Select AI Model command handler for the active provider.
 */
export function registerSelectModelCommand(
	context: vscode.ExtensionContext,
	settingsService: SettingsService,
	logger?: LoggerService
): void {
	const command = vscode.commands.registerCommand(
		COMMAND_IDS.selectModel,
		async (): Promise<void> => {
			const activeProvider = settingsService.getProvider();
			const currentModel = settingsService.getModel(activeProvider);

			if (activeProvider === Provider.Gemini) {
				const items: ModelQuickPickItem[] = SUPPORTED_GEMINI_MODELS.map((item) => ({
					label: item.label === currentModel ? `$(check) ${item.label}` : item.label,
					description: item.description,
					targetModel: item.targetModel
				}));

				const selected = await vscode.window.showQuickPick(items, {
					title: 'GitIQ: Select Google Gemini Model',
					placeHolder: `Current model: ${currentModel}. Select a Gemini model...`
				});

				if (!selected) {
					logger?.info('User cancelled Gemini model selection.');
					return;
				}

				try {
					await settingsService.setModel(selected.targetModel, Provider.Gemini);
					logger?.info(`Gemini model updated to: ${selected.targetModel}`);
					void vscode.window.showInformationMessage(`✓ Google Gemini model set to: ${selected.targetModel}`);
				} catch (error: unknown) {
					const message = error instanceof Error ? error.message : String(error);
					logger?.error(`Failed to update Gemini model: ${message}`, error);
					void vscode.window.showErrorMessage(`Unable to set Gemini model: ${message}`);
				}
				return;
			}

			if (activeProvider === Provider.Groq) {
				const items: ModelQuickPickItem[] = SUPPORTED_GROQ_MODELS.map((item) => ({
					label: item.label === currentModel ? `$(check) ${item.label}` : item.label,
					description: item.description,
					targetModel: item.targetModel
				}));

				const selected = await vscode.window.showQuickPick(items, {
					title: 'GitIQ: Select Groq Model',
					placeHolder: `Current model: ${currentModel}. Select a Groq AI model...`
				});

				if (!selected) {
					logger?.info('User cancelled Groq model selection.');
					return;
				}

				try {
					await settingsService.setModel(selected.targetModel, Provider.Groq);
					logger?.info(`Groq model updated to: ${selected.targetModel}`);
					void vscode.window.showInformationMessage(`✓ Groq model set to: ${selected.targetModel}`);
				} catch (error: unknown) {
					const message = error instanceof Error ? error.message : String(error);
					logger?.error(`Failed to update Groq model: ${message}`, error);
					void vscode.window.showErrorMessage(`Unable to set Groq model: ${message}`);
				}
				return;
			}

			if (activeProvider === Provider.Ollama) {
				const modelInput = await vscode.window.showInputBox({
					title: 'GitIQ: Select Ollama Model',
					prompt: 'Enter local Ollama model name (e.g. llama3.2, mistral, codellama, deepseek-coder)',
					value: currentModel,
					ignoreFocusOut: true
				});

				if (!modelInput || !modelInput.trim()) {
					return;
				}

				await settingsService.setModel(modelInput.trim(), Provider.Ollama);
				void vscode.window.showInformationMessage(`✓ Ollama model set to: ${modelInput.trim()}`);
				return;
			}

			if (activeProvider === Provider.Copilot) {
				const copilotModels: ModelQuickPickItem[] = [
					{ label: 'gpt-4o', description: 'Recommended - Fast, high intelligence', targetModel: 'gpt-4o' },
					{ label: 'gpt-4o-mini', description: 'Ultra-fast lightweight model', targetModel: 'gpt-4o-mini' },
					{ label: 'claude-3.5-sonnet', description: 'Deep coding and reasoning model', targetModel: 'claude-3.5-sonnet' },
					{ label: 'o1-preview', description: 'Reasoning model for complex code', targetModel: 'o1-preview' }
				];

				const selected = await vscode.window.showQuickPick(copilotModels, {
					title: 'GitIQ: Select Copilot Model Family',
					placeHolder: `Current family: ${currentModel}. Choose model family...`
				});

				if (!selected) {
					return;
				}

				await settingsService.setModel(selected.targetModel, Provider.Copilot);
				void vscode.window.showInformationMessage(`✓ Copilot model family set to: ${selected.targetModel}`);
				return;
			}

			void vscode.window.showInformationMessage(`Model configuration is managed by ${activeProvider}.`);
		}
	);

	context.subscriptions.push(command);
}
