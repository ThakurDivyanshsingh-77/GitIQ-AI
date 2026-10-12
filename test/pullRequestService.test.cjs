require('./mockVscode.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { PullRequestService } = require('../out/services/pullRequestService');
const {
	ConfigurationError,
	GitCommitError,
	NotGitRepositoryError,
	ProviderAuthenticationError,
	ProviderNetworkError,
	ProviderRateLimitError,
	ProviderTimeoutError
} = require('../out/utils/errors');
const { Provider } = require('../out/types/provider');

function createMockGitService(overrides = {}) {
	return {
		isGitRepository: async () => true,
		getRemoteUrl: async () => 'https://github.com/example/repo.git',
		getCurrentBranch: async () => 'feature/new-login',
		getDefaultBranch: async () => 'main',
		getBranchCommits: async () => 'abc1234 feat: implement oauth authentication',
		getBranchDiff: async () => 'diff --git a/auth.ts b/auth.ts\n+export function login() {}',
		...overrides
	};
}

function createMockSettingsService(overrides = {}) {
	return {
		getConfigurationSnapshot: async () => ({
			provider: Provider.Groq,
			model: 'llama-3.3-70b-versatile',
			apiKey: 'gsk-valid-key',
			temperature: 0.2,
			timeout: 30000,
			...overrides
		})
	};
}

function createMockPromptBuilder() {
	return {
		buildPullRequestPrompt: () => ({
			prompt: 'Generate PR prompt',
			isTruncated: false,
			originalLength: 100,
			truncatedLength: 100
		})
	};
}

function createMockProviderFactory(providerInstance) {
	return {
		getProvider: () => providerInstance
	};
}

test('PullRequestService - 1. Valid AI response (Markdown format)', async () => {
	const validMarkdown = [
		'# Pull Request',
		'',
		'## Title',
		'feat(auth): implement user authentication flow',
		'',
		'---',
		'',
		'## Summary',
		'This pull request introduces OAuth authentication with secure session handling.',
		'',
		'---',
		'',
		'## Detailed Description',
		'Added auth controller, middleware, and database token models to protect private endpoints.',
		'',
		'---',
		'',
		'## Testing',
		'- Verified login redirect with mock OAuth provider',
		'- Added unit tests for token validation',
		'',
		'---',
		'',
		'## Checklist',
		'- [x] Lint passes cleanly',
		'- [x] All tests passing'
	].join('\n');

	const mockProvider = {
		initialize: async () => {},
		generateCommitMessage: async () => ({
			message: { subject: validMarkdown }
		})
	};

	const service = new PullRequestService(
		createMockGitService(),
		createMockSettingsService(),
		createMockPromptBuilder(),
		createMockProviderFactory(mockProvider)
	);

	const pr = await service.generatePullRequest('/fake/workspace');
	assert.equal(pr.title, 'feat(auth): implement user authentication flow');
	assert.ok(pr.description.includes('## Summary'));
	assert.ok(pr.fullMarkdown.includes('## Testing'));
	assert.equal(pr.currentBranch, 'feature/new-login');
	assert.equal(pr.defaultBranch, 'main');
});

test('PullRequestService - 2. JSON wrapped in Markdown fences', async () => {
	const jsonInFences = [
		'```json',
		JSON.stringify(
			{
				title: 'fix(core): resolve null pointer exception in parser',
				summary: 'Fixes an unhandled null check during AST traversal when nodes have no children.',
				description: 'Added defensive verification before accessing node properties in tokenizer.',
				testing: ['Unit tests added in parser.test.ts', 'Manual run against sample schema'],
				checklist: ['Clean lint', 'Unit tests green']
			},
			null,
			2
		),
		'```'
	].join('\n');

	const mockProvider = {
		initialize: async () => {},
		generateCommitMessage: async () => ({
			message: { subject: jsonInFences }
		})
	};

	const service = new PullRequestService(
		createMockGitService(),
		createMockSettingsService(),
		createMockPromptBuilder(),
		createMockProviderFactory(mockProvider)
	);

	const pr = await service.generatePullRequest('/fake/workspace');
	assert.equal(pr.title, 'fix(core): resolve null pointer exception in parser');
	assert.ok(pr.description.includes('Fixes an unhandled null check'));
	assert.ok(pr.fullMarkdown.includes('## Checklist'));
	assert.ok(pr.fullMarkdown.includes('[x] Clean lint'));
});

test('PullRequestService - 3. Missing title or description fails validation with clear message', () => {
	const service = new PullRequestService(
		createMockGitService(),
		createMockSettingsService(),
		createMockPromptBuilder(),
		createMockProviderFactory({})
	);

	// Missing summary/description
	const missingSummary = [
		'## Title',
		'feat: only title provided here without any description or summary sections.',
		'This text has enough length to avoid length checks, but lacks required headings.'
	].join('\n');

	assert.throws(
		() => service.validatePullRequest(missingSummary),
		(err) => {
			assert.ok(err instanceof Error);
			assert.match(err.message, /Missing required summary or description/i);
			return true;
		}
	);

	// Missing title
	const missingTitle = [
		'## Summary',
		'This PR updates documentation and guides for developers on onboarding.',
		'## Detailed Description',
		'Added comprehensive markdown instructions and diagrams.'
	].join('\n');

	assert.throws(
		() => service.validatePullRequest(missingTitle),
		(err) => {
			assert.ok(err instanceof Error);
			assert.match(err.message, /Missing required title/i);
			return true;
		}
	);
});

test('PullRequestService - 4. Empty AI response rejected cleanly', () => {
	const service = new PullRequestService(
		createMockGitService(),
		createMockSettingsService(),
		createMockPromptBuilder(),
		createMockProviderFactory({})
	);

	assert.throws(
		() => service.validatePullRequest('   \n  '),
		(err) => {
			assert.ok(err instanceof Error);
			assert.match(err.message, /empty pull request response/i);
			return true;
		}
	);
});

test('PullRequestService - 5. Malformed JSON handled safely without crash', () => {
	const service = new PullRequestService(
		createMockGitService(),
		createMockSettingsService(),
		createMockPromptBuilder(),
		createMockProviderFactory({})
	);

	const malformedJson = '```json\n{ "title": "incomplete json without closing brace...\n```';

	// Safe handling: falls back to markdown validation, rejects incomplete format with descriptive error
	assert.throws(
		() => service.validatePullRequest(malformedJson),
		(err) => {
			assert.ok(err instanceof Error);
			assert.ok(err.message.length > 0);
			return true;
		}
	);
});

test('PullRequestService - 6. API rate limit, timeout, and auth errors propagate without masking', async () => {
	// Test 6a: ProviderRateLimitError rethrown directly
	const rateLimitProvider = {
		initialize: async () => {},
		generateCommitMessage: async () => {
			throw new ProviderRateLimitError('Groq rate limit reached. Please wait 60s.');
		}
	};

	const rateLimitService = new PullRequestService(
		createMockGitService(),
		createMockSettingsService(),
		createMockPromptBuilder(),
		createMockProviderFactory(rateLimitProvider)
	);

	await assert.rejects(
		() => rateLimitService.generatePullRequest('/fake/workspace'),
		(err) => {
			assert.ok(err instanceof ProviderRateLimitError);
			assert.match(err.message, /rate limit reached/i);
			return true;
		}
	);

	// Test 6b: ProviderTimeoutError rethrown directly
	const timeoutProvider = {
		initialize: async () => {},
		generateCommitMessage: async () => {
			throw new ProviderTimeoutError('Gemini API call timed out after 30000ms.');
		}
	};

	const timeoutService = new PullRequestService(
		createMockGitService(),
		createMockSettingsService(),
		createMockPromptBuilder(),
		createMockProviderFactory(timeoutProvider)
	);

	await assert.rejects(
		() => timeoutService.generatePullRequest('/fake/workspace'),
		(err) => {
			assert.ok(err instanceof ProviderTimeoutError);
			assert.match(err.message, /timed out/i);
			return true;
		}
	);

	// Test 6c: ProviderAuthenticationError rethrown directly
	const authProvider = {
		initialize: async () => {},
		generateCommitMessage: async () => {
			throw new ProviderAuthenticationError('API key missing or invalid. Please configure your Gemini API key in VS Code Settings.');
		}
	};

	const authService = new PullRequestService(
		createMockGitService(),
		createMockSettingsService(),
		createMockPromptBuilder(),
		createMockProviderFactory(authProvider)
	);

	await assert.rejects(
		() => authService.generatePullRequest('/fake/workspace'),
		(err) => {
			assert.ok(err instanceof ProviderAuthenticationError);
			assert.match(err.message, /API key missing or invalid/i);
			return true;
		}
	);
});

test('PullRequestService - 7. Empty Git diff or unavailable repository context gives actionable errors', async () => {
	// 7a: Not a git repository
	const notRepoService = new PullRequestService(
		createMockGitService({ isGitRepository: async () => false }),
		createMockSettingsService(),
		createMockPromptBuilder(),
		createMockProviderFactory({})
	);

	await assert.rejects(
		() => notRepoService.generatePullRequest('/not/a/repo'),
		(err) => {
			assert.ok(err instanceof NotGitRepositoryError);
			assert.match(err.message, /not a Git repository/i);
			return true;
		}
	);

	// 7b: Missing remote origin
	const noRemoteService = new PullRequestService(
		createMockGitService({ getRemoteUrl: async () => '' }),
		createMockSettingsService(),
		createMockPromptBuilder(),
		createMockProviderFactory({})
	);

	await assert.rejects(
		() => noRemoteService.generatePullRequest('/fake/workspace'),
		(err) => {
			assert.match(err.message, /No remote "origin" configured/i);
			return true;
		}
	);

	// 7c: User on default branch
	const defaultBranchService = new PullRequestService(
		createMockGitService({
			getCurrentBranch: async () => 'main',
			getDefaultBranch: async () => 'main'
		}),
		createMockSettingsService(),
		createMockPromptBuilder(),
		createMockProviderFactory({})
	);

	await assert.rejects(
		() => defaultBranchService.generatePullRequest('/fake/workspace'),
		(err) => {
			assert.match(err.message, /You are currently on the default branch/i);
			return true;
		}
	);

	// 7d: Empty diff and no commits
	const emptyDiffService = new PullRequestService(
		createMockGitService({
			getBranchCommits: async () => '',
			getBranchDiff: async () => ''
		}),
		createMockSettingsService(),
		createMockPromptBuilder(),
		createMockProviderFactory({})
	);

	await assert.rejects(
		() => emptyDiffService.generatePullRequest('/fake/workspace'),
		(err) => {
			assert.match(err.message, /No commits or differences found/i);
			return true;
		}
	);
});
