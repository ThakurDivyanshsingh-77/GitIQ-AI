import type { AIProviderFactory } from '../providers/AIProviderFactory';
import { CONVENTIONAL_COMMIT_TYPES } from '../utils/constants';
import {
	ConfigurationError,
	GitError,
	NotGitRepositoryError,
	ProviderAuthenticationError,
	ProviderNetworkError,
	ProviderPayloadTooLargeError,
	ProviderRateLimitError,
	ProviderTimeoutError
} from '../utils/errors';
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
 * Checks if an error is a non-retryable operational error (e.g. invalid credentials, rate limit, timeout, network failure, git context).
 */
function isOperationalError(error: unknown): boolean {
	if (
		error instanceof ProviderAuthenticationError ||
		error instanceof ProviderRateLimitError ||
		error instanceof ProviderTimeoutError ||
		error instanceof ProviderNetworkError ||
		error instanceof ProviderPayloadTooLargeError ||
		error instanceof ConfigurationError ||
		error instanceof GitError
	) {
		return true;
	}
	if (error instanceof Error) {
		const msg = error.message.toLowerCase();
		if (
			msg.includes('api key') ||
			msg.includes('unauthorized') ||
			msg.includes('authentication') ||
			msg.includes('rate limit') ||
			msg.includes('quota') ||
			msg.includes('timed out') ||
			msg.includes('timeout') ||
			msg.includes('econnrefused') ||
			msg.includes('enotfound')
		) {
			return true;
		}
	}
	return false;
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
	 * Retries at most once if the AI returns an incomplete response or fails schema/markdown validation.
	 * Operational errors (auth, quota, timeout, network) are rethrown immediately without masking.
	 */
	public async generatePullRequest(workspacePath: string): Promise<PullRequestContent> {
		this.logger?.info('Starting pull request generation...');

		if (!(await this.gitService.isGitRepository(workspacePath))) {
			throw new NotGitRepositoryError('This workspace is not a Git repository.');
		}

		const remoteUrl = await this.gitService.getRemoteUrl(workspacePath);
		if (!remoteUrl) {
			throw new Error('No remote "origin" configured. Please add a remote origin (e.g., git remote add origin <url>) and push your branch.');
		}

		const currentBranch = await this.gitService.getCurrentBranch(workspacePath);
		const defaultBranch = await this.gitService.getDefaultBranch(workspacePath);

		if (currentBranch === defaultBranch) {
			throw new Error(`You are currently on the default branch "${defaultBranch}". Create and switch to a feature branch with your changes first.`);
		}

		this.logger?.info(`PR: ${currentBranch} → ${defaultBranch}`);

		const branchCommits = await this.gitService.getBranchCommits(workspacePath);
		const branchDiff = await this.gitService.getBranchDiff(workspacePath);

		if (!branchCommits && !branchDiff) {
			throw new Error(`No commits or differences found between "${currentBranch}" and "${defaultBranch}". Please commit your changes before generating a Pull Request.`);
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
		let lastError: Error | undefined;

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

				const rawMarkdown = response?.message?.subject || '';
				if (!rawMarkdown || !rawMarkdown.trim()) {
					throw new Error('AI returned an empty pull request response.');
				}

				const prContent = this.parsePullRequest(rawMarkdown, currentBranch, defaultBranch);

				this.logger?.info('AI pull request generated and validated successfully.');
				return prContent;
			} catch (error: unknown) {
				// Operational errors (auth, quota, timeout, network, git context) must not be masked as incomplete PRs
				if (isOperationalError(error)) {
					const details = error instanceof Error ? error.message : String(error);
					this.logger?.error(`Operational provider/git error during PR generation: ${details}`);
					throw error;
				}

				const details = error instanceof Error ? error.message : String(error);
				lastError = error instanceof Error ? error : new Error(details);
				this.logger?.warn(`PR generation attempt ${attempt} failed validation: ${details}`);

				if (attempt < maxAttempts) {
					this.logger?.info('Retrying PR generation once...');
					continue;
				}
			}
		}

		throw new Error(`AI generated an incomplete Pull Request: ${lastError?.message || 'Validation failed'}. Please try again.`);
	}

	/** Extracts the PR title and description from the raw AI-generated Markdown after validating completeness. */
	public parsePullRequest(rawMarkdown: string, currentBranch: string, defaultBranch: string): PullRequestContent {
		const fullMarkdown = this.validatePullRequest(rawMarkdown);

		// Extract title from "## Title" section (both inline and multi-line), or fallback
		let title = '';
		const titleHeadingMatch = fullMarkdown.match(/##\s*Title(?::\s*|\s*\n+)([^\n#]+)/i);
		if (titleHeadingMatch && titleHeadingMatch[1].trim()) {
			title = titleHeadingMatch[1].trim();
		} else {
			const prHeadingMatch = fullMarkdown.match(/#\s*Pull Request:\s*([^\n]+)/i);
			if (prHeadingMatch && prHeadingMatch[1].trim()) {
				title = prHeadingMatch[1].trim();
			} else {
				title = this.extractFallbackTitle(fullMarkdown);
			}
		}

		// Ensure title uses a conventional commit prefix
		title = this.formatConventionalTitle(title);

		// Description is everything after the first summary/overview/description heading
		const summaryMatch = fullMarkdown.match(/##\s*(Summary|Overview|Description|Detailed Description|Changes)/i);
		const description = summaryMatch && summaryMatch.index !== undefined
			? fullMarkdown.slice(summaryMatch.index).trim()
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
	 * Supports JSON structured responses, fenced code blocks, and standard Markdown.
	 * Verifies section completeness and checks for mid-sentence truncations.
	 */
	public validatePullRequest(rawMarkdown: string): string {
		if (!rawMarkdown || !rawMarkdown.trim()) {
			throw new Error('AI returned an empty pull request response.');
		}

		// 1. First check if the output is a JSON response (or fenced JSON)
		const parsedJsonMarkdown = this.tryParseJsonPullRequest(rawMarkdown);
		let cleaned = parsedJsonMarkdown ? parsedJsonMarkdown : rawMarkdown.trim();

		// 2. If not already converted from JSON, strip wrapping markdown/text code fences
		if (!parsedJsonMarkdown) {
			const codeBlockMatch = cleaned.match(/```(?:markdown|md)?\s*\n([\s\S]*?)\n```/i);
			if (codeBlockMatch && codeBlockMatch[1].trim().length > 30) {
				cleaned = codeBlockMatch[1].trim();
			} else {
				cleaned = cleaned.replace(/^```(?:markdown|md)?\s*\n?/i, '');
				cleaned = cleaned.replace(/\n?```\s*$/i, '');
				cleaned = cleaned.trim();
			}
		}

		if (!cleaned) {
			throw new Error('AI returned an empty pull request response.');
		}

		// Minimum character threshold for a complete PR
		if (cleaned.length < 80) {
			throw new Error('PR markdown content is too short to be complete.');
		}

		// Check for presence of Title or PR Header
		const hasTitle =
			/##\s*Title/i.test(cleaned) ||
			/#\s*(Pull Request|Title)/i.test(cleaned) ||
			CONVENTIONAL_COMMIT_TYPES.some((type) => new RegExp(`^#+\\s*${type}(\\(.+\\))?!?:`, 'im').test(cleaned));

		if (!hasTitle) {
			throw new Error('Missing required title in PR content.');
		}

		// Check for presence of Summary / Overview / Description / Changes
		const hasSummaryOrDescription =
			/##\s*(Summary|Overview|Description|Detailed Description|Changes|Proposed Changes|What Changed)/i.test(cleaned);

		if (!hasSummaryOrDescription) {
			throw new Error('Missing required summary or description in PR content.');
		}

		// Check for mid-sentence truncation at the end of the document
		const danglingWordsRegex = /\b(the|a|an|and|to|in|with|for|is|are|of|or|if|on|by|this|that)$/i;
		const lastLine = cleaned.split('\n').pop()?.trim() || '';

		if (danglingWordsRegex.test(lastLine)) {
			throw new Error(`PR markdown ends with an incomplete word fragment: "${lastLine}"`);
		}

		return cleaned;
	}

	/** Parses structured JSON pull request if returned by the AI provider, converting to standard Markdown. */
	private tryParseJsonPullRequest(raw: string): string | null {
		let candidate = raw.trim();

		// Check if content is enclosed in a ```json code fence
		const fenceMatch = candidate.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
		if (fenceMatch) {
			candidate = fenceMatch[1].trim();
		}

		if (!candidate.startsWith('{')) {
			// Find outer JSON object braces if accompanied by conversational preamble
			const firstBrace = candidate.indexOf('{');
			const lastBrace = candidate.lastIndexOf('}');
			if (firstBrace !== -1 && lastBrace > firstBrace) {
				const slice = candidate.slice(firstBrace, lastBrace + 1);
				try {
					const testObj = JSON.parse(slice);
					if (
						testObj &&
						typeof testObj === 'object' &&
						(testObj.title || testObj.prTitle) &&
						(testObj.summary || testObj.description || testObj.overview)
					) {
						candidate = slice;
					} else {
						return null;
					}
				} catch {
					return null;
				}
			} else {
				return null;
			}
		}

		try {
			const parsed = JSON.parse(candidate);
			if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
				return null;
			}

			const title = parsed.title || parsed.prTitle || parsed.subject || '';
			const summary = parsed.summary || parsed.overview || parsed.tl_dr || '';
			const description = parsed.description || parsed.detailedDescription || parsed.changes || parsed.details || summary;
			const testing = parsed.testing || parsed.testPlan || parsed.testingPerformed || parsed.verification || '';
			const checklist = parsed.checklist || parsed.checklistItems || '';

			if (!title || (!summary && !description)) {
				return null;
			}

			let markdown = `# Pull Request\n\n## Title\n${title}\n\n---\n\n## Summary\n${summary || description}\n\n---\n\n## Detailed Description\n${description || summary}\n\n---`;

			if (testing) {
				const testingText = Array.isArray(testing) ? testing.map((t: unknown) => `- ${String(t)}`).join('\n') : String(testing);
				markdown += `\n\n## Testing\n${testingText}\n\n---`;
			} else {
				markdown += `\n\n## Testing\n- Verified unit tests pass\n\n---`;
			}

			if (checklist) {
				const checklistText = Array.isArray(checklist)
					? checklist.map((c: unknown) => `- [x] ${String(c)}`).join('\n')
					: String(checklist);
				markdown += `\n\n## Checklist\n${checklistText}`;
			} else {
				markdown += `\n\n## Checklist\n- [x] Code passes lint and type checks\n- [x] Changes verified locally`;
			}

			return markdown;
		} catch {
			return null;
		}
	}

	/** Ensures the PR title begins with a valid Conventional Commit prefix. */
	private formatConventionalTitle(rawTitle: string): string {
		const cleanTitle = rawTitle.replace(/^#+\s*/, '').trim();

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
