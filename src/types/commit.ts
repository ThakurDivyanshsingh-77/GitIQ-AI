import type { Provider } from './provider';

/** A generated commit message with an optional explanatory body. */
export interface CommitMessage {
	readonly subject: string;
	readonly body?: string;
}

/** Input passed to an AI provider when commit generation is introduced. */
export interface CommitRequest {
	readonly stagedDiff: string;
	readonly prompt: string;
	readonly provider: Provider;
	readonly model?: string;
}

/** Normalized result returned by any AI provider implementation. */
export interface CommitResponse {
	readonly message: CommitMessage;
	readonly provider: Provider;
	readonly model: string;
}
