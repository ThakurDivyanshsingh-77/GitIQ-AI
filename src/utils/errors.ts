/** Base error class for all GitIQ domain exceptions. */
export class GitIQError extends Error {
	public constructor(message: string) {
		super(message);
		this.name = this.constructor.name;
		Error.captureStackTrace?.(this, this.constructor);
	}
}

/** Legacy alias for GitIQError. */
export { GitIQError as CommitPilotError };

/** Base error for local Git process execution failures. */
export class GitError extends GitIQError {}

/** Raised when an operation is executed outside of a valid Git work tree. */
export class NotGitRepositoryError extends GitError {}

/** Raised when user requests commit generation with no staged changes. */
export class NoStagedChangesError extends GitError {}

/** Raised when `git commit` process execution fails. */
export class GitCommitError extends GitError {}

/** Base error for AI provider operations. */
export class ProviderError extends GitIQError {}

/** Raised when invalid or incomplete GitIQ configuration is supplied. */
export class ConfigurationError extends GitIQError {}

/** Raised when API key authentication fails with the AI provider. */
export class ProviderAuthenticationError extends ProviderError {}

/** Raised when API rate limits are exceeded. */
export class ProviderRateLimitError extends ProviderError {}

/** Raised when staged diff exceeds the AI model context limit. */
export class ProviderPayloadTooLargeError extends ProviderError {}

/** Raised when network connection is unavailable. */
export class ProviderNetworkError extends ProviderError {}

/** Raised when request times out. */
export class ProviderTimeoutError extends ProviderError {}

/** Raised when provider returns empty or malformed output. */
export class ProviderResponseError extends ProviderError {}

/** Raised when AI generated commit message fails validation rules. */
export class InvalidCommitMessageError extends GitIQError {}
