import * as vscode from 'vscode';
import { COMMAND_IDS } from '../utils/constants';

/**
 * Registers the Phase 1 health-check command and attaches its disposable to
 * the extension context, ensuring VS Code cleans it up on deactivation.
 */
export function registerHelloCommand(context: vscode.ExtensionContext): void {
	const helloCommand = vscode.commands.registerCommand(COMMAND_IDS.hello, () => {
		void vscode.window.showInformationMessage('CommitPilot AI is running successfully 🚀');
	});

	context.subscriptions.push(helloCommand);
}
