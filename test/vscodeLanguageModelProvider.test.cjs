require('./mockVscode.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { VSCodeLanguageModelProvider } = require('../out/providers/VSCodeLanguageModelProvider');
const { Provider } = require('../out/types/provider');
const {
	ProviderAuthenticationError,
	ProviderError,
	ProviderRateLimitError,
	ProviderTimeoutError
} = require('../out/utils/errors');

test('VSCodeLanguageModelProvider - Identity and initialization', async () => {
	const provider = new VSCodeLanguageModelProvider();
	assert.equal(provider.provider, Provider.Copilot);

	// Does not throw when initializing without API key
	await provider.initialize({ temperature: 0.2, timeout: 30000 });
});

test('VSCodeLanguageModelProvider - Error mapping for consent denied (NoPermissions)', () => {
	const provider = new VSCodeLanguageModelProvider();
	const handle = provider.handleLanguageModelError.bind(provider);

	assert.throws(
		() => handle({ code: 'NoPermissions', message: 'User denied consent' }, 'copilot/gpt-4o'),
		(err) => {
			assert.ok(err instanceof ProviderAuthenticationError);
			assert.match(err.message, /access was not granted/i);
			return true;
		}
	);
});

test('VSCodeLanguageModelProvider - Error mapping for quota exceeded (QuotaExceeded)', () => {
	const provider = new VSCodeLanguageModelProvider();
	const handle = provider.handleLanguageModelError.bind(provider);

	assert.throws(
		() => handle({ code: 'QuotaExceeded', message: 'Quota limits reached' }, 'copilot/gpt-4o'),
		(err) => {
			assert.ok(err instanceof ProviderRateLimitError);
			assert.match(err.message, /quota exceeded/i);
			return true;
		}
	);
});

test('VSCodeLanguageModelProvider - Error mapping for content filtering (Blocked)', () => {
	const provider = new VSCodeLanguageModelProvider();
	const handle = provider.handleLanguageModelError.bind(provider);

	assert.throws(
		() => handle({ code: 'Blocked', message: 'Sensitive content' }, 'copilot/gpt-4o'),
		(err) => {
			assert.ok(err instanceof ProviderError);
			assert.match(err.message, /blocked by GitHub Copilot content policy/i);
			return true;
		}
	);
});

test('VSCodeLanguageModelProvider - Error mapping for generic error with authorization keywords', () => {
	const provider = new VSCodeLanguageModelProvider();
	const handle = provider.handleLanguageModelError.bind(provider);

	assert.throws(
		() => handle(new Error('User consent was not authorized'), 'copilot/gpt-4o'),
		(err) => {
			assert.ok(err instanceof ProviderAuthenticationError);
			return true;
		}
	);
});
