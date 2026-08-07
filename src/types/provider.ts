/** Supported AI backends that may be configured in a future integration phase. */
export enum Provider {
	Groq = 'groq',
	OpenAI = 'openai',
	Gemini = 'gemini',
	Ollama = 'ollama'
}

/** Runtime options required by an AI provider implementation. */
export interface ProviderConfiguration {
	readonly apiKey?: string;
	readonly model?: string;
	readonly temperature: number;
	readonly timeout: number;
}
