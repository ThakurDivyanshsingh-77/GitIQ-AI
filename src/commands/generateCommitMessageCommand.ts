import * as vscode from 'vscode';
import type { CommitMessageService } from '../services/commitMessageService';
import type { LoggerService } from '../services/loggerService';
import { COMMAND_IDS } from '../utils/constants';
import {
	ConfigurationError,
	GitCommitError,
	InvalidCommitMessageError,
	NoStagedChangesError,
	NotGitRepositoryError,
	ProviderAuthenticationError,
	ProviderError,
	ProviderNetworkError,
	ProviderPayloadTooLargeError,
	ProviderRateLimitError,
	ProviderTimeoutError
} from '../utils/errors';

/**
 * Registers the user-facing generation workflow. Business concerns remain in
 * CommitMessageService; this command is limited to workspace and UI orchestration.
 */
export function registerGenerateCommitMessageCommand(
	context: vscode.ExtensionContext,
	commitMessageService: CommitMessageService,
	logger?: LoggerService
): void {
	const generateCommitMessageCommand = vscode.commands.registerCommand(
		COMMAND_IDS.generateCommitMessage,
		async (): Promise<string | undefined> => {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

			if (!workspaceFolder) {
				logger?.warn('Generate Commit Message command executed without an open workspace.');
				void vscode.window.showWarningMessage('Please open a project.');
				return undefined;
			}

			try {
				logger?.info('Executing CommitPilot AI: Generate Commit Message command...');
				const result = await vscode.window.withProgress(
					{
						location: vscode.ProgressLocation.Notification,
						title: 'Analyzing staged changes...',
						cancellable: false
					},
					() => commitMessageService.generateCommitMessage(workspaceFolder.uri.fsPath)
				);

				if (result.isTruncated) {
					void vscode.window.showWarningMessage(
						'Large staged changes detected. Only the most relevant diff was analyzed.'
					);
				}

				const userInput = await vscode.window.showInputBox({
					title: 'CommitPilot AI',
					prompt: 'Review or edit the generated commit message',
					value: result.message.subject,
					ignoreFocusOut: true
				});

				if (userInput === undefined) {
					logger?.info('User canceled commit message input box.');
					return undefined;
				}

				const trimmedMessage = userInput.trim();

				if (!trimmedMessage) {
					logger?.warn('User provided an empty commit message.');
					void vscode.window.showWarningMessage('Commit message cannot be empty.');
					return undefined;
				}

				await commitMessageService.commit(workspaceFolder.uri.fsPath, trimmedMessage);
				logger?.info(`Commit completed successfully: "${trimmedMessage}"`);
				void vscode.window.showInformationMessage('Commit created successfully.');
				return trimmedMessage;
			} catch (error: unknown) {
				reportDevelopmentError(error, logger);
				showGenerationError(error);
				return undefined;
			}
		}
	);

	context.subscriptions.push(generateCommitMessageCommand);
}

/**
 * Emits complete development diagnostics before the user-friendly message is shown.
 */
function reportDevelopmentError(error: unknown, logger?: LoggerService): void {
	const originalError = getOriginalError(error);
	const httpStatus = getErrorProperty(originalError, 'status');
	const responseBody = getErrorProperty(originalError, 'error');
	const stack = originalError instanceof Error ? originalError.stack : undefined;
	const message = originalError instanceof Error ? originalError.message : String(originalError);

	logger?.error(`Generate Commit Message command error: ${message}`, error);

	console.error('[CommitPilot AI] Generate Commit Message failed', {
		originalError,
		stack,
		httpStatus,
		groqResponseBody: responseBody,
		missingApiKey: error instanceof ProviderAuthenticationError,
		invalidJson: originalError instanceof SyntaxError,
		sdkErrorName: originalError instanceof Error ? originalError.name : typeof originalError
	});
}

/** Returns the Groq SDK error preserved by GroqProvider, or the received error itself. */
function getOriginalError(error: unknown): unknown {
	if (error instanceof Error && error.cause !== undefined) {
		return error.cause;
	}
	return error;
}

/** Safely reads optional properties from SDK errors without relying on their concrete class. */
function getErrorProperty(error: unknown, property: string): unknown {
	if (!error || typeof error !== 'object') {
		return undefined;
	}
	return Reflect.get(error, property);
}

/** Maps typed domain failures to distinct, clear, non-technical user messages. */
function showGenerationError(error: unknown): void {
	if (error instanceof NotGitRepositoryError) {
		void vscode.window.showWarningMessage('Git repository not found. Please open a Git project folder.');
		return;
	}

	if (error instanceof NoStagedChangesError) {
		void vscode.window.showInformationMessage(
			'No staged files found. Please stage files using "git add" before generating a commit message.'
		);
		return;
	}

	if (error instanceof GitCommitError) {
		void vscode.window.showErrorMessage(error.message);
		return;
	}

	if (error instanceof ConfigurationError || error instanceof ProviderAuthenticationError) {
		void vscode.window.showErrorMessage('API key missing or invalid. Please configure your Groq API key in VS Code Settings.');
		return;
	}

	if (error instanceof ProviderTimeoutError) {
		void vscode.window.showErrorMessage('Groq API request timed out. Please check your connection and try again.');
		return;
	}

	if (error instanceof ProviderNetworkError) {
		void vscode.window.showErrorMessage('Network unavailable. Please check your internet connection.');
		return;
	}

	if (error instanceof ProviderRateLimitError) {
		void vscode.window.showErrorMessage('Rate limit exceeded. Please wait a moment before trying again.');
		return;
	}

	if (error instanceof ProviderPayloadTooLargeError) {
		void vscode.window.showErrorMessage('Token limit exceeded. Staged changes are too large for the AI model.');
		return;
	}

	if (error instanceof InvalidCommitMessageError) {
		void vscode.window.showErrorMessage(error.message);
		return;
	}

	if (error instanceof ProviderError) {
		void vscode.window.showErrorMessage('AI commit generation failed. Check the Output window for details.');
		return;
	}

	void vscode.window.showErrorMessage('Unable to generate a commit message. Please try again.');
}
