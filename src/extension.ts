import * as vscode from 'vscode';
import { registerCheckGitRepositoryCommand } from './commands/checkGitRepositoryCommand';
import { registerHelloCommand } from './commands/helloCommand';
import { registerPreviewGitDiffCommand } from './commands/previewGitDiffCommand';
import { GitDiffPreviewProvider } from './providers/gitDiffPreviewProvider';
import { GitService } from './services/gitService';

/**
 * Activates CommitPilot AI when VS Code invokes one of its activation events.
 * Keep this entry point limited to composition and lifecycle management.
 */
export function activate(context: vscode.ExtensionContext): void {
	const gitService = new GitService();
	const gitDiffPreviewProvider = new GitDiffPreviewProvider();

	gitDiffPreviewProvider.register(context);
	registerHelloCommand(context);
	registerCheckGitRepositoryCommand(context, gitService);
	registerPreviewGitDiffCommand(context, gitService, gitDiffPreviewProvider);
}

/**
 * Runs when VS Code deactivates the extension. There are no long-lived
 * resources in Phase 1, so VS Code can dispose registered subscriptions.
 */
export function deactivate(): void {
	// Reserved for future service cleanup.
}
