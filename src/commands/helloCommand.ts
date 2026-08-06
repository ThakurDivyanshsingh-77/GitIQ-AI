import * as vscode from 'vscode';

const HELLO_COMMAND_ID = 'commitPilotAI.hello';

/**
 * Registers the Phase 1 health-check command and attaches its disposable to
 * the extension context, ensuring VS Code cleans it up on deactivation.
 */
export function registerHelloCommand(context: vscode.ExtensionContext): void {
	const helloCommand = vscode.commands.registerCommand(HELLO_COMMAND_ID, () => {
		void vscode.window.showInformationMessage('CommitPilot AI is running successfully 🚀');
	});

	context.subscriptions.push(helloCommand);
}
