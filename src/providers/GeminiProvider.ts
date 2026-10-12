import type { AIProvider } from './AIProvider';
import type { CommitRequest, CommitResponse } from '../types/commit';
import { Provider, type ProviderConfiguration } from '../types/provider';
import {
	GEMINI_API_BASE_URL,
	GEMINI_DEFAULT_MODEL
} from '../utils/constants';
import {
	ProviderAuthenticationError,
	ProviderError,
	ProviderRateLimitError,
	ProviderTimeoutError
} from '../utils/errors';
import type { LoggerService } from '../services/loggerService';

export { GEMINI_DEFAULT_MODEL };

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
		const model = this.resolveModel(configuration.model);
		this.logger?.info(`GeminiProvider initialized (model: ${model}).`);
	}

	public async generateCommitMessage(request: CommitRequest): Promise<CommitResponse> {
		if (!this.configuration?.apiKey) {
			throw new ProviderAuthenticationError('Gemini API key is missing. Run "GitIQ: Set Gemini API Key".');
		}

		const apiKey = this.configuration.apiKey.trim();
		const model = this.resolveModel(request.model ?? this.configuration.model);
		const endpoint = `${GEMINI_API_BASE_URL}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

		this.logger?.info(`Sending request to Google Gemini API (model: ${model})...`);

		const controller = new AbortController();
		const timeoutMs = this.configuration.timeout || 30000;
		const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

		try {
			const res = await fetch(endpoint, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-goog-api-key': apiKey
				},
				body: JSON.stringify({
					contents: [{ parts: [{ text: request.prompt }] }],
					generationConfig: {
						temperature: this.configuration.temperature ?? 0.2,
						maxOutputTokens: request.maxTokens ?? 1024
					}
				}),
				signal: controller.signal
			});

			if (!res.ok) {
				const errorJson = (await res.json().catch(() => null)) as {
					error?: {
						code?: number;
						message?: string;
						status?: string;
						details?: Array<{ reason?: string }>;
					};
				} | null;

				const errMessage = errorJson?.error?.message || `HTTP ${res.status} ${res.statusText}`;
				const reason = errorJson?.error?.details?.[0]?.reason;

				if (
					res.status === 401 ||
					res.status === 403 ||
					reason === 'API_KEY_INVALID' ||
					/api key/i.test(errMessage)
				) {
					throw new ProviderAuthenticationError(`Gemini authentication failed: ${errMessage}`);
				}
				if (res.status === 429 || /quota/i.test(errMessage)) {
					throw new ProviderRateLimitError(`Gemini rate limit or quota exceeded (429): ${errMessage}`);
				}
				if (res.status === 404) {
					throw new ProviderError(`Gemini model "${model}" not found (404): ${errMessage}`);
				}
				throw new ProviderError(`Gemini API error (${res.status}): ${errMessage}`);
			}

			const data = (await res.json()) as {
				candidates?: Array<{
					content?: { parts?: Array<{ text?: string }> };
					finishReason?: string;
				}>;
			};

			const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
			if (!text) {
				const finishReason = data.candidates?.[0]?.finishReason;
				throw new ProviderError(
					`Gemini returned an empty response${finishReason ? ` (finishReason: ${finishReason})` : ''}.`
				);
			}

			return {
				message: { subject: text },
				provider: Provider.Gemini,
				model
			};
		} catch (error: unknown) {
			if (error instanceof Error && error.name === 'AbortError') {
				throw new ProviderTimeoutError(`Gemini request timed out after ${timeoutMs}ms.`);
			}
			throw error;
		} finally {
			clearTimeout(timeoutId);
		}
	}

	/**
	 * Ensures the model name is a valid Gemini model, falling back to GEMINI_DEFAULT_MODEL
	 * if a cross-provider model name (e.g. from Groq or Ollama) was passed.
	 */
	private resolveModel(configuredModel?: string): string {
		if (!configuredModel) {
			return GEMINI_DEFAULT_MODEL;
		}
		const trimmed = configuredModel.trim();
		if (!trimmed || trimmed.startsWith('llama') || trimmed.startsWith('openai') || trimmed.startsWith('deepseek')) {
			return GEMINI_DEFAULT_MODEL;
		}
		return trimmed;
	}
}

