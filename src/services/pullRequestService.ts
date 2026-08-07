import type { AIProviderFactory } from '../providers/AIProviderFactory';
import { NotGitRepositoryError } from '../utils/errors';
import type { ConfigService } from './configService';
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
 * Coordinates pull request generation: Git data collection → Prompt construction → AI generation → Parsing.
 */
export class PullRequestService {
	public constructor(
		private readonly gitService: GitService,
		private readonly configService: ConfigService,
		private readonly promptBuilder: PromptBuilder,
		private readonly providerFactory: AIProviderFactory,
		private readonly logger?: LoggerService
	) {}

	/** Generates a complete pull request document from branch diff and commit history. */
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

		const configuration = this.configService.getConfigurationSnapshot();
		const provider = this.providerFactory.getProvider(configuration.provider);
		await provider.initialize(configuration);

		this.logger?.info('Calling AI provider to generate pull request...');
		const response = await provider.generateCommitMessage({
			stagedDiff: branchDiff,
			prompt: promptResult.prompt,
			provider: configuration.provider,
			model: configuration.model
		});

		const rawMarkdown = response.message.subject;
		this.logger?.info('AI pull request response received successfully.');

		return this.parsePullRequest(rawMarkdown, currentBranch, defaultBranch);
	}

	/** Extracts the PR title and description from the raw AI-generated Markdown. */
	public parsePullRequest(rawMarkdown: string, currentBranch: string, defaultBranch: string): PullRequestContent {
		const fullMarkdown = this.validatePullRequest(rawMarkdown);

		// Extract title from "## Title" section
		const titleMatch = fullMarkdown.match(/##\s*Title\s*\n+(.+)/i);
		const title = titleMatch
			? titleMatch[1].trim()
			: this.extractFallbackTitle(fullMarkdown);

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

	/** Validates and sanitizes the raw AI output into clean Markdown. */
	public validatePullRequest(rawMarkdown: string): string {
		let cleaned = rawMarkdown.trim();

		// Remove wrapping code fences if the AI enclosed the entire response in ```markdown
		cleaned = cleaned.replace(/^```(?:markdown|md)?\s*\n?/i, '');
		cleaned = cleaned.replace(/\n?```\s*$/i, '');

		if (!cleaned) {
			throw new Error('AI returned an empty pull request response.');
		}

		return cleaned.trim();
	}

	/** Extracts a fallback title from the first heading or first meaningful line. */
	private extractFallbackTitle(markdown: string): string {
		const headingMatch = markdown.match(/^#+\s+(.+)$/m);
		if (headingMatch) {
			return headingMatch[1].trim();
		}

		const firstLine = markdown.split('\n').find((line) => line.trim().length > 0);
		return firstLine?.trim().slice(0, 72) || 'Pull Request';
	}
}
