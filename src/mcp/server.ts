#!/usr/bin/env node
import * as readline from 'node:readline';
import { GitIqMcpServer } from './gitIqMcpServer';

interface JsonRpcRequest {
	jsonrpc: string;
	id?: string | number;
	method: string;
	params?: Record<string, unknown>;
}

interface JsonRpcResponse {
	jsonrpc: '2.0';
	id?: string | number;
	result?: unknown;
	error?: {
		code: number;
		message: string;
		data?: unknown;
	};
}

/**
 * GitIQ Model Context Protocol (MCP) Stdio Server.
 * Exposes GitIQ tools over standard input/output for external AI agents such as
 * Google Antigravity, Claude Code, OpenAI Codex, and Claude Desktop.
 */
export function startMcpServer(): void {
	const server = new GitIqMcpServer();
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
		terminal: false
	});

	const sendResponse = (response: JsonRpcResponse): void => {
		const json = JSON.stringify(response);
		process.stdout.write(json + '\n');
	};

	rl.on('line', async (line) => {
		const trimmed = line.trim();
		if (!trimmed) {
			return;
		}

		let request: JsonRpcRequest;
		try {
			request = JSON.parse(trimmed) as JsonRpcRequest;
		} catch {
			sendResponse({
				jsonrpc: '2.0',
				error: { code: -32700, message: 'Parse error' }
			});
			return;
		}

		if (typeof request.id === 'undefined') {
			// Notification (no response needed)
			return;
		}

		try {
			switch (request.method) {
				case 'initialize': {
					sendResponse({
						jsonrpc: '2.0',
						id: request.id,
						result: {
							protocolVersion: '2024-11-05',
							capabilities: {
								tools: {}
							},
							serverInfo: {
								name: 'gitiq-mcp',
								version: '1.1.0'
							}
						}
					});
					break;
				}

				case 'ping': {
					sendResponse({
						jsonrpc: '2.0',
						id: request.id,
						result: {}
					});
					break;
				}

				case 'tools/list': {
					sendResponse({
						jsonrpc: '2.0',
						id: request.id,
						result: {
							tools: server.getToolDefinitions()
						}
					});
					break;
				}

				case 'tools/call': {
					const toolName = request.params?.name as string;
					const toolArgs = (request.params?.arguments as Record<string, unknown>) || {};

					if (!toolName) {
						sendResponse({
							jsonrpc: '2.0',
							id: request.id,
							error: { code: -32602, message: 'Missing tool name' }
						});
						return;
					}

					const toolResult = await server.executeTool(toolName, toolArgs);
					sendResponse({
						jsonrpc: '2.0',
						id: request.id,
						result: toolResult
					});
					break;
				}

				default: {
					sendResponse({
						jsonrpc: '2.0',
						id: request.id,
						error: { code: -32601, message: `Method not found: ${request.method}` }
					});
					break;
				}
			}
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			sendResponse({
				jsonrpc: '2.0',
				id: request.id,
				error: { code: -32000, message }
			});
		}
	});

	process.stderr.write('[GitIQ MCP] Server started on stdio.\n');
}

// Auto-start when executed directly
if (typeof process !== 'undefined' && process.argv[1]?.includes('server')) {
	startMcpServer();
}
