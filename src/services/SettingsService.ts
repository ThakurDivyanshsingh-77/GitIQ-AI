import * as vscode from 'vscode';
import { Provider, type ProviderConfiguration } from '../types/provider';
import {
	CONFIGURATION_KEYS,
	CONFIGURATION_SECTION,
	GROQ_DEFAULT_MODEL
} from '../utils/constants';
import { ConfigurationError } from '../utils/errors';
import type { LoggerService } from './loggerService';

/** Key identifier used to store the Groq API key in VS Code SecretStorage. */
export const SECRET_STORAGE_API_KEY = 'commitpilot.groqApiKey';

/** Complete configuration container including active provider. */
export interface CommitPilotConfiguration extends ProviderConfiguration {
	readonly provider: Provider;
}

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

/**
 * Manages secure API key storage in VS Code SecretStorage and settings configuration.
 */
export class SettingsService {
	public constructor(
		private readonly secrets: vscode.SecretStorage,
		private readonly logger?: LoggerService
	) {}

	/**
	 * Retrieves the Groq API key securely from SecretStorage, with fallback to legacy settings.json.
	 *
	 * @returns Groq API key string or empty string if not found.
	 */
	public async getApiKey(): Promise<string> {
		try {
			const secretKey = await this.secrets.get(SECRET_STORAGE_API_KEY);
			if (secretKey?.trim()) {
				return secretKey.trim();
			}
		} catch (error: unknown) {
			this.logger?.warn(`SecretStorage get error: ${error instanceof Error ? error.message : String(error)}`);
		}

		// Fallback to settings.json
		const legacyKey = this.getConfiguration().get<string>(CONFIGURATION_KEYS.apiKey)?.trim();
		return legacyKey || '';
	}

	/**
	 * Stores the Groq API key securely in VS Code SecretStorage and removes any legacy key from settings.json.
	 *
	 * @param apiKey Raw API key string starting with 'gsk_'.
	 */
	public async setApiKey(apiKey: string): Promise<void> {
		const trimmedKey = apiKey.trim();
		if (!trimmedKey) {
			throw new ConfigurationError('API key cannot be empty.');
		}

		if (!trimmedKey.startsWith('gsk_')) {
			throw new ConfigurationError("Invalid Groq API key format. API key must start with 'gsk_'.");
		}

		this.logger?.info('Storing Groq API Key securely in SecretStorage...');
		await this.secrets.store(SECRET_STORAGE_API_KEY, trimmedKey);

		// Clean up legacy setting if present
		const legacyKey = this.getConfiguration().get<string>(CONFIGURATION_KEYS.apiKey);
		if (legacyKey) {
			this.logger?.info('Removing legacy API key from settings.json...');
			await this.getConfiguration().update(
				CONFIGURATION_KEYS.apiKey,
				undefined,
				vscode.ConfigurationTarget.Global
			);
		}
	}

	/**
	 * Checks whether a Groq API key is currently stored in SecretStorage or settings.
	 *
	 * @returns True if a non-empty API key exists.
	 */
	public async hasApiKey(): Promise<boolean> {
		const key = await this.getApiKey();
		return key.length > 0;
	}

	/**
	 * Deletes the stored Groq API key from SecretStorage and legacy settings.json.
	 */
	public async removeApiKey(): Promise<void> {
		this.logger?.info('Removing Groq API Key from SecretStorage and configuration...');
		await this.secrets.delete(SECRET_STORAGE_API_KEY);

		const legacyKey = this.getConfiguration().get<string>(CONFIGURATION_KEYS.apiKey);
		if (legacyKey) {
			await this.getConfiguration().update(
				CONFIGURATION_KEYS.apiKey,
				undefined,
				vscode.ConfigurationTarget.Global
			);
		}
	}

	/**
	 * Returns the configured Groq model identifier from VS Code settings.
	 *
	 * @returns Model string.
	 */
	public getModel(): string {
		const model = this.getConfiguration().get<string>(CONFIGURATION_KEYS.model, GROQ_DEFAULT_MODEL);
		return model.trim() || GROQ_DEFAULT_MODEL;
	}

	/**
	 * Updates the configured Groq model in global VS Code settings.
	 *
	 * @param model Model string to store.
	 */
	public async setModel(model: string): Promise<void> {
		const trimmedModel = model.trim();
		if (!trimmedModel) {
			throw new ConfigurationError('Model name cannot be empty.');
		}

		this.logger?.info(`Updating configured Groq model to: ${trimmedModel}`);
		await this.getConfiguration().update(
			CONFIGURATION_KEYS.model,
			trimmedModel,
			vscode.ConfigurationTarget.Global
		);
	}

	/**
	 * Offers automatic one-click migration if a valid Groq API key is found in settings.json.
	 */
	public async migrateOldApiKeyIfNeeded(): Promise<void> {
		const legacyKey = this.getConfiguration().get<string>(CONFIGURATION_KEYS.apiKey)?.trim();
		if (!legacyKey || !legacyKey.startsWith('gsk_')) {
			return;
		}

		const existingSecret = await this.secrets.get(SECRET_STORAGE_API_KEY);
		if (existingSecret) {
			// Secret already exists, clean up legacy setting quietly
			await this.getConfiguration().update(
				CONFIGURATION_KEYS.apiKey,
				undefined,
				vscode.ConfigurationTarget.Global
			);
			return;
		}

		this.logger?.info('Found legacy Groq API key in settings.json. Offering migration...');
		const choice = await vscode.window.showInformationMessage(
			'CommitPilot AI: A Groq API key was found in settings.json. Move API key to secure storage?',
			'Migrate Now',
			'Ignore'
		);

		if (choice === 'Migrate Now') {
			await this.setApiKey(legacyKey);
			void vscode.window.showInformationMessage('✓ Groq API Key migrated to secure storage successfully.');
		}
	}

	/**
	 * Validates extension configuration on activation and displays friendly non-blocking warning if API key is missing.
	 */
	public async validateConfiguration(): Promise<boolean> {
		const hasKey = await this.hasApiKey();

		if (!hasKey) {
			this.logger?.warn('No Groq API key configured.');
			void vscode.window.showWarningMessage(
				'CommitPilot AI: No Groq API key configured. Run "CommitPilot AI: Set Groq API Key".',
				'Set API Key'
			).then((selection) => {
				if (selection === 'Set API Key') {
					void vscode.commands.executeCommand('commitPilotAI.setApiKey');
				}
			});
			return false;
		}

		this.logger?.info(`Configuration validated successfully (model: ${this.getModel()}).`);
		return true;
	}

	/**
	 * Creates an immutable CommitPilotConfiguration snapshot for initializing AI providers.
	 *
	 * @returns Promise resolving to complete CommitPilotConfiguration object.
	 */
	public async getConfigurationSnapshot(): Promise<CommitPilotConfiguration> {
		const apiKey = await this.getApiKey();
		if (!apiKey) {
			throw new ConfigurationError(
				'Missing Groq API key. Please run "CommitPilot AI: Set Groq API Key".'
			);
		}

		const config = this.getConfiguration();
		return {
			apiKey,
			provider: Provider.Groq,
			model: this.getModel(),
			temperature: config.get<number>(CONFIGURATION_KEYS.temperature, 0.2),
			timeout: config.get<number>(CONFIGURATION_KEYS.timeout, 30_000)
		};
	}

	/** Returns workspace configuration section for extension. */
	private getConfiguration(): vscode.WorkspaceConfiguration {
		return vscode.workspace.getConfiguration(CONFIGURATION_SECTION);
	}
}
