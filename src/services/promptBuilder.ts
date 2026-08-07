import { CONVENTIONAL_COMMIT_TYPES, MAX_COMMIT_MESSAGE_LENGTH, MAX_DIFF_CHARACTERS } from '../utils/constants';

/** Result object returned by PromptBuilder containing the constructed prompt and truncation metadata. */
export interface PromptBuildResult {
	readonly prompt: string;
	readonly isTruncated: boolean;
	readonly originalLength: number;
	readonly truncatedLength: number;
}

/**
 * Builds deterministic prompt text from staged diffs and commit histories with context truncation protection.
 */
export class PromptBuilder {
	/** Formats a staged Git diff into a conventional commit-generation prompt payload. */
	public buildCommitMessagePrompt(stagedDiff: string): PromptBuildResult {
		const normalizedDiff = this.normalizeDiff(stagedDiff);
		const { truncatedContent, isTruncated } = this.truncateDiff(normalizedDiff);

		const prompt = [
			'You are an expert Git commit message generator.',
			'Generate exactly ONE Conventional Commit message based on the staged Git diff provided.',
			'',
			'CRITICAL RULES:',
			`1. Use one of these type prefixes only: ${CONVENTIONAL_COMMIT_TYPES.join(', ')}.`,
			`2. The commit message subject must be imperative and maximum ${MAX_COMMIT_MESSAGE_LENGTH} characters long.`,
			'3. Do NOT end the commit subject line with a period.',
			'4. Output ONLY the raw commit message subject string: no explanation, no markdown formatting, no code fences, and no quotes.',
			'',
			'--- STAGED GIT DIFF ---',
			truncatedContent,
			'--- END STAGED GIT DIFF ---'
		].join('\n');

		return {
			prompt,
			isTruncated,
			originalLength: normalizedDiff.length,
			truncatedLength: truncatedContent.length
		};
	}

	/** Formats a git show output into an AI prompt payload requesting a commit explanation. */
	public buildCommitExplainPrompt(commitOutput: string): PromptBuildResult {
		const normalizedDiff = this.normalizeDiff(commitOutput);
		const { truncatedContent, isTruncated } = this.truncateDiff(normalizedDiff);

		const prompt = [
			'Explain this Git commit in plain English.',
			'Describe:',
			'- purpose',
			'- affected files',
			'- major code changes',
			'- possible impact',
			'Return concise developer-friendly explanation.',
			'',
			'--- GIT COMMIT SHOW ---',
			truncatedContent,
			'--- END GIT COMMIT SHOW ---'
		].join('\n');

		return {
			prompt,
			isTruncated,
			originalLength: normalizedDiff.length,
			truncatedLength: truncatedContent.length
		};
	}

	/** Normalizes line endings while preserving semantic diff content. */
	private normalizeDiff(stagedDiff: string): string {
		return stagedDiff.replace(/\r\n/g, '\n').trim();
	}

	/** Safely truncates diff content if it exceeds the MAX_DIFF_CHARACTERS threshold (~70k chars). */
	private truncateDiff(diff: string): { truncatedContent: string; isTruncated: boolean } {
		if (diff.length <= MAX_DIFF_CHARACTERS) {
			return {
				truncatedContent: diff,
				isTruncated: false
			};
		}

		const sliced = diff.slice(0, MAX_DIFF_CHARACTERS);
		const lastNewline = sliced.lastIndexOf('\n');
		const cleanCut = lastNewline > 0 ? sliced.slice(0, lastNewline) : sliced;

		const truncatedContent = `${cleanCut}\n\n[... Remaining diff truncated to fit safe AI model context limits ...]`;

		return {
			truncatedContent,
			isTruncated: true
		};
	}
}
