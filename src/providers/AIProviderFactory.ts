import type { AIProvider } from './AIProvider';
import { GroqProvider } from './GroqProvider';
import { Provider } from '../types/provider';
import { ProviderError } from '../utils/errors';
import type { LoggerService } from '../services/loggerService';

/** Resolves an AI provider implementation without coupling services to a vendor. */
export interface AIProviderFactory {
	getProvider(provider: Provider): AIProvider;
}

/** Creates the provider implementations that are currently available to GitIQ. */
export class GitIQAIProviderFactory implements AIProviderFactory {
	public constructor(private readonly logger?: LoggerService) {}

	/** Returns a fresh provider to prevent configuration state from leaking between requests. */
	public getProvider(provider: Provider): AIProvider {
		if (provider === Provider.Groq) {
			return new GroqProvider(this.logger);
		}

		throw new ProviderError(`The ${provider} provider is not available.`);
	}
}

/** Legacy alias for GitIQAIProviderFactory. */
export { GitIQAIProviderFactory as CommitPilotAIProviderFactory };
