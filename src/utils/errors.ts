/** Base error type for extension-domain failures with a consistent prototype chain. */
class CommitPilotError extends Error {
	public constructor(message: string) {
		super(message);
		this.name = new.target.name;
		Object.setPrototypeOf(this, new.target.prototype);
	}
}

/** Represents a failure while inspecting or reading a local Git repository. */
export class GitError extends CommitPilotError {}

/** Represents a failure while configuring or invoking an AI provider. */
export class ProviderError extends CommitPilotError {}

/** Represents invalid or incomplete CommitPilot AI configuration. */
export class ConfigurationError extends CommitPilotError {}

/** Indicates that a requested workspace folder is not a Git repository. */
export class NotGitRepositoryError extends GitError {}

/** Indicates that a repository does not currently contain staged changes. */
export class NoStagedChangesError extends GitError {}

/** Indicates that executing a git commit command failed. */
export class GitCommitError extends GitError {}

/** Indicates that a provider request exceeded the configured timeout. */
export class ProviderTimeoutError extends ProviderError {}

/** Indicates that the provider could not be reached over the network. */
export class ProviderNetworkError extends ProviderError {}

/** Indicates that the provider rejected the configured credentials. */
export class ProviderAuthenticationError extends ProviderError {}

/** Indicates that the provider rejected a request because of rate limiting. */
export class ProviderRateLimitError extends ProviderError {}

/** Indicates that a provider response could not be safely interpreted. */
export class ProviderResponseError extends ProviderError {}

/** Indicates that the request payload (staged diff) exceeded the model's size limit. */
export class ProviderPayloadTooLargeError extends ProviderError {}

/** Indicates that an AI response violates the commit-message policy. */
export class InvalidCommitMessageError extends ProviderError {}

