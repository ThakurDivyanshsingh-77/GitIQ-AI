/** Supported AI backends supported by GitIQ. */
export enum Provider {
	Groq = 'groq',
	Copilot = 'copilot',
	Gemini = 'gemini',
	Ollama = 'ollama',
	MCP = 'mcp',
	OpenAI = 'openai'
}

/** Runtime options required by an AI provider implementation. */
export interface ProviderConfiguration {
	readonly apiKey?: string;
	readonly model?: string;
	readonly temperature: number;
	readonly timeout: number;
	readonly endpoint?: string;
}
