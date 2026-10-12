import type { AIProvider } from './AIProvider';
import type { CommitRequest, CommitResponse } from '../types/commit';
import { Provider, type ProviderConfiguration } from '../types/provider';
import { ProviderError } from '../utils/errors';
import type { LoggerService } from '../services/loggerService';

/**
 * AIProvider that operates in External Agent / MCP bridge mode.
 * In this mode, external agents (Antigravity, Claude Code, Codex) invoke GitIQ
 * via the Model Context Protocol stdio server to retrieve git context and produce suggestions.
 */
export class MCPProvider implements AIProvider {
	public readonly provider = Provider.MCP;

	public constructor(private readonly logger?: LoggerService) {}

	public async initialize(_configuration: ProviderConfiguration): Promise<void> {
		this.logger?.info('MCPProvider initialized in External Agent delegation mode.');
	}

	public async generateCommitMessage(request: CommitRequest): Promise<CommitResponse> {
		// When called from within VS Code in MCP mode, guide the user or delegate
		this.logger?.info('MCPProvider generateCommitMessage invoked.');
		if (!request.prompt) {
			throw new ProviderError('Prompt cannot be empty for MCP provider.');
		}

		return {
			message: {
				subject: 'feat(mcp): external agent delegation enabled'
			},
			provider: Provider.MCP,
			model: 'mcp-external-agent'
		};
	}
}
