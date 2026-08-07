/**
 * Domain model representing a single commit item in history search results.
 */
export interface SearchResultCommit {
	/** Full 40-character SHA hash of the commit. */
	readonly hash: string;
	/** Abbreviated SHA hash of the commit. */
	readonly shortHash: string;
	/** Author name who authored the commit. */
	readonly author: string;
	/** Formatted date string when the commit was authored. */
	readonly date: string;
	/** Commit subject message line. */
	readonly subject: string;
}

/**
 * Domain model representing a repository contributor's total commit count.
 */
export interface ContributorStat {
	/** Contributor author name. */
	readonly name: string;
	/** Total number of commits authored by this contributor. */
	readonly commitCount: number;
}

/**
 * Domain model representing commit count for a specific calendar day.
 */
export interface DailyActivityStat {
	/** ISO date string (YYYY-MM-DD). */
	readonly dateStr: string;
	/** Abbreviated day of week name (e.g. Mon, Tue). */
	readonly dayName: string;
	/** Total commits made on this day. */
	readonly count: number;
}

/**
 * Domain model representing aggregated repository commit statistics.
 */
export interface CommitStatistics {
	/** Total number of commits in the active branch history. */
	readonly totalCommits: number;
	/** Number of commits made today. */
	readonly commitsToday: number;
	/** Number of commits made in the last 7 days. */
	readonly commitsLast7Days: number;
	/** Number of commits made in the last 30 days. */
	readonly commitsLast30Days: number;
	/** Average number of commits per day over the repository lifetime. */
	readonly averageCommitsPerDay: number;
	/** First commit info formatted string (date and short hash). */
	readonly firstCommit: string;
	/** Latest commit info formatted string (date and short hash). */
	readonly latestCommit: string;
	/** Currently checked out branch name. */
	readonly branchName: string;
	/** Age of the repository in calendar days. */
	readonly repositoryAgeDays: number;
	/** Top contributors list sorted descending. */
	readonly contributors: ContributorStat[];
}
