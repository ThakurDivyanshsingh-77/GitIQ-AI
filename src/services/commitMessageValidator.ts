import { MAX_COMMIT_MESSAGE_LENGTH } from '../utils/constants';

/** The outcome of validating a model-provided commit-message suggestion. */
export interface CommitMessageValidationResult {
	readonly isValid: boolean;
	readonly sanitized: string;
	readonly reason?: string;
}

/**
 * Sanitizes and validates model-provided commit message suggestions.
 * Strips code fences, markdown tags, quotes, explanations, and line breaks,
 * enforcing a clean, non-empty, single-line commit message up to 72 characters.
 */
export class CommitMessageValidator {
	/**
	 * Sanitizes raw LLM response text into a clean single-line commit message subject.
	 */
	public sanitize(rawMessage: string): string {
		if (!rawMessage || typeof rawMessage !== 'string') {
			return '';
		}

		let text = rawMessage.trim();

		// 1. Remove code fences (e.g. ``` ... ``` or ```)
		text = text.replace(/```[\s\S]*?```/g, (match) => {
			return match.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '');
		});
		text = text.replace(/```/g, '');

		// 2. Split lines and extract the first non-empty meaningful line
		const lines = text
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter((line) => line.length > 0);

		text = lines[0] || '';

		// 3. Remove common introductory labels/prefixes (e.g., "Commit message:", "Subject:", "- ")
		text = text.replace(/^(?:here is the |suggested |commit message|subject|commit|message):\s*/i, '');
		text = text.replace(/^(?:[-*+>]|\d+\.)\s*/, '');

		// 4. Remove surrounding quotes ("...", '...', `...`)
		text = text.replace(/^["'`]|["'`]$/g, '').trim();

		// 5. Remove internal markdown formatting (*, _, `, ~)
		text = text.replace(/[`*_~]/g, '');

		// 6. Remove trailing period
		text = text.replace(/\.$/, '');

		// 7. Remove non-printable control characters
		// eslint-disable-next-line no-control-regex
		text = text.replace(/[\x00-\x1F\x7F]/g, '');

		text = text.trim();

		// 8. Truncate at maximum allowed subject line length if necessary
		if (text.length > MAX_COMMIT_MESSAGE_LENGTH) {
			text = text.slice(0, MAX_COMMIT_MESSAGE_LENGTH).trim();
		}

		return text;
	}

	/**
	 * Validates a raw response after sanitization according to basic subject-line rules:
	 * 1. Non-empty string
	 * 2. Maximum 72 characters
	 * 3. No line breaks or control characters
	 */
	public validate(rawMessage: string): CommitMessageValidationResult {
		const sanitized = this.sanitize(rawMessage);

		if (!sanitized || sanitized.length === 0) {
			return {
				isValid: false,
				sanitized: '',
				reason: 'The extracted commit message is empty.'
			};
		}

		if (sanitized.length > MAX_COMMIT_MESSAGE_LENGTH) {
			return {
				isValid: false,
				sanitized,
				reason: `The commit message subject exceeds maximum allowed length of ${MAX_COMMIT_MESSAGE_LENGTH} characters.`
			};
		}

		if (/[\r\n]/.test(sanitized)) {
			return {
				isValid: false,
				sanitized,
				reason: 'The commit message contains invalid line breaks.'
			};
		}

		return {
			isValid: true,
			sanitized
		};
	}
}
