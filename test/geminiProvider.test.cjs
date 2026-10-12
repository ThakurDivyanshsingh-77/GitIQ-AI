const test = require('node:test');
const assert = require('node:assert/strict');
const { GeminiProvider, GEMINI_DEFAULT_MODEL } = require('../out/providers/GeminiProvider');
const { Provider } = require('../out/types/provider');
const {
	ProviderAuthenticationError,
	ProviderError,
	ProviderRateLimitError
} = require('../out/utils/errors');

test('GeminiProvider - Identity and initialization', async () => {
	const provider = new GeminiProvider();
	assert.equal(provider.provider, Provider.Gemini);

	// Missing key rejects
	await assert.rejects(
		() => provider.initialize({ apiKey: '', provider: Provider.Gemini, model: 'gemini-1.5-flash' }),
		(err) => err instanceof ProviderAuthenticationError && /missing/i.test(err.message)
	);

	// Valid key succeeds
	await provider.initialize({ apiKey: 'AIzaSyValidTestKey', provider: Provider.Gemini, model: 'gemini-1.5-flash' });
	assert.ok(provider);
});

test('GeminiProvider - Cross-provider model fallback to gemini-1.5-flash', async () => {
	const provider = new GeminiProvider();
	// Initialize with a Groq model name that should fall back
	await provider.initialize({
		apiKey: 'AIzaSyValidTestKey',
		provider: Provider.Gemini,
		model: 'llama-3.3-70b-versatile'
	});
	// Model should safely resolve to GEMINI_DEFAULT_MODEL
	assert.equal(GEMINI_DEFAULT_MODEL, 'gemini-1.5-flash');
});

test('GeminiProvider - Generates commit message from mocked fetch response', async () => {
	const provider = new GeminiProvider();
	await provider.initialize({
		apiKey: 'AIzaSyFakeKey',
		provider: Provider.Gemini,
		model: 'gemini-1.5-flash'
	});

	const originalFetch = global.fetch;
	try {
		global.fetch = async () => ({
			ok: true,
			status: 200,
			json: async () => ({
				candidates: [
					{
						content: {
							parts: [{ text: 'feat(auth): add google gemini authentication' }]
						},
						finishReason: 'STOP'
					}
				]
			})
		});

		const res = await provider.generateCommitMessage({
			prompt: 'Generate commit message',
			stagedDiff: 'diff --git a/test b/test',
			provider: Provider.Gemini,
			model: 'gemini-1.5-flash'
		});

		assert.equal(res.provider, Provider.Gemini);
		assert.equal(res.message.subject, 'feat(auth): add google gemini authentication');
		assert.equal(res.model, 'gemini-1.5-flash');
	} finally {
		global.fetch = originalFetch;
	}
});

test('GeminiProvider - Maps Google 400 API_KEY_INVALID to ProviderAuthenticationError', async () => {
	const provider = new GeminiProvider();
	await provider.initialize({
		apiKey: 'invalid_key',
		provider: Provider.Gemini,
		model: 'gemini-1.5-flash'
	});

	const originalFetch = global.fetch;
	try {
		global.fetch = async () => ({
			ok: false,
			status: 400,
			statusText: 'Bad Request',
			json: async () => ({
				error: {
					code: 400,
					message: 'API key not valid. Please pass a valid API key.',
					status: 'INVALID_ARGUMENT',
					details: [{ reason: 'API_KEY_INVALID' }]
				}
			})
		});

		await assert.rejects(
			() =>
				provider.generateCommitMessage({
					prompt: 'test prompt',
					stagedDiff: 'diff',
					provider: Provider.Gemini
				}),
			(err) => err instanceof ProviderAuthenticationError && /API key not valid/i.test(err.message)
		);
	} finally {
		global.fetch = originalFetch;
	}
});

test('GeminiProvider - Maps 429 rate limit to ProviderRateLimitError', async () => {
	const provider = new GeminiProvider();
	await provider.initialize({
		apiKey: 'valid_key',
		provider: Provider.Gemini,
		model: 'gemini-1.5-flash'
	});

	const originalFetch = global.fetch;
	try {
		global.fetch = async () => ({
			ok: false,
			status: 429,
			statusText: 'Too Many Requests',
			json: async () => ({
				error: { code: 429, message: 'Resource has been exhausted (e.g. check quota).' }
			})
		});

		await assert.rejects(
			() =>
				provider.generateCommitMessage({
					prompt: 'test prompt',
					stagedDiff: 'diff',
					provider: Provider.Gemini
				}),
			(err) => err instanceof ProviderRateLimitError && /quota/i.test(err.message)
		);
	} finally {
		global.fetch = originalFetch;
	}
});

test('GeminiProvider - Rejects empty response from candidates', async () => {
	const provider = new GeminiProvider();
	await provider.initialize({
		apiKey: 'valid_key',
		provider: Provider.Gemini,
		model: 'gemini-1.5-flash'
	});

	const originalFetch = global.fetch;
	try {
		global.fetch = async () => ({
			ok: true,
			status: 200,
			json: async () => ({
				candidates: [
					{
						content: { parts: [{ text: '   ' }] },
						finishReason: 'SAFETY'
					}
				]
			})
		});

		await assert.rejects(
			() =>
				provider.generateCommitMessage({
					prompt: 'test prompt',
					stagedDiff: 'diff',
					provider: Provider.Gemini
				}),
			(err) => err instanceof ProviderError && /empty response/i.test(err.message)
		);
	} finally {
		global.fetch = originalFetch;
	}
});

test('GeminiProvider - Live Google endpoint rejection verification (real network HTTP call)', async () => {
	const provider = new GeminiProvider();
	await provider.initialize({
		apiKey: 'AIzaSyFakeTestKeyForLiveVerification_98765',
		provider: Provider.Gemini,
		model: 'gemini-1.5-flash'
	});

	// Uses real native fetch against live Google Gemini REST API
	await assert.rejects(
		() =>
			provider.generateCommitMessage({
				prompt: 'test prompt',
				stagedDiff: 'diff',
				provider: Provider.Gemini
			}),
		(err) => {
			assert.ok(err instanceof ProviderAuthenticationError);
			assert.match(err.message, /API key not valid|authentication failed/i);
			return true;
		}
	);
});
