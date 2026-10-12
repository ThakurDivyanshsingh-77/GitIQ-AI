import * as vscode from 'vscode';
import { Provider } from '../types/provider';
import type { SettingsService } from '../services/SettingsService';
import type { LoggerService } from '../services/loggerService';
import { COMMAND_IDS } from '../utils/constants';

interface ProviderQuickPickItem extends vscode.QuickPickItem {
	provider: Provider;
	needsKey?: boolean;
}

/**
 * Interactive command allowing developers to choose their AI backend:
 * GitHub Copilot, Groq API, Gemini API, Ollama, or External Agent (MCP).
 */
export async function executeSelectProviderCommand(
	settingsService: SettingsService,
	logger?: LoggerService
): Promise<void> {
	logger?.info('Invoking GitIQ: Select AI Provider command...');

	const currentProvider = settingsService.getProvider();
	const hasGroqKey = await settingsService.hasApiKey(Provider.Groq);
	const hasGeminiKey = await settingsService.hasApiKey(Provider.Gemini);
	const hasLmApi = typeof vscode.lm !== 'undefined';

	const items: ProviderQuickPickItem[] = [
		{
			label: '$(github) GitHub Copilot',
			description: currentProvider === Provider.Copilot ? 'Active' : (hasLmApi ? 'Available' : 'Needs VS Code 1.90+'),
			detail: 'Use your existing GitHub Copilot subscription via VS Code Language Model API. No API key required.',
			provider: Provider.Copilot
		},
		{
			label: '$(zap) Groq API',
			description: currentProvider === Provider.Groq ? 'Active' : (hasGroqKey ? 'Configured' : 'Needs API Key'),
			detail: 'Ultra-fast inference powered by Groq Llama 3.3. Requires Groq API key.',
			provider: Provider.Groq,
			needsKey: !hasGroqKey
		},
		{
			label: '$(sparkle) Google Gemini API',
			description: currentProvider === Provider.Gemini ? 'Active' : (hasGeminiKey ? 'Configured' : 'Needs API Key'),
			detail: 'Google Gemini 1.5/2.0 multimodal intelligence. Requires Gemini API key.',
			provider: Provider.Gemini,
			needsKey: !hasGeminiKey
		},
		{
			label: '$(server) Ollama (Local)',
			description: currentProvider === Provider.Ollama ? 'Active' : 'Offline / Local',
			detail: '100% private, local LLMs running on your machine (http://localhost:11434). No API key required.',
			provider: Provider.Ollama
		},
		{
			label: '$(plug) External Agent / MCP',
			description: currentProvider === Provider.MCP ? 'Active' : 'Model Context Protocol',
			detail: 'Integrate with external agents (Google Antigravity, Claude Code, OpenAI Codex) via MCP server.',
			provider: Provider.MCP
		}
	];

	const selected = await vscode.window.showQuickPick(items, {
		title: 'GitIQ: Select AI Provider',
		placeHolder: `Current provider: ${currentProvider}. Choose a provider...`
	});

	if (!selected) {
		logger?.info('Provider selection cancelled.');
		return;
	}

	await settingsService.setProvider(selected.provider);
	logger?.info(`AI provider changed to: ${selected.provider}`);

	if (selected.provider === Provider.Groq && selected.needsKey) {
		const setupKey = await vscode.window.showInformationMessage(
			'✓ Switched to Groq API. Please enter your Groq API key to start generating.',
			'Set Groq Key',
			'Later'
		);
		if (setupKey === 'Set Groq Key') {
			void vscode.commands.executeCommand(COMMAND_IDS.setApiKey);
		}
	} else if (selected.provider === Provider.Gemini && selected.needsKey) {
		const setupKey = await vscode.window.showInformationMessage(
			'✓ Switched to Gemini API. Please enter your Gemini API key to start generating.',
			'Set Gemini Key',
			'Later'
		);
		if (setupKey === 'Set Gemini Key') {
			void vscode.commands.executeCommand('gitIQ.setGeminiApiKey');
		}
	} else {
		void vscode.window.showInformationMessage(
			`✓ GitIQ AI Provider switched to ${selected.label.replace(/\$\([^)]+\)\s*/, '')}.`
		);
	}

	// Trigger sidebar dashboard refresh
	void vscode.commands.executeCommand(COMMAND_IDS.refreshSidebar);
}

export function registerSelectProviderCommand(
	context: vscode.ExtensionContext,
	settingsService: SettingsService,
	logger?: LoggerService
): vscode.Disposable {
	const disposable = vscode.commands.registerCommand('gitIQ.selectProvider', async () => {
		try {
			await executeSelectProviderCommand(settingsService, logger);
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			logger?.error(`Select provider command failed: ${message}`, error);
			void vscode.window.showErrorMessage(`GitIQ: Failed to switch provider: ${message}`);
		}
	});

	context.subscriptions.push(disposable);
	return disposable;
}
