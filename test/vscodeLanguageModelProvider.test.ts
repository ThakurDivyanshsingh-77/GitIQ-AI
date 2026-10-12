import test from 'node:test';
import assert from 'node:assert/strict';
import { VSCodeLanguageModelProvider } from '../src/providers/VSCodeLanguageModelProvider';
import { Provider } from '../src/types/provider';
import {
	ProviderAuthenticationError,
	ProviderError,
	ProviderRateLimitError,
	ProviderTimeoutError
} from '../utils/errors';

test('VSCodeLanguageModelProvider - Identity and initialization', async () => {
	const provider = new VSCodeLanguageModelProvider();
	assert.equal(provider.provider, Provider.Copilot);

	// Does not throw when initializing without API key
	await provider.initialize({ temperature: 0.2, timeout: 30000 });
});

test('VSCodeLanguageModelProvider - Error mapping for consent denied (NoPermissions)', () => {
	const provider = new VSCodeLanguageModelProvider();
	const handle = (provider as any).handleLanguageModelError.bind(provider);

	assert.throws(
		() => handle({ code: 'NoPermissions', message: 'User denied consent' }, 'copilot/gpt-4o'),
		(err: Error) => {
			assert.ok(err instanceof ProviderAuthenticationError);
			assert.match(err.message, /access was not granted/i);
			return true;
		}
	);
});

test('VSCodeLanguageModelProvider - Error mapping for quota exceeded (QuotaExceeded)', () => {
	const provider = new VSCodeLanguageModelProvider();
	const handle = (provider as any).handleLanguageModelError.bind(provider);

	assert.throws(
		() => handle({ code: 'QuotaExceeded', message: 'Quota limits reached' }, 'copilot/gpt-4o'),
		(err: Error) => {
			assert.ok(err instanceof ProviderRateLimitError);
			assert.match(err.message, /quota exceeded/i);
			return true;
		}
	);
});

test('VSCodeLanguageModelProvider - Error mapping for content filtering (Blocked)', () => {
	const provider = new VSCodeLanguageModelProvider();
	const handle = (provider as any).handleLanguageModelError.bind(provider);

	assert.throws(
		() => handle({ code: 'Blocked', message: 'Sensitive content' }, 'copilot/gpt-4o'),
		(err: Error) => {
			assert.ok(err instanceof ProviderError);
			assert.match(err.message, /blocked by GitHub Copilot content policy/i);
			return true;
		}
	);
});

test('VSCodeLanguageModelProvider - Error mapping for cancellation', () => {
	const provider = new VSCodeLanguageModelProvider();
	const handle = (provider as any).handleLanguageModelError.bind(provider);

	// Mock CancellationError
	class MockCancellationError extends Error {}
	// Since vscode is mocked/unavailable in pure unit test, test generic string check or class
	assert.throws(
		() => handle(new Error('The user cancelled the request'), 'copilot/gpt-4o'),
		(err: Error) => {
			assert.ok(err instanceof ProviderError);
			return true;
		}
	);
});
