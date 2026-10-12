import * as vscode from 'vscode';
import { GitIqMcpServer } from '../mcp/gitIqMcpServer';

/**
 * Registers GitIQ capabilities as native VS Code Language Model Tools (vscode.lm.registerTool).
 * This enables GitHub Copilot Chat inside VS Code to invoke GitIQ tools natively.
 */
export function registerLanguageModelTools(context: vscode.ExtensionContext): void {
	if (typeof vscode.lm === 'undefined' || typeof vscode.lm.registerTool !== 'function') {
		return;
	}

	const server = new GitIqMcpServer();
	const tools = server.getToolDefinitions();

	for (const tool of tools) {
		try {
			const toolName = `gitiq_${tool.name}`;
			const disposable = vscode.lm.registerTool(toolName, {
				async invoke(options: vscode.LanguageModelToolInvocationOptions<Record<string, unknown>>) {
					const input = (options.input as Record<string, unknown>) || {};
					const result = await server.executeTool(tool.name, input);
					const text = result.content[0]?.text || '';
					return new vscode.LanguageModelToolResult([
						new vscode.LanguageModelTextPart(text)
					]);
				}
			});

			context.subscriptions.push(disposable);
		} catch {
			// Gracefully skip if tool is already registered or not supported
		}
	}
}
