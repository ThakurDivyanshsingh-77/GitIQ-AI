import Groq, {
	APIConnectionError,
	APIConnectionTimeoutError,
	APIError
} from 'groq-sdk';
import type { AIProvider } from './AIProvider';
import type { CommitRequest, CommitResponse } from '../types/commit';
import { Provider, type ProviderConfiguration } from '../types/provider';
import { GROQ_DEFAULT_MODEL } from '../utils/constants';
import {
	ProviderAuthenticationError,
	ProviderError,
	ProviderNetworkError,
	ProviderPayloadTooLargeError,
	ProviderRateLimitError,
	ProviderResponseError,
	ProviderTimeoutError
} from '../utils/errors';
import type { LoggerService } from '../services/loggerService';

/**
 * Groq Chat Completions provider with automatic single-retry logic for network & temporary server failures.
 */
export class GroqProvider implements AIProvider {
	public readonly provider = Provider.Groq;
	private client: Groq | undefined;
	private configuration: ProviderConfiguration | undefined;

	public constructor(private readonly logger?: LoggerService) {}

	/** Creates a configured official Groq SDK client for the current request flow. */
	public async initialize(configuration: ProviderConfiguration): Promise<void> {
		const apiKey = configuration.apiKey?.trim();

		if (!apiKey) {
			this.logger?.error('Groq configuration failure: API key is missing.');
			throw new ProviderAuthenticationError('Groq API key is missing.');
		}

		this.configuration = configuration;
		this.client = new Groq({
			apiKey,
			timeout: configuration.timeout,
			maxRetries: 0
		});
		this.logger?.info(`GroqProvider initialized (model: ${configuration.model || GROQ_DEFAULT_MODEL}).`);
	}

	/** Sends the prepared prompt with automatic single retry for transient failures. */
	public async generateCommitMessage(request: CommitRequest): Promise<CommitResponse> {
		const configuration = this.getInitializedConfiguration();
		const client = this.getInitializedClient();
		const model = request.model ?? configuration.model ?? GROQ_DEFAULT_MODEL;

		const maxAttempts = 2;
		let lastError: unknown;

		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			try {
				if (attempt > 1) {
					this.logger?.warn(`Retrying Groq API request (Attempt ${attempt}/${maxAttempts})...`);
				} else {
					this.logger?.info(`Sending request to Groq API (model: ${model})...`);
				}

				const completion = await client.chat.completions.create({
					model,
					messages: [{ role: 'user', content: request.prompt }],
					temperature: configuration.temperature,
					max_completion_tokens: request.maxTokens ?? 80,
					stream: false
				});

				const content = completion.choices[0]?.message.content;

				if (typeof content !== 'string' || !content.trim()) {
					throw new ProviderResponseError('Groq returned an empty or unexpected response.');
				}

				this.logger?.info(`Groq API response received successfully on attempt ${attempt}.`);

				return {
					message: { subject: content.trim() },
					provider: Provider.Groq,
					model: completion.model || model
				};
			} catch (error: unknown) {
				lastError = error;
				this.logSdkFailure(error, configuration.timeout, model, attempt);

				const isRetryable = this.isRetryableError(error);

				if (attempt < maxAttempts && isRetryable) {
					this.logger?.warn(`Groq request failed on attempt ${attempt} with retryable error. Retrying in 1s...`);
					await new Promise((resolve) => setTimeout(resolve, 1000));
					continue;
				}

				break;
			}
		}

		const providerError = this.toProviderError(lastError);
		Object.defineProperty(providerError, 'cause', {
			value: lastError,
			configurable: true
		});

		throw providerError;
	}

	/** Determines whether an error is transient and eligible for automatic retry. */
	private isRetryableError(error: unknown): boolean {
		if (error instanceof APIConnectionTimeoutError || error instanceof APIConnectionError) {
			return true;
		}

		if (error instanceof APIError) {
			// 429 rate limit or 5xx server errors are transient/retryable
			return error.status === 429 || (error.status !== undefined && error.status >= 500);
		}

		return false;
	}

	/** Ensures the provider cannot be used before initialization. */
	private getInitializedConfiguration(): ProviderConfiguration {
		if (!this.configuration) {
			throw new ProviderError('Groq provider has not been initialized.');
		}
		return this.configuration;
	}

	/** Ensures the SDK client cannot be used before initialization. */
	private getInitializedClient(): Groq {
		if (!this.client) {
			throw new ProviderError('Groq provider has not been initialized.');
		}
		return this.client;
	}

	/** Converts SDK and transport failures into stable domain error types. */
	private toProviderError(error: unknown): ProviderError {
		if (error instanceof ProviderError) {
			return error;
		}

		if (error instanceof APIConnectionTimeoutError) {
			return new ProviderTimeoutError('Groq API request timed out. Please check your connection and try again.');
		}

		if (error instanceof APIConnectionError) {
			return new ProviderNetworkError('Network unavailable. Please check your internet connection.');
		}

		if (error instanceof APIError) {
			if (error.status === 401 || error.status === 403) {
				return new ProviderAuthenticationError('API key missing or invalid. Please configure your Groq API key in VS Code Settings.');
			}

			if (error.status === 429) {
				return new ProviderRateLimitError('Rate limit exceeded. Please wait a moment before trying again.');
			}

			if (error.status === 413) {
				return new ProviderPayloadTooLargeError('Token limit exceeded. Staged changes are too large for the AI model.');
			}

			return new ProviderError(`Groq request failed${error.status ? ` (HTTP ${error.status})` : ''}.`);
		}

		if (error instanceof SyntaxError) {
			return new ProviderResponseError('Groq returned malformed JSON.');
		}

		return new ProviderResponseError('Groq returned an unexpected response.');
	}

	/** Logs complete SDK diagnostics without exposing secret API keys or prompt contents. */
	private logSdkFailure(error: unknown, timeout: number, model: string, attempt: number): void {
		const apiError = error instanceof APIError ? error : undefined;

		this.logger?.error(`[Attempt ${attempt}] Groq SDK request failure`, {
			originalError: error,
			stack: error instanceof Error ? error.stack : undefined,
			sdkErrorName: error instanceof Error ? error.name : typeof error,
			httpStatus: apiError?.status,
			groqResponseBody: apiError?.error,
			requestTimeoutMs: timeout,
			model,
			missingApiKey: false,
			invalidJson: error instanceof SyntaxError
		});
	}
}
