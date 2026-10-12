/**
 * Type definitions and data models for AI Code Review findings and summaries.
 */

export type ReviewSeverity = 'Critical' | 'High' | 'Medium' | 'Low';
export type ReviewCategory = 'Bug' | 'Security' | 'Performance' | 'Logic' | 'Maintainability';
export type ReviewTargetType = 'working-tree' | 'staged' | 'branch';

/** A single specific finding identified during AI code review. */
export interface ReviewFinding {
	readonly id: string;
	readonly severity: ReviewSeverity;
	readonly category: ReviewCategory;
	readonly file: string;
	readonly line?: number;
	readonly endLine?: number;
	readonly title: string;
	readonly explanation: string;
	readonly impact: string; // "Why it matters"
	readonly recommendation: string; // "A practical recommended fix"
	readonly codeSuggestion?: string; // "A code suggestion only when the fix is sufficiently clear"
	readonly confidence?: 'Certain' | 'Uncertain';
}

/** Overall statistical summary of the review. */
export interface ReviewSummary {
	readonly totalFindings: number;
	readonly criticalCount: number;
	readonly highCount: number;
	readonly mediumCount: number;
	readonly lowCount: number;
	readonly overallSummary: string;
	readonly targetType: ReviewTargetType;
	readonly targetLabel: string;
	readonly filesAnalyzed: string[];
}

/** Complete result of an AI code review execution. */
export interface CodeReviewResult {
	readonly summary: ReviewSummary;
	readonly findings: readonly ReviewFinding[];
	readonly rawMarkdown?: string;
	readonly timestamp: number;
}

/** Target changes discovered in the repository for review. */
export interface ReviewableTarget {
	readonly type: ReviewTargetType | 'none';
	readonly diff: string;
	readonly files: string[];
	readonly targetLabel: string;
	readonly branchInfo?: {
		readonly current: string;
		readonly base: string;
	};
}
