import type { AIProvider } from './AIProvider';
import type { CommitRequest, CommitResponse } from '../types/commit';
import { Provider, type ProviderConfiguration } from '../types/provider';
import {
	ProviderAuthenticationError,
	ProviderError,
	ProviderRateLimitError,
	ProviderTimeoutError
} from '../utils/errors';
import type { LoggerService } from '../services/loggerService';

export const GEMINI_DEFAULT_MODEL = 'gemini-1.5-flash';

/**
 * AIProvider powered by Google Gemini API via official REST interface.
 */
export class GeminiProvider implements AIProvider {
	public readonly provider = Provider.Gemini;
	private configuration?: ProviderConfiguration;

	public constructor(private readonly logger?: LoggerService) {}

	public async initialize(configuration: ProviderConfiguration): Promise<void> {
		const apiKey = configuration.apiKey?.trim();
		if (!apiKey) {
			this.logger?.error('Gemini configuration failure: API key is missing.');
			throw new ProviderAuthenticationError('Gemini API key is missing. Run "GitIQ: Set Gemini API Key".');
		}
		this.configuration = configuration;
		this.logger?.info(`GeminiProvider initialized (model: ${configuration.model || GEMINI_DEFAULT_MODEL}).`);
	}

	public async generateCommitMessage(request: CommitRequest): Promise<CommitResponse> {
		if (!this.configuration?.apiKey) {
			throw new ProviderAuthenticationError('Gemini API key is missing.');
		}

		const model = request.model ?? this.configuration.model ?? GEMINI_DEFAULT_MODEL;
		const apiKey = this.configuration.apiKey;
		const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

		this.logger?.info(`Sending request to Google Gemini API (model: ${model})...`);

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), this.configuration.timeout || 30000);

		try {
			const res = await fetch(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					contents: [{ parts: [{ text: request.prompt }] }],
					generationConfig: {
						temperature: this.configuration.temperature ?? 0.2,
						maxOutputTokens: request.maxTokens ?? 128
					}
				}),
				signal: controller.signal
			});

			if (!res.ok) {
				const errorBody = await res.text().catch(() => '');
				if (res.status === 401 || res.status === 403) {
					throw new ProviderAuthenticationError(`Invalid Gemini API key (${res.status}): ${errorBody}`);
				}
				if (res.status === 429) {
					throw new ProviderRateLimitError(`Gemini quota or rate limit exceeded (429): ${errorBody}`);
				}
				throw new ProviderError(`Gemini API error (${res.status}): ${errorBody}`);
			}

			const data = (await res.json()) as {
				candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
			};

			const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
			if (!text) {
				throw new ProviderError('Gemini returned an empty response.');
			}

			return {
				message: { subject: text },
				provider: Provider.Gemini,
				model
			};
		} catch (error: unknown) {
			if (error instanceof Error && error.name === 'AbortError') {
				throw new ProviderTimeoutError('Gemini request timed out.');
			}
			throw error;
		} finally {
			clearTimeout(timeoutId);
		}
	}
}
