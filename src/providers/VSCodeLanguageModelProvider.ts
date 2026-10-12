import * as vscode from 'vscode';
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

/**
 * AIProvider powered by the official VS Code Language Model API (vscode.lm).
 * Utilizes the developer's existing GitHub Copilot subscription without requiring
 * external API keys, token scraping, or private session file extraction.
 */
export class VSCodeLanguageModelProvider implements AIProvider {
	public readonly provider = Provider.Copilot;
	private configuration?: ProviderConfiguration;

	public constructor(private readonly logger?: LoggerService) {}

	/**
	 * Prepares the Copilot language model provider.
	 * Does not require an API key since authentication is handled natively by VS Code.
	 */
	public async initialize(configuration: ProviderConfiguration): Promise<void> {
		this.configuration = configuration;
		this.logger?.info('VSCodeLanguageModelProvider initialized (native Copilot integration).');
	}

	/**
	 * Generates a commit-message or text response using Copilot chat models.
	 */
	public async generateCommitMessage(request: CommitRequest): Promise<CommitResponse> {
		if (typeof vscode.lm === 'undefined' || typeof vscode.lm.selectChatModels !== 'function') {
			throw new ProviderError(
				'The VS Code Language Model API is not available in this environment. ' +
				'Please update VS Code to version 1.90 or later.'
			);
		}

		this.logger?.info('Discovering available Copilot language models via vscode.lm.selectChatModels()...');

		// 1. Discover models: try copilot vendor first, fallback to any available models
		let models: vscode.LanguageModelChat[] = [];
		try {
			if (request.model) {
				models = await vscode.lm.selectChatModels({ vendor: 'copilot', family: request.model });
			}
			if (models.length === 0) {
				models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
			}
			if (models.length === 0) {
				// Fallback to any registered chat models in VS Code
				models = await vscode.lm.selectChatModels();
			}
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : String(error);
			this.logger?.error(`Error selecting language models: ${msg}`);
			throw new ProviderError(`Failed to discover language models: ${msg}`);
		}

		if (models.length === 0) {
			this.logger?.warn('No GitHub Copilot or VS Code language models found.');
			throw new ProviderAuthenticationError(
				'No GitHub Copilot language models found. ' +
				'Please verify that GitHub Copilot is installed, authenticated, and enabled in VS Code.'
			);
		}

		const selectedModel = models[0];
		const modelId = `${selectedModel.vendor}/${selectedModel.family}`;
		this.logger?.info(`Using language model: ${modelId} (${selectedModel.name})`);

		// 2. Prepare user message
		const messages: vscode.LanguageModelChatMessage[] = [
			vscode.LanguageModelChatMessage.User(request.prompt)
		];

		// 3. Handle cancellation
		const tokenSource = new vscode.CancellationTokenSource();
		const effectiveToken = (request.cancellationToken as vscode.CancellationToken) ?? tokenSource.token;

		// 4. Stream response from model with proper error handling
		try {
			this.logger?.info('Sending request to VS Code Language Model API...');
			const chatResponse = await selectedModel.sendChatRequest(
				messages,
				{},
				effectiveToken
			);

			let fullContent = '';
			for await (const chunk of chatResponse.text) {
				fullContent += chunk;
			}

			const trimmedContent = fullContent.trim();
			if (!trimmedContent) {
				throw new ProviderError('GitHub Copilot returned an empty response.');
			}

			this.logger?.info(`Copilot response received successfully (${trimmedContent.length} chars).`);

			return {
				message: { subject: trimmedContent },
				provider: Provider.Copilot,
				model: modelId
			};
		} catch (error: unknown) {
			return this.handleLanguageModelError(error, modelId);
		} finally {
			tokenSource.dispose();
		}
	}

	/**
	 * Translates VS Code LanguageModelError codes and generic errors into helpful GitIQ errors.
	 */
	private handleLanguageModelError(error: unknown, modelId: string): never {
		if (error instanceof vscode.CancellationError) {
			this.logger?.warn('Copilot request was cancelled by the user.');
			throw new ProviderTimeoutError('The GitHub Copilot request was cancelled.');
		}

		// Handle vscode.LanguageModelError if available
		if (error && typeof error === 'object' && 'code' in error) {
			const lmError = error as { code: string; message: string };
			this.logger?.error(`VS Code Language Model error [${lmError.code}]: ${lmError.message}`);

			switch (lmError.code) {
				case 'NoPermissions':
					throw new ProviderAuthenticationError(
						'GitHub Copilot model access was not granted by the user. ' +
						'Please approve the model access prompt when requested.'
					);
				case 'Blocked':
					throw new ProviderError(
						'The request was blocked by GitHub Copilot content policy filters.'
					);
				case 'QuotaExceeded':
					throw new ProviderRateLimitError(
						'GitHub Copilot quota exceeded. Please try again later or switch to another provider.'
					);
				default:
					throw new ProviderError(
						`GitHub Copilot model error (${lmError.code}): ${lmError.message}`
					);
			}
		}

		const msg = error instanceof Error ? error.message : String(error);
		this.logger?.error(`Unexpected error during Copilot request: ${msg}`);

		if (/permission|consent|not authorized/i.test(msg)) {
			throw new ProviderAuthenticationError(
				'GitHub Copilot access denied or not authorized in VS Code. ' +
				'Please grant access or ensure your Copilot subscription is active.'
			);
		}

		if (/quota|rate limit|too many requests/i.test(msg)) {
			throw new ProviderRateLimitError(
				'GitHub Copilot quota or rate limit exceeded. Please try again later.'
			);
		}

		throw new ProviderError(`GitHub Copilot request failed on model ${modelId}: ${msg}`);
	}
}
