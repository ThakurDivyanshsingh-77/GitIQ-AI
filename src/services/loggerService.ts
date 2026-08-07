import * as vscode from 'vscode';

/**
 * Provides centralized logging to a dedicated VS Code Output Channel ("GitIQ").
 */
export class LoggerService implements vscode.Disposable {
	private readonly channel: vscode.OutputChannel;

	public constructor() {
		this.channel = vscode.window.createOutputChannel('GitIQ');
	}

	/** Logs an informational message. */
	public info(message: string): void {
		this.write('INFO', message);
	}

	/** Logs a warning message. */
	public warn(message: string): void {
		this.write('WARN', message);
	}

	/** Logs an error message with optional error details. */
	public error(message: string, error?: unknown): void {
		let details = message;
		if (error instanceof Error) {
			details += ` | Details: ${error.message}`;
			if (error.stack) {
				details += `\nStack trace:\n${error.stack}`;
			}
		} else if (error !== undefined) {
			details += ` | Details: ${String(error)}`;
		}
		this.write('ERROR', details);
	}

	/** Focuses and brings the GitIQ output channel to the front. */
	public show(): void {
		this.channel.show(true);
	}

	/** Cleans up the OutputChannel resource. */
	public dispose(): void {
		this.channel.dispose();
	}

	private write(level: 'INFO' | 'WARN' | 'ERROR', message: string): void {
		const timestamp = new Date().toISOString();
		this.channel.appendLine(`[GitIQ] ${timestamp} [${level}]: ${message}`);
	}
}
