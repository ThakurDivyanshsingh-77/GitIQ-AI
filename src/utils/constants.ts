import { Provider } from '../types/provider';

/** Stable identity used when accessing the extension's VS Code configuration. */
export const EXTENSION_ID = 'commitpilot-ai';

/** Configuration section that settings are read from. */
export const CONFIGURATION_SECTION = 'commitPilotAI';

/** Keys reserved for provider configuration. */
export const CONFIGURATION_KEYS = {
	apiKey: 'apiKey',
	provider: 'provider',
	model: 'model',
	temperature: 'temperature',
	timeout: 'timeout'
} as const;

/** Default model and endpoint used by the Groq Chat Completions integration. */
export const GROQ_DEFAULT_MODEL = 'llama-3.3-70b-versatile';
export const GROQ_CHAT_COMPLETIONS_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

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
	openBranch: 'commitPilotAI.openBranch'
} as const;

/** Human-readable names used when presenting provider choices in UI. */
export const PROVIDER_NAMES: Readonly<Record<Provider, string>> = {
	[Provider.Groq]: 'Groq',
	[Provider.OpenAI]: 'OpenAI',
	[Provider.Gemini]: 'Gemini',
	[Provider.Ollama]: 'Ollama'
};
