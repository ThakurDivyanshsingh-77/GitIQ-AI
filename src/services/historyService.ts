import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { promisify } from 'node:util';
import type {
	CommitStatistics,
	ContributorStat,
	DailyActivityStat,
	SearchResultCommit
} from '../models/historyModels';
import { GitCommitError, NotGitRepositoryError } from '../utils/errors';
import type { GitService } from './gitService';
import type { LoggerService } from './loggerService';

const execFileAsync = promisify(execFile);

/**
 * Service encapsulating offline Git CLI analytics, search, statistics, and history report generation.
 */
export class HistoryService {
	public constructor(
		private readonly gitService: GitService,
		private readonly logger?: LoggerService
	) {}

	/**
	 * Searches all branch commit messages and author metadata using `git log --all --grep`.
	 *
	 * @param workspacePath Absolute path to the Git workspace directory.
	 * @param keyword Keyword string to search for across commits.
	 * @returns List of matching commits formatted as SearchResultCommit models.
	 */
	public async searchCommitHistory(
		workspacePath: string,
		keyword: string
	): Promise<SearchResultCommit[]> {
		const trimmedKeyword = keyword.trim();
		if (!trimmedKeyword) {
			return [];
		}

		this.logger?.info(`Searching commit history for keyword: "${trimmedKeyword}"`);
		if (!(await this.gitService.isGitRepository(workspacePath))) {
			throw new NotGitRepositoryError('This workspace is not a Git repository.');
		}

		try {
			const { stdout } = await execFileAsync(
				'git',
				[
					'log',
					'--all',
					`--grep=${trimmedKeyword}`,
					'-i',
					'--pretty=format:%H|%h|%an|%ad|%s',
					'--date=short'
				],
				{
					cwd: workspacePath,
					windowsHide: true,
					maxBuffer: 10 * 1024 * 1024
				}
			);

			const rawLines = stdout.toString().split(/\r?\n/).filter((line) => line.trim().length > 0);
			const results: SearchResultCommit[] = [];

			for (const line of rawLines) {
				const parts = line.split('|');
				if (parts.length >= 5) {
					results.push({
						hash: parts[0] || '',
						shortHash: parts[1] || '',
						author: parts[2] || 'Unknown Author',
						date: parts[3] || 'Unknown Date',
						subject: parts.slice(4).join('|') || 'No subject'
					});
				}
			}

			this.logger?.info(`Search returned ${results.length} matching commits.`);
			return results;
		} catch (error: unknown) {
			const details = error instanceof Error ? error.message : String(error);
			this.logger?.warn(`Commit search completed with zero results or non-critical error: ${details}`);
			return [];
		}
	}

	/**
	 * Collects comprehensive commit metrics, activity counters, and age statistics using local Git CLI commands.
	 *
	 * @param workspacePath Absolute path to the Git workspace directory.
	 * @returns Aggregated CommitStatistics metric model.
	 */
	public async getCommitStatistics(workspacePath: string): Promise<CommitStatistics> {
		this.logger?.info('Collecting commit statistics via Git CLI...');
		if (!(await this.gitService.isGitRepository(workspacePath))) {
			throw new NotGitRepositoryError('This workspace is not a Git repository.');
		}

		const branchName = await this.gitService.getCurrentBranch(workspacePath);

		// Total commit count
		let totalCommits = 0;
		try {
			const { stdout } = await execFileAsync('git', ['rev-list', '--count', 'HEAD'], {
				cwd: workspacePath,
				windowsHide: true
			});
			totalCommits = parseInt(stdout.trim(), 10) || 0;
		} catch {
			totalCommits = 0;
		}

		if (totalCommits === 0) {
			return {
				totalCommits: 0,
				commitsToday: 0,
				commitsLast7Days: 0,
				commitsLast30Days: 0,
				averageCommitsPerDay: 0,
				firstCommit: 'None',
				latestCommit: 'None',
				branchName,
				repositoryAgeDays: 0,
				contributors: []
			};
		}

		// Commits today
		let commitsToday = 0;
		try {
			const { stdout } = await execFileAsync('git', ['rev-list', '--count', '--since=00:00:00', 'HEAD'], {
				cwd: workspacePath,
				windowsHide: true
			});
			commitsToday = parseInt(stdout.trim(), 10) || 0;
		} catch {
			commitsToday = 0;
		}

		// Commits last 7 days
		let commitsLast7Days = 0;
		try {
			const { stdout } = await execFileAsync('git', ['rev-list', '--count', '--since=7 days ago', 'HEAD'], {
				cwd: workspacePath,
				windowsHide: true
			});
			commitsLast7Days = parseInt(stdout.trim(), 10) || 0;
		} catch {
			commitsLast7Days = 0;
		}

		// Commits last 30 days
		let commitsLast30Days = 0;
		try {
			const { stdout } = await execFileAsync('git', ['rev-list', '--count', '--since=30 days ago', 'HEAD'], {
				cwd: workspacePath,
				windowsHide: true
			});
			commitsLast30Days = parseInt(stdout.trim(), 10) || 0;
		} catch {
			commitsLast30Days = 0;
		}

		// First and latest commits
		let firstCommit = 'Unknown';
		let firstDateObj = new Date();
		try {
			const { stdout } = await execFileAsync(
				'git',
				['log', '--reverse', '--format=%ad|%h|%s', '--date=short'],
				{ cwd: workspacePath, windowsHide: true }
			);
			const firstLine = stdout.toString().split(/\r?\n/).find((line) => line.trim().length > 0);
			if (firstLine) {
				const [date, hash, ...subjectParts] = firstLine.split('|');
				firstCommit = `${date} (${hash}) - ${subjectParts.join('|')}`;
				if (date) {
					firstDateObj = new Date(date);
				}
			}
		} catch {
			firstCommit = 'Unknown';
		}

		let latestCommit = 'Unknown';
		let latestDateObj = new Date();
		try {
			const { stdout } = await execFileAsync(
				'git',
				['log', '-1', '--format=%ad|%h|%s', '--date=short'],
				{ cwd: workspacePath, windowsHide: true }
			);
			const line = stdout.toString().trim();
			if (line) {
				const [date, hash, ...subjectParts] = line.split('|');
				latestCommit = `${date} (${hash}) - ${subjectParts.join('|')}`;
				if (date) {
					latestDateObj = new Date(date);
				}
			}
		} catch {
			latestCommit = 'Unknown';
		}

		// Calculate repository age in calendar days
		const diffMs = Math.abs(latestDateObj.getTime() - firstDateObj.getTime());
		const repositoryAgeDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
		const averageCommitsPerDay = parseFloat((totalCommits / repositoryAgeDays).toFixed(2));

		const contributors = await this.getTopContributors(workspacePath);

		return {
			totalCommits,
			commitsToday,
			commitsLast7Days,
			commitsLast30Days,
			averageCommitsPerDay,
			firstCommit,
			latestCommit,
			branchName,
			repositoryAgeDays,
			contributors
		};
	}

	/**
	 * Retrieves sorted author commit counts using `git shortlog -sn`.
	 *
	 * @param workspacePath Absolute path to the Git workspace directory.
	 * @returns Array of ContributorStat objects sorted descending by commit count.
	 */
	public async getTopContributors(workspacePath: string): Promise<ContributorStat[]> {
		this.logger?.info('Fetching top contributors via git shortlog...');
		if (!(await this.gitService.isGitRepository(workspacePath))) {
			throw new NotGitRepositoryError('This workspace is not a Git repository.');
		}

		try {
			const { stdout } = await execFileAsync('git', ['shortlog', '-sn', 'HEAD'], {
				cwd: workspacePath,
				windowsHide: true
			});

			const lines = stdout.toString().split(/\r?\n/).filter((l) => l.trim().length > 0);
			const list: ContributorStat[] = [];

			for (const line of lines) {
				const match = line.trim().match(/^(\d+)\s+(.+)$/);
				if (match) {
					list.push({
						commitCount: parseInt(match[1], 10),
						name: match[2].trim()
					});
				}
			}

			return list;
		} catch (error: unknown) {
			this.logger?.warn(`Failed to execute git shortlog: ${error instanceof Error ? error.message : String(error)}`);
			return [];
		}
	}

	/**
	 * Computes commit distribution grouped by calendar day over the last N days.
	 *
	 * @param workspacePath Absolute path to the Git workspace directory.
	 * @param days Number of days back from today to analyze (default 7).
	 * @returns Array of DailyActivityStat objects for each day.
	 */
	public async getCommitActivity(
		workspacePath: string,
		days: number = 7
	): Promise<DailyActivityStat[]> {
		this.logger?.info(`Calculating commit activity for last ${days} days...`);
		if (!(await this.gitService.isGitRepository(workspacePath))) {
			throw new NotGitRepositoryError('This workspace is not a Git repository.');
		}

		const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

		// Get dates in last N days
		let rawLogDates: string[] = [];
		try {
			const { stdout } = await execFileAsync(
				'git',
				['log', `--since=${days} days ago`, '--format=%ad', '--date=short'],
				{ cwd: workspacePath, windowsHide: true }
			);
			rawLogDates = stdout.toString().split(/\r?\n/).filter((d) => d.trim().length > 0);
		} catch {
			rawLogDates = [];
		}

		// Count frequency per date string (YYYY-MM-DD)
		const countsByDate = new Map<string, number>();
		for (const dateStr of rawLogDates) {
			const current = countsByDate.get(dateStr) || 0;
			countsByDate.set(dateStr, current + 1);
		}

		const activity: DailyActivityStat[] = [];
		const today = new Date();

		for (let i = days - 1; i >= 0; i--) {
			const targetDate = new Date(today);
			targetDate.setDate(today.getDate() - i);

			const isoDateStr = targetDate.toISOString().slice(0, 10);
			const dayName = dayNames[targetDate.getDay()] || 'Day';
			const count = countsByDate.get(isoDateStr) || 0;

			activity.push({
				dateStr: isoDateStr,
				dayName,
				count
			});
		}

		return activity;
	}

	/**
	 * Generates a comprehensive commit history Markdown report and exports it to `commit-history-report.md`.
	 *
	 * @param workspacePath Absolute path to the Git workspace directory.
	 * @returns Absolute filepath where the report was saved.
	 */
	public async exportHistoryReport(workspacePath: string): Promise<string> {
		this.logger?.info('Exporting history report to commit-history-report.md...');
		if (!(await this.gitService.isGitRepository(workspacePath))) {
			throw new NotGitRepositoryError('This workspace is not a Git repository.');
		}

		const stats = await this.getCommitStatistics(workspacePath);
		const activity = await this.getCommitActivity(workspacePath, 7);

		const activityTableLines = [
			'| Day | Date | Commits |',
			'| :--- | :--- | :--- |',
			...activity.map((item) => `| ${item.dayName} | ${item.dateStr} | ${item.count} |`)
		];

		const contributorLines = stats.contributors.length > 0
			? stats.contributors.map((c) => `- **${c.name}**: ${c.commitCount} commits`).join('\n')
			: '_No contributor data available_';

		const reportContent = [
			'# 📈 Commit History Analytics Report',
			`*Generated by CommitPilot AI on ${new Date().toLocaleString()}*`,
			'',
			'---',
			'',
			'## 📊 Repository Statistics',
			'',
			`- **Active Branch:** \`${stats.branchName}\``,
			`- **Total Commits:** ${stats.totalCommits}`,
			`- **Commits Today:** ${stats.commitsToday}`,
			`- **Last 7 Days:** ${stats.commitsLast7Days}`,
			`- **Last 30 Days:** ${stats.commitsLast30Days}`,
			`- **Average Commits/Day:** ${stats.averageCommitsPerDay}`,
			`- **Repository Age:** ${stats.repositoryAgeDays} days`,
			`- **First Commit:** ${stats.firstCommit}`,
			`- **Latest Commit:** ${stats.latestCommit}`,
			'',
			'---',
			'',
			'## 🏆 Top Contributors',
			'',
			contributorLines,
			'',
			'---',
			'',
			'## 📅 Commit Activity (Last 7 Days)',
			'',
			activityTableLines.join('\n'),
			''
		].join('\n');

		const targetPath = path.join(workspacePath, 'commit-history-report.md');
		try {
			await fs.writeFile(targetPath, reportContent, 'utf-8');
			this.logger?.info(`History report successfully written to ${targetPath}`);
			return targetPath;
		} catch (error: unknown) {
			const details = error instanceof Error ? error.message : String(error);
			this.logger?.error(`Failed to write commit-history-report.md: ${details}`, error);
			throw new GitCommitError(`Unable to save commit-history-report.md: ${details}`);
		}
	}
}
