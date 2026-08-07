import type { AIProviderFactory } from '../providers/AIProviderFactory';
import type { CommitMessage } from '../types/commit';
import { InvalidCommitMessageError, NoStagedChangesError, NotGitRepositoryError } from '../utils/errors';
import type { SettingsService } from './SettingsService';
import type { GitService } from './gitService';
import type { CommitMessageValidator } from './commitMessageValidator';
import type { PromptBuilder } from './promptBuilder';
import type { LoggerService } from './loggerService';

/** Return container holding the generated CommitMessage and prompt truncation status. */
export interface GenerationResult {
	readonly message: CommitMessage;
	readonly isTruncated: boolean;
}

/**
 * Coordinates the Git, prompt, provider, validation, and commit execution layers.
 */
export class CommitMessageService {
	public constructor(
		private readonly gitService: GitService,
		private readonly settingsService: SettingsService,
		private readonly promptBuilder: PromptBuilder,
		private readonly providerFactory: AIProviderFactory,
		private readonly commitMessageValidator: CommitMessageValidator,
		private readonly logger?: LoggerService
	) {}

	/** Generates and validates a commit-message suggestion for one workspace folder. */
	public async generateCommitMessage(workspacePath: string): Promise<GenerationResult> {
		this.logger?.info(`Starting commit message generation for workspace: ${workspacePath}`);

		if (!(await this.gitService.isGitRepository(workspacePath))) {
			this.logger?.warn('Git repository check failed: workspace is not a Git repository.');
			throw new NotGitRepositoryError('This workspace is not a Git repository.');
		}

		// Read diff once for maximum performance
		const stagedDiff = await this.gitService.getStagedDiff(workspacePath);

		if (!stagedDiff.hasChanges) {
			this.logger?.warn('No staged changes found in workspace.');
			throw new NoStagedChangesError('No staged changes found.');
		}

		const configuration = await this.settingsService.getConfigurationSnapshot();
		const provider = this.providerFactory.getProvider(configuration.provider);
		const promptResult = this.promptBuilder.buildCommitMessagePrompt(stagedDiff.content);

		if (promptResult.isTruncated) {
			this.logger?.warn(
				`Staged diff exceeded context limit (${promptResult.originalLength} chars). Truncated to ${promptResult.truncatedLength} chars.`
			);
		}

		await provider.initialize(configuration);

		this.logger?.info('Calling AI provider to generate commit message...');
		const response = await provider.generateCommitMessage({
			stagedDiff: stagedDiff.content,
			prompt: promptResult.prompt,
			provider: configuration.provider,
			model: configuration.model
		});

		const rawResponse = response.message.subject;
		this.logger?.info(`[Groq API Response] Raw response text:\n"${rawResponse}"`);

		const validation = this.commitMessageValidator.validate(rawResponse);
		this.logger?.info(`[Sanitizer] Extracted message content: "${validation.sanitized}"`);
		this.logger?.info(
			`[Validation Result] Status: ${validation.isValid ? 'PASSED' : 'FAILED'}${validation.reason ? ` | Reason: ${validation.reason}` : ''}`
		);

		if (!validation.isValid) {
			const reason = validation.reason || 'Invalid commit message format.';
			this.logger?.error(`[Validation Failure] Raw response: "${rawResponse}"`);
			this.logger?.error(`[Validation Failure] Reason: ${reason}`);
			this.logger?.show(); // Reveal output channel so raw response is immediately visible to user

			throw new InvalidCommitMessageError(`Validation failed: ${reason}`);
		}

		return {
			message: { subject: validation.sanitized },
			isTruncated: promptResult.isTruncated
		};
	}

	/** Explains a specific commit using the active AI provider. */
	public async explainCommit(workspacePath: string, hash: string): Promise<string> {
		this.logger?.info(`Starting AI explanation for commit: ${hash}`);

		if (!(await this.gitService.isGitRepository(workspacePath))) {
			throw new NotGitRepositoryError('This workspace is not a Git repository.');
		}

		const rawCommitShow = await this.gitService.getCommitShowRaw(workspacePath, hash);

		if (!rawCommitShow.trim()) {
			throw new Error(`Unable to read commit details for hash: ${hash}`);
		}

		const promptResult = this.promptBuilder.buildCommitExplainPrompt(rawCommitShow);
		const configuration = await this.settingsService.getConfigurationSnapshot();
		const provider = this.providerFactory.getProvider(configuration.provider);

		await provider.initialize(configuration);

		this.logger?.info(`Sending commit explanation request to AI provider (${configuration.provider})...`);
		const response = await provider.generateCommitMessage({
			stagedDiff: rawCommitShow,
			prompt: promptResult.prompt,
			provider: configuration.provider,
			model: configuration.model,
			maxTokens: 512
		});

		this.logger?.info(`AI commit explanation received successfully for ${hash}.`);
		return response.message.subject;
	}

	/** Commits staged changes in the specified workspace directory with a message. */
	public async commit(workspacePath: string, message: string): Promise<void> {
		this.logger?.info(`[Pre-Commit] Final commit message before git commit: "${message}"`);
		this.logger?.info(`Delegating commit execution to GitService...`);
		await this.gitService.commit(workspacePath, message);
	}
}
