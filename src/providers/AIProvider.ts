import type { CommitRequest, CommitResponse } from '../types/commit';
import type { Provider, ProviderConfiguration } from '../types/provider';

/**
 * Defines the provider boundary used by future AI integrations. Consumers
 * depend on this contract rather than any vendor-specific SDK or API.
 */
export interface AIProvider {
	readonly provider: Provider;

	/** Validates and prepares the provider for request execution. */
	initialize(configuration: ProviderConfiguration): Promise<void>;

	/** Produces a normalized commit-message result for the supplied request. */
	generateCommitMessage(request: CommitRequest): Promise<CommitResponse>;
}
