/**
 * Utility helpers for formatting modern, clean, and detailed GitHub-flavored Markdown reports.
 */

/**
 * Renders an ASCII/Unicode progress bar suitable for Markdown tables and cards.
 * Example: `████████░░░░`
 *
 * @param value Current numerical value
 * @param max Maximum potential value
 * @param length Total number of character blocks (default: 12)
 */
export function renderProgressBar(value: number, max: number, length = 12): string {
	if (max <= 0 || value <= 0) {
		return '░'.repeat(length);
	}

	const ratio = Math.min(1, Math.max(0, value / max));
	const filled = Math.round(ratio * length);
	const empty = length - filled;

	return `${'█'.repeat(filled)}${'░'.repeat(empty)}`;
}

/**
 * Calculates and formats a percentage string.
 * Example: `42.5%`
 */
export function formatPercentage(value: number, total: number): string {
	if (total <= 0 || value <= 0) {
		return '0.0%';
	}
	const pct = (value / total) * 100;
	return `${pct.toFixed(1)}%`;
}

/**
 * Returns a rank badge or medal icon for leaderboard rankings.
 */
export function getRankBadge(rankIndex: number): string {
	switch (rankIndex) {
		case 0:
			return '🥇 1st';
		case 1:
			return '🥈 2nd';
		case 2:
			return '🥉 3rd';
		default:
			return `🎖️ ${rankIndex + 1}th`;
	}
}

/**
 * Formats a GitHub-flavored Markdown Callout alert block.
 */
export function formatAlert(
	type: 'NOTE' | 'TIP' | 'IMPORTANT' | 'WARNING' | 'CAUTION',
	content: string
): string {
	const lines = content.trim().split('\n');
	return [`> [!${type}]`, ...lines.map((l) => `> ${l}`)].join('\n');
}
