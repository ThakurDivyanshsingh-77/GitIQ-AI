import * as vscode from 'vscode';
import { Provider, type ProviderConfiguration } from '../types/provider';
import {
	CONFIGURATION_KEYS,
	CONFIGURATION_SECTION,
	GEMINI_DEFAULT_MODEL,
	GROQ_DEFAULT_MODEL,
	LEGACY_CONFIGURATION_SECTION
} from '../utils/constants';
import { ConfigurationError } from '../utils/errors';
import type { LoggerService } from './loggerService';

/** Key identifier used to store the Groq API key in VS Code SecretStorage. */
export const SECRET_STORAGE_API_KEY = 'gitiq.groqApiKey';

/** Key identifier used to store the Gemini API key in VS Code SecretStorage. */
export const SECRET_STORAGE_GEMINI_API_KEY = 'gitiq.geminiApiKey';

/** Legacy SecretStorage key for backward compatibility migration. */
export const LEGACY_SECRET_STORAGE_API_KEY = 'commitpilot.groqApiKey';

/** Complete configuration container including active provider. */
export interface GitIQConfiguration extends ProviderConfiguration {
	readonly provider: Provider;
}

/** Legacy type alias for GitIQConfiguration. */
export type CommitPilotConfiguration = GitIQConfiguration;

/** Supported Groq AI models available in model selector. */
export const SUPPORTED_GROQ_MODELS = [
	{
		label: 'llama-3.3-70b-versatile',
		description: 'Recommended - High intelligence, fast, 70B parameter model',
		targetModel: 'llama-3.3-70b-versatile'
	},
	{
		label: 'llama-3.1-8b-instant',
		description: 'Ultra fast, lightweight 8B parameter model',
		targetModel: 'llama-3.1-8b-instant'
	},
	{
		label: 'openai/gpt-oss-120b',
		description: 'High capacity 120B parameter model',
		targetModel: 'openai/gpt-oss-120b'
	},
	{
		label: 'deepseek-r1-distill-llama-70b',
		description: 'Distilled reasoning model based on Llama-70B',
		targetModel: 'deepseek-r1-distill-llama-70b'
	}
] as const;

/** Supported Google Gemini models available in model selector. */
export const SUPPORTED_GEMINI_MODELS = [
	{
		label: 'gemini-1.5-flash',
		description: 'Recommended - High speed, multimodal, 1M context window',
		targetModel: 'gemini-1.5-flash'
	},
	{
		label: 'gemini-1.5-pro',
		description: 'Advanced reasoning, complex problem solving, 2M context window',
		targetModel: 'gemini-1.5-pro'
	},
	{
		label: 'gemini-2.0-flash',
		description: 'Next-gen multimodal intelligence with ultra-low latency',
		targetModel: 'gemini-2.0-flash'
	}
] as const;


/**
 * Manages secure API key storage in VS Code SecretStorage and multi-provider settings configuration.
 */
export class SettingsService {
	public constructor(
		private readonly secrets: vscode.SecretStorage,
		private readonly logger?: LoggerService
	) {}

	/**
	 * Returns the currently active AI provider.
	 */
	public getProvider(): Provider {
		const raw = this.getConfiguration().get<string>(CONFIGURATION_KEYS.provider, Provider.Groq);
		const match = Object.values(Provider).find((p) => p === raw);
		return match ?? Provider.Groq;
	}

	/**
	 * Updates the configured AI provider in global settings.
	 */
	public async setProvider(provider: Provider): Promise<void> {
		this.logger?.info(`Updating configured AI provider to: ${provider}`);
		await this.getConfiguration().update(
			CONFIGURATION_KEYS.provider,
			provider,
			vscode.ConfigurationTarget.Global
		);
	}

	/**
	 * Retrieves the API key securely from SecretStorage for the specified provider.
	 *
	 * @param provider Target provider (defaults to Groq).
	 * @returns API key string or empty string if not found.
	 */
	public async getApiKey(provider: Provider = Provider.Groq): Promise<string> {
		if (provider === Provider.Gemini) {
			try {
				const geminiKey = await this.secrets.get(SECRET_STORAGE_GEMINI_API_KEY);
				return geminiKey?.trim() || '';
			} catch {
				return '';
			}
		}

		try {
			const secretKey = await this.secrets.get(SECRET_STORAGE_API_KEY);
			if (secretKey?.trim()) {
				return secretKey.trim();
			}

			// Check legacy SecretStorage key
			const legacySecretKey = await this.secrets.get(LEGACY_SECRET_STORAGE_API_KEY);
			if (legacySecretKey?.trim()) {
				await this.secrets.store(SECRET_STORAGE_API_KEY, legacySecretKey.trim());
				await this.secrets.delete(LEGACY_SECRET_STORAGE_API_KEY);
				return legacySecretKey.trim();
			}
		} catch (error: unknown) {
			this.logger?.warn(`SecretStorage get error: ${error instanceof Error ? error.message : String(error)}`);
		}

		// Fallback to gitIQ settings.json
		const gitIQConfigKey = this.getConfiguration().get<string>(CONFIGURATION_KEYS.apiKey)?.trim();
		if (gitIQConfigKey) {
			return gitIQConfigKey;
		}

		// Fallback to legacy commitPilotAI settings.json
		const legacyConfigKey = vscode.workspace
			.getConfiguration(LEGACY_CONFIGURATION_SECTION)
			.get<string>(CONFIGURATION_KEYS.apiKey)
			?.trim();

		return legacyConfigKey || '';
	}

	/**
	 * Stores the API key securely in VS Code SecretStorage.
	 *
	 * @param apiKey Raw API key string.
	 * @param provider Target provider (defaults to Groq).
	 */
	public async setApiKey(apiKey: string, provider: Provider = Provider.Groq): Promise<void> {
		const trimmedKey = apiKey.trim();
		if (!trimmedKey) {
			throw new ConfigurationError('API key cannot be empty.');
		}

		if (provider === Provider.Gemini) {
			this.logger?.info('Storing Gemini API Key securely in SecretStorage...');
			await this.secrets.store(SECRET_STORAGE_GEMINI_API_KEY, trimmedKey);
			return;
		}

		if (provider === Provider.Groq && !trimmedKey.startsWith('gsk_')) {
			throw new ConfigurationError("Invalid Groq API key format. API key must start with 'gsk_'.");
		}

		this.logger?.info('Storing Groq API Key securely in SecretStorage (gitiq.groqApiKey)...');
		await this.secrets.store(SECRET_STORAGE_API_KEY, trimmedKey);

		// Clean up legacy SecretStorage key if present
		await this.secrets.delete(LEGACY_SECRET_STORAGE_API_KEY);

		// Clean up settings.json if present
		if (this.getConfiguration().get<string>(CONFIGURATION_KEYS.apiKey)) {
			await this.getConfiguration().update(
				CONFIGURATION_KEYS.apiKey,
				undefined,
				vscode.ConfigurationTarget.Global
			);
		}

		const legacyConfig = vscode.workspace.getConfiguration(LEGACY_CONFIGURATION_SECTION);
		if (legacyConfig.get<string>(CONFIGURATION_KEYS.apiKey)) {
			await legacyConfig.update(CONFIGURATION_KEYS.apiKey, undefined, vscode.ConfigurationTarget.Global);
		}
	}

	/**
	 * Checks whether an API key is currently stored for the specified provider.
	 */
	public async hasApiKey(provider: Provider = Provider.Groq): Promise<boolean> {
		const key = await this.getApiKey(provider);
		return key.length > 0;
	}

	/**
	 * Deletes the stored API key from SecretStorage.
	 */
	public async removeApiKey(provider: Provider = Provider.Groq): Promise<void> {
		if (provider === Provider.Gemini) {
			this.logger?.info('Removing Gemini API Key from SecretStorage...');
			await this.secrets.delete(SECRET_STORAGE_GEMINI_API_KEY);
			return;
		}

		this.logger?.info('Removing Groq API Key from SecretStorage and configuration...');
		await this.secrets.delete(SECRET_STORAGE_API_KEY);
		await this.secrets.delete(LEGACY_SECRET_STORAGE_API_KEY);

		if (this.getConfiguration().get<string>(CONFIGURATION_KEYS.apiKey)) {
			await this.getConfiguration().update(
				CONFIGURATION_KEYS.apiKey,
				undefined,
				vscode.ConfigurationTarget.Global
			);
		}

		const legacyConfig = vscode.workspace.getConfiguration(LEGACY_CONFIGURATION_SECTION);
		if (legacyConfig.get<string>(CONFIGURATION_KEYS.apiKey)) {
			await legacyConfig.update(CONFIGURATION_KEYS.apiKey, undefined, vscode.ConfigurationTarget.Global);
		}
	}

	/**
	 * Returns the configured model identifier from VS Code settings for the active (or specified) provider.
	 */
	public getModel(provider?: Provider): string {
		const targetProvider = provider ?? this.getProvider();
		if (targetProvider === Provider.Gemini) {
			const model = this.getConfiguration().get<string>(CONFIGURATION_KEYS.geminiModel, GEMINI_DEFAULT_MODEL);
			return model?.trim() || GEMINI_DEFAULT_MODEL;
		}
		if (targetProvider === Provider.Ollama) {
			const model = this.getConfiguration().get<string>(CONFIGURATION_KEYS.ollamaModel, 'llama3.2');
			return model?.trim() || 'llama3.2';
		}
		if (targetProvider === Provider.Copilot) {
			const model = this.getConfiguration().get<string>(CONFIGURATION_KEYS.copilotFamily, '');
			return model?.trim() || 'gpt-4o';
		}
		const model = this.getConfiguration().get<string>(CONFIGURATION_KEYS.model, GROQ_DEFAULT_MODEL);
		return model?.trim() || GROQ_DEFAULT_MODEL;
	}

	/**
	 * Updates the configured model in global VS Code settings for the active (or specified) provider.
	 */
	public async setModel(model: string, provider?: Provider): Promise<void> {
		const trimmedModel = model.trim();
		if (!trimmedModel) {
			throw new ConfigurationError('Model name cannot be empty.');
		}

		const targetProvider = provider ?? this.getProvider();
		this.logger?.info(`Updating configured model for ${targetProvider} to: ${trimmedModel}`);

		const key = targetProvider === Provider.Gemini
			? CONFIGURATION_KEYS.geminiModel
			: (targetProvider === Provider.Ollama
				? CONFIGURATION_KEYS.ollamaModel
				: (targetProvider === Provider.Copilot
					? CONFIGURATION_KEYS.copilotFamily
					: CONFIGURATION_KEYS.model));

		await this.getConfiguration().update(key, trimmedModel, vscode.ConfigurationTarget.Global);
	}

	/**
	 * Offers automatic one-click migration if a valid Groq API key is found in settings.json or legacy storage.
	 */
	public async migrateOldApiKeyIfNeeded(): Promise<void> {
		const legacyConfigKey =
			this.getConfiguration().get<string>(CONFIGURATION_KEYS.apiKey)?.trim() ||
			vscode.workspace
				.getConfiguration(LEGACY_CONFIGURATION_SECTION)
				.get<string>(CONFIGURATION_KEYS.apiKey)
				?.trim();

		if (!legacyConfigKey || !legacyConfigKey.startsWith('gsk_')) {
			return;
		}

		const existingSecret = await this.secrets.get(SECRET_STORAGE_API_KEY);
		if (existingSecret) {
			await this.getConfiguration().update(
				CONFIGURATION_KEYS.apiKey,
				undefined,
				vscode.ConfigurationTarget.Global
			);
			return;
		}

		this.logger?.info('Found legacy Groq API key in settings.json. Offering migration...');
		const choice = await vscode.window.showInformationMessage(
			'GitIQ: A Groq API key was found in settings.json. Move API key to secure storage?',
			'Migrate Now',
			'Ignore'
		);

		if (choice === 'Migrate Now') {
			await this.setApiKey(legacyConfigKey, Provider.Groq);
			void vscode.window.showInformationMessage('✓ Groq API Key migrated to secure storage successfully.');
		}
	}

	/**
	 * Validates extension configuration on activation and displays friendly non-blocking warning if required credentials are missing.
	 */
	public async validateConfiguration(): Promise<boolean> {
		const provider = this.getProvider();

		if (provider === Provider.Groq) {
			const hasKey = await this.hasApiKey(Provider.Groq);
			if (!hasKey) {
				this.logger?.warn('No Groq API key configured.');
				void vscode.window.showWarningMessage(
					'GitIQ: No Groq API key configured. Run "GitIQ: Set Groq API Key" or switch to GitHub Copilot.',
					'Set API Key',
					'Switch Provider'
				).then((selection) => {
					if (selection === 'Set API Key') {
						void vscode.commands.executeCommand('gitIQ.setApiKey');
					} else if (selection === 'Switch Provider') {
						void vscode.commands.executeCommand('gitIQ.selectProvider');
					}
				});
				return false;
			}
		} else if (provider === Provider.Copilot) {
			if (typeof vscode.lm === 'undefined') {
				this.logger?.warn('vscode.lm API is not available.');
				void vscode.window.showWarningMessage(
					'GitIQ: GitHub Copilot integration requires VS Code 1.90+ with Language Model API.'
				);
				return false;
			}
		} else if (provider === Provider.Gemini) {
			const hasKey = await this.hasApiKey(Provider.Gemini);
			if (!hasKey) {
				this.logger?.warn('No Gemini API key configured.');
				void vscode.window.showWarningMessage(
					'GitIQ: No Gemini API key configured. Run "GitIQ: Set Gemini API Key".',
					'Set API Key'
				).then((selection) => {
					if (selection === 'Set API Key') {
						void vscode.commands.executeCommand('gitIQ.setGeminiApiKey');
					}
				});
				return false;
			}
		}

		this.logger?.info(`Configuration validated successfully (provider: ${provider}, model: ${this.getModel(provider)}).`);
		return true;
	}

	/**
	 * Creates an immutable GitIQConfiguration snapshot for initializing AI providers.
	 *
	 * @returns Promise resolving to complete GitIQConfiguration object.
	 */
	public async getConfigurationSnapshot(): Promise<GitIQConfiguration> {
		const provider = this.getProvider();
		const config = this.getConfiguration();
		let apiKey = '';

		if (provider === Provider.Groq) {
			apiKey = await this.getApiKey(Provider.Groq);
			if (!apiKey) {
				throw new ConfigurationError(
					'Missing Groq API key. Please run "GitIQ: Set Groq API Key" or switch to another AI provider.'
				);
			}
		} else if (provider === Provider.Gemini) {
			apiKey = await this.getApiKey(Provider.Gemini);
			if (!apiKey) {
				throw new ConfigurationError(
					'Missing Google Gemini API key. Please run "GitIQ: Set Gemini API Key" or switch to another AI provider.'
				);
			}
		}
		// For Copilot, Ollama, MCP: no apiKey required!

		return {
			apiKey,
			provider,
			model: this.getModel(provider),
			temperature: config.get<number>(CONFIGURATION_KEYS.temperature, 0.2),
			timeout: config.get<number>(CONFIGURATION_KEYS.timeout, 30_000)
		};
	}

	/** Returns workspace configuration section for extension. */
	private getConfiguration(): vscode.WorkspaceConfiguration {
		return vscode.workspace.getConfiguration(CONFIGURATION_SECTION);
	}
}
