import * as vscode from 'vscode';
import { Provider, type ProviderConfiguration } from '../types/provider';
import {
	CONFIGURATION_KEYS,
	CONFIGURATION_SECTION,
	EXTENSION_ID,
	GROQ_DEFAULT_MODEL
} from '../utils/constants';
import { ConfigurationError } from '../utils/errors';
import type { LoggerService } from './loggerService';

/** Complete, validated configuration used to construct an AI provider. */
export interface CommitPilotConfiguration extends ProviderConfiguration {
	readonly provider: Provider;
}

/**
 * Reads and validates CommitPilot AI configuration without presenting blocking errors or
 * coupling callers to VS Code's internal configuration API.
 */
export class ConfigService {
	/** Validates extension configuration on activation and reports warnings if key items are missing. */
	public validateConfiguration(logger?: LoggerService): boolean {
		const apiKey = this.getConfiguration().get<string>(CONFIGURATION_KEYS.apiKey)?.trim();

		if (!apiKey) {
			logger?.warn('Groq API key is missing in VS Code configuration.');
			void vscode.window.showWarningMessage(
				'CommitPilot AI: API key is missing. Please configure commitPilotAI.apiKey in Settings.'
			);
			return false;
		}

		logger?.info(
			`Configuration validated successfully (provider: ${this.getProvider()}, model: ${this.getModel()}).`
		);
		return true;
	}

	/** Returns the required API key for the selected cloud provider. */
	public getApiKey(): string {
		const apiKey = this.getConfiguration().get<string>(CONFIGURATION_KEYS.apiKey);
		const normalizedApiKey = apiKey?.trim();

		if (!normalizedApiKey) {
			throw new ConfigurationError(
				`Missing ${EXTENSION_ID}.${CONFIGURATION_KEYS.apiKey} configuration value.`
			);
		}

		return normalizedApiKey;
	}

	/** Returns the configured provider. */
	public getProvider(): Provider {
		const configuredProvider = this.getConfiguration().get<string>(
			CONFIGURATION_KEYS.provider,
			Provider.Groq
		);

		if (Object.values(Provider).includes(configuredProvider as Provider)) {
			return configuredProvider as Provider;
		}

		throw new ConfigurationError(`Unsupported ${EXTENSION_ID} provider: ${configuredProvider}.`);
	}

	/** Returns the configured model identifier with a stable Groq default. */
	public getModel(): string {
		const model = this.getConfiguration().get<string>(CONFIGURATION_KEYS.model, GROQ_DEFAULT_MODEL);
		const normalizedModel = model.trim();

		if (!normalizedModel) {
			throw new ConfigurationError(`Missing ${EXTENSION_ID}.${CONFIGURATION_KEYS.model} value.`);
		}

		return normalizedModel;
	}

	/** Returns a bounded generation temperature. */
	public getTemperature(): number {
		return this.getBoundedNumber(CONFIGURATION_KEYS.temperature, 0.2, 0, 2);
	}

	/** Returns a positive request timeout in milliseconds. */
	public getTimeout(): number {
		return this.getBoundedNumber(CONFIGURATION_KEYS.timeout, 30_000, 1, Number.MAX_SAFE_INTEGER);
	}

	/** Returns all options as an immutable provider-ready configuration. */
	public getConfigurationSnapshot(): CommitPilotConfiguration {
		return {
			apiKey: this.getApiKey(),
			provider: this.getProvider(),
			model: this.getModel(),
			temperature: this.getTemperature(),
			timeout: this.getTimeout()
		};
	}

	/** Obtains the extension-scoped configuration object. */
	private getConfiguration(): vscode.WorkspaceConfiguration {
		return vscode.workspace.getConfiguration(CONFIGURATION_SECTION);
	}

	/** Reads and validates one finite numeric configuration value. */
	private getBoundedNumber(
		key: string,
		fallback: number,
		minimum: number,
		maximum: number
	): number {
		const value = this.getConfiguration().get<number>(key, fallback);

		if (!Number.isFinite(value) || value < minimum || value > maximum) {
			throw new ConfigurationError(
				`Invalid ${EXTENSION_ID}.${key} value. Expected a number between ${minimum} and ${maximum}.`
			);
		}

		return value;
	}
}
