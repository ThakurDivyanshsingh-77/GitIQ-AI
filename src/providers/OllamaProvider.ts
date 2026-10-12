import type { AIProvider } from './AIProvider';
import type { CommitRequest, CommitResponse } from '../types/commit';
import { Provider, type ProviderConfiguration } from '../types/provider';
import { ProviderError, ProviderNetworkError, ProviderTimeoutError } from '../utils/errors';
import type { LoggerService } from '../services/loggerService';

export const OLLAMA_DEFAULT_MODEL = 'llama3.2';
export const OLLAMA_DEFAULT_ENDPOINT = 'http://localhost:11434';

/**
 * AIProvider connecting to a local Ollama server for 100% offline, private inference.
 */
export class OllamaProvider implements AIProvider {
	public readonly provider = Provider.Ollama;
	private configuration?: ProviderConfiguration;

	public constructor(private readonly logger?: LoggerService) {}

	public async initialize(configuration: ProviderConfiguration): Promise<void> {
		this.configuration = configuration;
		this.logger?.info(`OllamaProvider initialized (endpoint: ${configuration.endpoint || OLLAMA_DEFAULT_ENDPOINT}).`);
	}

	public async generateCommitMessage(request: CommitRequest): Promise<CommitResponse> {
		const endpoint = this.configuration?.endpoint || OLLAMA_DEFAULT_ENDPOINT;
		const model = request.model ?? this.configuration?.model ?? OLLAMA_DEFAULT_MODEL;
		const url = `${endpoint.replace(/\/+$/, '')}/api/generate`;

		this.logger?.info(`Sending request to local Ollama (${url}, model: ${model})...`);

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), this.configuration?.timeout || 45000);

		try {
			const res = await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model,
					prompt: request.prompt,
					stream: false,
					options: {
						temperature: this.configuration?.temperature ?? 0.2
					}
				}),
				signal: controller.signal
			});

			if (!res.ok) {
				const errorBody = await res.text().catch(() => '');
				throw new ProviderError(`Ollama returned error (${res.status}): ${errorBody}`);
			}

			const data = (await res.json()) as { response?: string };
			const text = data.response?.trim();

			if (!text) {
				throw new ProviderError('Ollama returned an empty response.');
			}

			return {
				message: { subject: text },
				provider: Provider.Ollama,
				model
			};
		} catch (error: unknown) {
			if (error instanceof Error && error.name === 'AbortError') {
				throw new ProviderTimeoutError('Ollama request timed out.');
			}
			const msg = error instanceof Error ? error.message : String(error);
			if (/ECONNREFUSED|Failed to fetch/i.test(msg)) {
				throw new ProviderNetworkError(
					`Cannot connect to Ollama at ${endpoint}. Please ensure Ollama is installed and running.`
				);
			}
			throw error;
		} finally {
			clearTimeout(timeoutId);
		}
	}
}
