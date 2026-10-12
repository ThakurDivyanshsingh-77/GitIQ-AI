import * as vscode from 'vscode';
import type { CodeReviewResult } from '../models/codeReviewModels';
import type { CodeReviewProvider } from '../providers/codeReviewProvider';
import type { SidebarWebviewProvider } from '../providers/sidebarWebviewProvider';
import type { CodeReviewService } from '../services/codeReviewService';
import type { LoggerService } from '../services/loggerService';
import { COMMAND_IDS } from '../utils/constants';

/** Cached result of the last code review run. */
let lastReviewResult: CodeReviewResult | undefined;

/** Returns the last code review result. */
export function getLastCodeReviewResult(): CodeReviewResult | undefined {
	return lastReviewResult;
}

/**
 * Registers the AI Code Review command handlers.
 */
export function registerAiCodeReviewCommand(
	context: vscode.ExtensionContext,
	codeReviewService: CodeReviewService,
	codeReviewProvider: CodeReviewProvider,
	sidebarWebviewProvider?: SidebarWebviewProvider,
	logger?: LoggerService
): void {
	// Primary Code Review execution command
	const reviewCommand = vscode.commands.registerCommand(
		COMMAND_IDS.aiCodeReview,
		async (): Promise<void> => {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

			if (!workspaceFolder) {
				logger?.warn('Code review executed without an open workspace.');
				void vscode.window.showWarningMessage('Please open a project to run AI Code Review.');
				return;
			}

			const workspacePath = workspaceFolder.uri.fsPath;

			try {
				logger?.info('Discovering reviewable repository changes...');

				// 1. Identify review target in priority order (Working tree → Staged → Branch)
				const target = await codeReviewService.determineReviewTarget(workspacePath);

				if (target.type === 'none') {
					logger?.info('No reviewable changes found in repository.');
					sidebarWebviewProvider?.postCodeReviewState({
						status: 'empty',
						message: 'No uncommitted, staged, or branch changes found to review.'
					});
					void vscode.window.showInformationMessage(
						'GitIQ: No reviewable changes found. Modify or stage files first, or switch to a feature branch with commits.'
					);
					return;
				}

				// If falling back to branch comparison, offer review
				if (target.type === 'branch' && target.branchInfo) {
					const choice = await vscode.window.showInformationMessage(
						`No uncommitted or staged changes found. Review changes on branch "${target.branchInfo.current}" against "${target.branchInfo.base}"?`,
						'Review Branch Changes',
						'Cancel'
					);

					if (choice !== 'Review Branch Changes') {
						logger?.info('User cancelled branch code review.');
						return;
					}
				}

				// 2. Notify sidebar of loading state
				sidebarWebviewProvider?.postCodeReviewState({
					status: 'loading',
					targetLabel: target.targetLabel,
					fileCount: target.files.length
				});

				// 3. Execute review with progress notification
				const result = await vscode.window.withProgress(
					{
						location: vscode.ProgressLocation.Notification,
						title: `$(search) GitIQ: Analyzing ${target.targetLabel}...`,
						cancellable: false
					},
					() => codeReviewService.runCodeReview(workspacePath, target)
				);

				lastReviewResult = result;

				// 4. Update sidebar webview with structured findings
				sidebarWebviewProvider?.postCodeReviewState({
					status: 'success',
					result
				});

				logger?.info(`Review complete: ${result.summary.totalFindings} issues detected.`);

				// 5. Present completion notification with action buttons
				const summaryMsg =
					result.summary.totalFindings === 0
						? `✓ GitIQ Code Review: No issues detected in ${result.summary.targetLabel}!`
						: `✓ GitIQ Code Review: Found ${result.summary.totalFindings} issue(s) (${result.summary.criticalCount} critical, ${result.summary.highCount} high).`;

				void vscode.window.showInformationMessage(
					summaryMsg,
					'Open Full Report',
					'Done'
				).then((action) => {
					if (action === 'Open Full Report' && result.rawMarkdown) {
						void codeReviewProvider.showCodeReview(result.rawMarkdown);
					}
				});
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				logger?.error(`Code Review failed: ${message}`, error);

				sidebarWebviewProvider?.postCodeReviewState({
					status: 'error',
					error: message
				});

				void vscode.window.showErrorMessage(
					`GitIQ Code Review Error: ${message}`,
					'Retry'
				).then((action) => {
					if (action === 'Retry') {
						void vscode.commands.executeCommand(COMMAND_IDS.aiCodeReview);
					}
				});
			}
		}
	);

	// Command to open the last review report in a Markdown editor tab
	const showReportCommand = vscode.commands.registerCommand(
		'gitIQ.showCodeReviewReport',
		async (): Promise<void> => {
			if (!lastReviewResult || !lastReviewResult.rawMarkdown) {
				void vscode.window.showInformationMessage('No code review has been performed yet. Run "AI Code Review" first.');
				return;
			}
			await codeReviewProvider.showCodeReview(lastReviewResult.rawMarkdown);
		}
	);

	context.subscriptions.push(reviewCommand, showReportCommand);
}
