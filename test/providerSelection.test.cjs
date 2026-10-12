const test = require('node:test');
const assert = require('node:assert/strict');
const { SettingsService, SECRET_STORAGE_API_KEY, SECRET_STORAGE_GEMINI_API_KEY } = require('../out/services/SettingsService');
const { Provider } = require('../out/types/provider');
const { ConfigurationError } = require('../out/utils/errors');

class MockSecretStorage {
	constructor() {
		this.store = new Map();
	}
	async get(key) {
		return this.store.get(key);
	}
	async store(key, value) {
		this.store.set(key, value);
	}
	async delete(key) {
		this.store.delete(key);
	}
}

function createMockSettingsService(initialProvider = Provider.Groq) {
	const secrets = new MockSecretStorage();
	let currentProvider = initialProvider;
	let currentModel = 'llama-3.3-70b-versatile';

	const service = new SettingsService(secrets);

	service.getConfiguration = () => ({
		get: (key, defaultValue) => {
			if (key === 'provider') return currentProvider;
			if (key === 'model') return currentModel;
			if (key === 'temperature') return 0.2;
			if (key === 'timeout') return 30000;
			return defaultValue;
		},
		update: async (key, value) => {
			if (key === 'provider') currentProvider = value;
			if (key === 'model') currentModel = value;
		}
	});

	return { service, secrets, setProvider: (p) => { currentProvider = p; } };
}

test('Provider Selection - Default provider resolution', () => {
	const { service } = createMockSettingsService(Provider.Groq);
	assert.equal(service.getProvider(), Provider.Groq);
});

test('Provider Selection - Switch to GitHub Copilot', async () => {
	const { service } = createMockSettingsService();
	await service.setProvider(Provider.Copilot);
	assert.equal(service.getProvider(), Provider.Copilot);
});

test('Provider Selection - Copilot snapshot requires NO API key', async () => {
	const { service, setProvider } = createMockSettingsService();
	setProvider(Provider.Copilot);

	const snapshot = await service.getConfigurationSnapshot();
	assert.equal(snapshot.provider, Provider.Copilot);
	assert.equal(snapshot.apiKey, '');
});

test('Provider Selection - Ollama snapshot requires NO API key', async () => {
	const { service, setProvider } = createMockSettingsService();
	setProvider(Provider.Ollama);

	const snapshot = await service.getConfigurationSnapshot();
	assert.equal(snapshot.provider, Provider.Ollama);
	assert.equal(snapshot.apiKey, '');
});

test('Provider Selection - Groq throws ConfigurationError when API key is missing', async () => {
	const { service, setProvider } = createMockSettingsService();
	setProvider(Provider.Groq);

	await assert.rejects(
		async () => service.getConfigurationSnapshot(),
		(err) => {
			assert.ok(err instanceof ConfigurationError);
			assert.match(err.message, /Missing Groq API key/);
			return true;
		}
	);
});

test('Provider Selection - Groq snapshot succeeds with valid API key', async () => {
	const { service, secrets, setProvider } = createMockSettingsService();
	setProvider(Provider.Groq);
	await secrets.store(SECRET_STORAGE_API_KEY, 'gsk_test1234567890abcdef');

	const snapshot = await service.getConfigurationSnapshot();
	assert.equal(snapshot.provider, Provider.Groq);
	assert.equal(snapshot.apiKey, 'gsk_test1234567890abcdef');
});

test('Provider Selection - Gemini key storage and snapshot', async () => {
	const { service, secrets, setProvider } = createMockSettingsService();
	setProvider(Provider.Gemini);
	await secrets.store(SECRET_STORAGE_GEMINI_API_KEY, 'AIzaSyTestGeminiKey123');

	const snapshot = await service.getConfigurationSnapshot();
	assert.equal(snapshot.provider, Provider.Gemini);
	assert.equal(snapshot.apiKey, 'AIzaSyTestGeminiKey123');
});
