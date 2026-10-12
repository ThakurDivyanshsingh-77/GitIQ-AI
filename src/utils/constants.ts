import { Provider } from '../types/provider';

/** Stable identity used when accessing the extension's VS Code configuration. */
export const EXTENSION_ID = 'gitiq';

/** Configuration section that settings are read from. */
export const CONFIGURATION_SECTION = 'gitIQ';

/** Legacy configuration section for backward compatibility. */
export const LEGACY_CONFIGURATION_SECTION = 'commitPilotAI';

/** Keys reserved for provider configuration. */
export const CONFIGURATION_KEYS = {
	apiKey: 'apiKey',
	provider: 'provider',
	model: 'model',
	geminiApiKey: 'geminiApiKey',
	geminiModel: 'geminiModel',
	ollamaModel: 'ollamaModel',
	copilotFamily: 'copilotFamily',
	endpoint: 'endpoint',
	temperature: 'temperature',
	timeout: 'timeout'
} as const;

/** Default model and endpoint used by the Groq Chat Completions integration. */
export const GROQ_DEFAULT_MODEL = 'llama-3.3-70b-versatile';
export const GROQ_CHAT_COMPLETIONS_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

/** Default model and endpoint used by Google Gemini integration. */
export const GEMINI_DEFAULT_MODEL = 'gemini-1.5-flash';
export const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Commit-message constraints shared by prompt construction and validation. */
export const MAX_COMMIT_MESSAGE_LENGTH = 72;

/** Safe maximum diff length limit (~70k characters) before automatic prompt truncation. */
export const MAX_DIFF_CHARACTERS = 70000;

/** Generated and lock files automatically excluded from AI diff analysis. */
export const IGNORED_PATH_PATTERNS = [
	'node_modules/',
	'.next/',
	'dist/',
	'build/',
	'coverage/',
	'*.map',
	'package-lock.json',
	'pnpm-lock.yaml',
	'yarn.lock'
] as const;

/** Supported Conventional Commit type prefixes. */
export const CONVENTIONAL_COMMIT_TYPES = [
	'feat',
	'fix',
	'docs',
	'style',
	'refactor',
	'perf',
	'test',
	'build',
	'ci',
	'chore',
	'revert'
] as const;

/** Central command identifiers shared by the extension manifest and commands. */
export const COMMAND_IDS = {
	hello: 'gitIQ.hello',
	checkGitRepository: 'gitIQ.checkGitRepository',
	previewGitDiff: 'gitIQ.previewGitDiff',
	generateCommitMessage: 'gitIQ.generateCommitMessage',
	viewCommitHistory: 'gitIQ.viewCommitHistory',
	explainCommit: 'gitIQ.explainCommit',
	copyCommitHash: 'gitIQ.copyCommitHash',
	push: 'gitIQ.push',
	pull: 'gitIQ.pull',
	fetch: 'gitIQ.fetch',
	repositoryInfo: 'gitIQ.repositoryInfo',
	currentBranch: 'gitIQ.currentBranch',
	openRepository: 'gitIQ.openRepository',
	openBranch: 'gitIQ.openBranch',
	generatePullRequest: 'gitIQ.generatePullRequest',
	copyPRTitle: 'gitIQ.copyPRTitle',
	copyPRDescription: 'gitIQ.copyPRDescription',
	copyEntirePR: 'gitIQ.copyEntirePR',
	copyEntirePullRequest: 'gitIQ.copyEntirePullRequest',
	savePullRequest: 'gitIQ.savePullRequest',
	openPullRequestPage: 'gitIQ.openPullRequestPage',
	searchCommitHistory: 'gitIQ.searchCommitHistory',
	commitStatistics: 'gitIQ.commitStatistics',
	topContributors: 'gitIQ.topContributors',
	commitActivity: 'gitIQ.commitActivity',
	exportHistoryReport: 'gitIQ.exportHistoryReport',
	setApiKey: 'gitIQ.setApiKey',
	updateApiKey: 'gitIQ.updateApiKey',
	removeApiKey: 'gitIQ.removeApiKey',
	selectModel: 'gitIQ.selectModel',
	refreshSidebar: 'gitIQ.refreshSidebar',
	aiCodeReview: 'gitIQ.aiCodeReview',
	selectProvider: 'gitIQ.selectProvider',
	setGeminiApiKey: 'gitIQ.setGeminiApiKey',
	selectRepository: 'gitIQ.selectRepository'
} as const;

/** Legacy command IDs for backwards compatibility. */
export const LEGACY_COMMAND_IDS: Record<keyof typeof COMMAND_IDS, string> = {
	hello: 'commitPilotAI.hello',
	checkGitRepository: 'commitPilotAI.checkGitRepository',
	previewGitDiff: 'commitPilotAI.previewGitDiff',
	generateCommitMessage: 'commitPilotAI.generateCommitMessage',
	viewCommitHistory: 'commitPilotAI.viewCommitHistory',
	explainCommit: 'commitPilotAI.explainCommit',
	copyCommitHash: 'commitPilotAI.copyCommitHash',
	push: 'commitPilotAI.push',
	pull: 'commitPilotAI.pull',
	fetch: 'commitPilotAI.fetch',
	repositoryInfo: 'commitPilotAI.repositoryInfo',
	currentBranch: 'commitPilotAI.currentBranch',
	openRepository: 'commitPilotAI.openRepository',
	openBranch: 'commitPilotAI.openBranch',
	generatePullRequest: 'commitPilotAI.generatePullRequest',
	copyPRTitle: 'commitPilotAI.copyPRTitle',
	copyPRDescription: 'commitPilotAI.copyPRDescription',
	copyEntirePR: 'commitPilotAI.copyEntirePR',
	copyEntirePullRequest: 'commitPilotAI.copyEntirePullRequest',
	savePullRequest: 'commitPilotAI.savePullRequest',
	openPullRequestPage: 'commitPilotAI.openPullRequestPage',
	searchCommitHistory: 'commitPilotAI.searchCommitHistory',
	commitStatistics: 'commitPilotAI.commitStatistics',
	topContributors: 'commitPilotAI.topContributors',
	commitActivity: 'commitPilotAI.commitActivity',
	exportHistoryReport: 'commitPilotAI.exportHistoryReport',
	setApiKey: 'commitPilotAI.setApiKey',
	updateApiKey: 'commitPilotAI.updateApiKey',
	removeApiKey: 'commitPilotAI.removeApiKey',
	selectModel: 'commitPilotAI.selectModel',
	refreshSidebar: 'commitPilotAI.refreshSidebar',
	aiCodeReview: 'commitPilotAI.aiCodeReview',
	selectProvider: 'commitPilotAI.selectProvider',
	setGeminiApiKey: 'commitPilotAI.setGeminiApiKey',
	selectRepository: 'commitPilotAI.selectRepository'
};

/** Human-readable names used when presenting provider choices in UI. */
export const PROVIDER_NAMES: Readonly<Record<Provider, string>> = {
	[Provider.Groq]: 'Groq',
	[Provider.Copilot]: 'GitHub Copilot',
	[Provider.OpenAI]: 'OpenAI',
	[Provider.Gemini]: 'Google Gemini',
	[Provider.Ollama]: 'Ollama (Local)',
	[Provider.MCP]: 'External Agent / MCP'
};
