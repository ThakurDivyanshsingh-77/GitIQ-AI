import type { AIProviderFactory } from '../providers/AIProviderFactory';
import { CONVENTIONAL_COMMIT_TYPES } from '../utils/constants';
import { NotGitRepositoryError } from '../utils/errors';
import type { SettingsService } from './SettingsService';
import type { GitService } from './gitService';
import type { LoggerService } from './loggerService';
import type { PromptBuilder } from './promptBuilder';

/** Parsed pull request structure returned by generatePullRequest. */
export interface PullRequestContent {
	readonly title: string;
	readonly description: string;
	readonly fullMarkdown: string;
	readonly currentBranch: string;
	readonly defaultBranch: string;
}

/**
 * Coordinates pull request generation: Git data collection → Prompt construction → AI generation → Parsing & Validation.
 */
export class PullRequestService {
	public constructor(
		private readonly gitService: GitService,
		private readonly settingsService: SettingsService,
		private readonly promptBuilder: PromptBuilder,
		private readonly providerFactory: AIProviderFactory,
		private readonly logger?: LoggerService
	) {}

	/**
	 * Generates a complete pull request document from branch diff and commit history.
	 * Retries once if the AI returns an incomplete response or fails validation.
	 */
	public async generatePullRequest(workspacePath: string): Promise<PullRequestContent> {
		this.logger?.info('Starting pull request generation...');

		if (!(await this.gitService.isGitRepository(workspacePath))) {
			throw new NotGitRepositoryError('This workspace is not a Git repository.');
		}

		const remoteUrl = await this.gitService.getRemoteUrl(workspacePath);
		if (!remoteUrl) {
			throw new Error('No remote "origin" configured. Push your branch first.');
		}

		const currentBranch = await this.gitService.getCurrentBranch(workspacePath);
		const defaultBranch = await this.gitService.getDefaultBranch(workspacePath);

		if (currentBranch === defaultBranch) {
			throw new Error(`You are on the default branch "${defaultBranch}". Switch to a feature branch first.`);
		}

		this.logger?.info(`PR: ${currentBranch} → ${defaultBranch}`);

		const branchCommits = await this.gitService.getBranchCommits(workspacePath);
		const branchDiff = await this.gitService.getBranchDiff(workspacePath);

		if (!branchCommits && !branchDiff) {
			throw new Error('No commits or differences found between your branch and the default branch.');
		}

		const promptResult = this.promptBuilder.buildPullRequestPrompt(
			branchCommits,
			branchDiff,
			currentBranch,
			defaultBranch
		);

		if (promptResult.isTruncated) {
			this.logger?.warn(
				`Branch diff exceeded context limit (${promptResult.originalLength} chars). Truncated to ${promptResult.truncatedLength} chars.`
			);
		}

		const configuration = await this.settingsService.getConfigurationSnapshot();
		const provider = this.providerFactory.getProvider(configuration.provider);
		await provider.initialize(configuration);

		const maxAttempts = 2;

		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			try {
				this.logger?.info(`Calling AI provider to generate pull request (Attempt ${attempt}/${maxAttempts})...`);
				const response = await provider.generateCommitMessage({
					stagedDiff: branchDiff,
					prompt: promptResult.prompt,
					provider: configuration.provider,
					model: configuration.model,
					maxTokens: 2048
				});

				const rawMarkdown = response.message.subject;
				const prContent = this.parsePullRequest(rawMarkdown, currentBranch, defaultBranch);

				this.logger?.info('AI pull request generated and validated successfully.');
				return prContent;
			} catch (error: unknown) {
				const details = error instanceof Error ? error.message : String(error);
				this.logger?.warn(`PR generation attempt ${attempt} failed validation: ${details}`);

				if (attempt < maxAttempts) {
					this.logger?.info('Retrying PR generation once...');
					continue;
				}
			}
		}

		throw new Error('AI generated an incomplete Pull Request. Please try again.');
	}

	/** Extracts the PR title and description from the raw AI-generated Markdown after validating completeness. */
	public parsePullRequest(rawMarkdown: string, currentBranch: string, defaultBranch: string): PullRequestContent {
		const fullMarkdown = this.validatePullRequest(rawMarkdown);

		// Extract title from "## Title" section or fallback
		const titleMatch = fullMarkdown.match(/##\s*Title\s*\n+([^\n]+)/i);
		let title = titleMatch ? titleMatch[1].trim() : this.extractFallbackTitle(fullMarkdown);

		// Ensure title uses a conventional commit prefix
		title = this.formatConventionalTitle(title);

		// Description is everything after "## Summary" heading
		const summaryIndex = fullMarkdown.search(/##\s*Summary/i);
		const description = summaryIndex >= 0
			? fullMarkdown.slice(summaryIndex).trim()
			: fullMarkdown;

		return {
			title,
			description,
			fullMarkdown,
			currentBranch,
			defaultBranch
		};
	}

	/**
	 * Validates and sanitizes the raw AI output into clean Markdown.
	 * Verifies section completeness and checks for mid-sentence truncations.
	 */
	public validatePullRequest(rawMarkdown: string): string {
		let cleaned = rawMarkdown.trim();

		// Remove wrapping code fences if the AI enclosed the entire response in ```markdown
		cleaned = cleaned.replace(/^```(?:markdown|md)?\s*\n?/i, '');
		cleaned = cleaned.replace(/\n?```\s*$/i, '');
		cleaned = cleaned.trim();

		if (!cleaned) {
			throw new Error('AI returned an empty pull request response.');
		}

		// Required headings or sections
		const requiredHeadings = [/##\s*Title/i, /##\s*Summary/i, /##\s*(Detailed Description|Changes)/i, /##\s*Testing/i, /##\s*Checklist/i];

		for (const regex of requiredHeadings) {
			if (!regex.test(cleaned)) {
				throw new Error(`Missing required heading in PR markdown: ${regex.source}`);
			}
		}

		// Check for dangling mid-sentence truncation at the end of the document
		const danglingWordsRegex = /\b(the|a|an|and|to|in|with|for|is|are|of|or|if|on|by|this|that)$/i;
		const lastLine = cleaned.split('\n').pop()?.trim() || '';

		if (danglingWordsRegex.test(lastLine)) {
			throw new Error(`PR markdown ends with an incomplete word fragment: "${lastLine}"`);
		}

		// Minimum character threshold for a complete PR (~150 chars)
		if (cleaned.length < 150) {
			throw new Error('PR markdown content is too short to be complete.');
		}

		return cleaned;
	}

	/** Ensures the PR title begins with a valid Conventional Commit prefix. */
	private formatConventionalTitle(rawTitle: string): string {
		let cleanTitle = rawTitle.replace(/^#+\s*/, '').trim();

		const hasValidPrefix = CONVENTIONAL_COMMIT_TYPES.some((type) =>
			new RegExp(`^${type}(\\(.+\\))?!?:`, 'i').test(cleanTitle)
		);

		if (hasValidPrefix) {
			return cleanTitle;
		}

		// Auto-prefix with feat if missing
		return `feat: ${cleanTitle}`;
	}

	/** Extracts a fallback title from the first heading or first meaningful line. */
	private extractFallbackTitle(markdown: string): string {
		const headingMatch = markdown.match(/^#+\s+(.+)$/m);
		if (headingMatch) {
			return headingMatch[1].trim();
		}

		const firstLine = markdown.split('\n').find((line) => line.trim().length > 0);
		return firstLine?.trim().slice(0, 72) || 'feat: update implementation';
	}
}
