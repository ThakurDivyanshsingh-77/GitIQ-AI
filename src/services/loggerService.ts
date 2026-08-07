import * as vscode from 'vscode';

/**
 * Provides centralized logging to a dedicated VS Code Output Channel ("CommitPilot AI").
 */
export class LoggerService implements vscode.Disposable {
	private readonly channel: vscode.OutputChannel;

	public constructor() {
		this.channel = vscode.window.createOutputChannel('CommitPilot AI');
	}

	/** Logs an informational message with a timestamp. */
	public info(message: string): void {
		this.channel.appendLine(`[${this.getTimestamp()}] [INFO] ${message}`);
	}

	/** Logs a warning message with a timestamp. */
	public warn(message: string): void {
		this.channel.appendLine(`[${this.getTimestamp()}] [WARN] ${message}`);
	}

	/** Logs an error message with a timestamp and optional error details. */
	public error(message: string, error?: unknown): void {
		this.channel.appendLine(`[${this.getTimestamp()}] [ERROR] ${message}`);
		if (error !== undefined) {
			const details = error instanceof Error ? error.stack || error.message : String(error);
			this.channel.appendLine(`  Details: ${details}`);
		}
	}

	/** Shows the output channel in the VS Code Output panel. */
	public show(): void {
		this.channel.show(true);
	}

	/** Disposes the underlying output channel when the extension deactivates. */
	public dispose(): void {
		this.channel.dispose();
	}

	private getTimestamp(): string {
		return new Date().toISOString();
	}
}
