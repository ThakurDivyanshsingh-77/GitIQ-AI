import * as vscode from 'vscode';
import { registerCheckGitRepositoryCommand } from './commands/checkGitRepositoryCommand';
import { registerCommitActivityCommand } from './commands/commitActivityCommand';
import { registerCommitStatisticsCommand } from './commands/commitStatisticsCommand';
import { registerCopyCommitHashCommand } from './commands/copyCommitHashCommand';
import { registerCopyEntirePRCommand } from './commands/copyEntirePRCommand';
import { registerCopyPRDescriptionCommand } from './commands/copyPRDescriptionCommand';
import { registerCopyPRTitleCommand } from './commands/copyPRTitleCommand';
import { registerCurrentBranchCommand } from './commands/currentBranchCommand';
import { registerExplainCommitCommand } from './commands/explainCommitCommand';
import { registerExportHistoryReportCommand } from './commands/exportHistoryReportCommand';
import { registerFetchCommand } from './commands/fetchCommand';
import { registerGenerateCommitMessageCommand } from './commands/generateCommitMessageCommand';
import { registerGeneratePullRequestCommand } from './commands/generatePullRequestCommand';
import { registerHelloCommand } from './commands/helloCommand';
import { registerOpenBranchCommand } from './commands/openBranchCommand';
import { registerOpenPullRequestPageCommand } from './commands/openPullRequestPageCommand';
import { registerOpenRepositoryCommand } from './commands/openRepositoryCommand';
import { registerPreviewGitDiffCommand } from './commands/previewGitDiffCommand';
import { registerPullCommand } from './commands/pullCommand';
import { registerPushCommand } from './commands/pushCommand';
import { registerRemoveApiKeyCommand } from './commands/removeApiKeyCommand';
import { registerRepositoryInfoCommand } from './commands/repositoryInfoCommand';
import { registerSavePullRequestCommand } from './commands/savePullRequestCommand';
import { registerSearchCommitHistoryCommand } from './commands/searchCommitHistoryCommand';
import { registerSelectModelCommand } from './commands/selectModelCommand';
import { registerSetApiKeyCommand } from './commands/setApiKeyCommand';
import { registerTopContributorsCommand } from './commands/topContributorsCommand';
import { registerUpdateApiKeyCommand } from './commands/updateApiKeyCommand';
import { registerViewCommitHistoryCommand } from './commands/viewCommitHistoryCommand';
import { GitIQAIProviderFactory } from './providers/AIProviderFactory';
import { CommitDetailsProvider } from './providers/commitDetailsProvider';
import { CommitExplainProvider } from './providers/commitExplainProvider';
import { GitDiffPreviewProvider } from './providers/gitDiffPreviewProvider';
import { HistoryPreviewProvider } from './providers/historyPreviewProvider';
import { PullRequestProvider } from './providers/pullRequestProvider';
import { RepoInfoProvider } from './providers/repoInfoProvider';
import { CommitMessageService } from './services/commitMessageService';
import { CommitMessageValidator } from './services/commitMessageValidator';
import { GitService } from './services/gitService';
import { HistoryService } from './services/historyService';
import { LoggerService } from './services/loggerService';
import { PromptBuilder } from './services/promptBuilder';
import { PullRequestService } from './services/pullRequestService';
import { SettingsService } from './services/SettingsService';

let loggerService: LoggerService | undefined;

/**
 * Activates GitIQ when VS Code invokes one of its activation events.
 * Handles service composition, configuration validation, and output logging.
 */
export function activate(context: vscode.ExtensionContext): void {
	console.log('[GitIQ] Extension activate() started');
	try {
		loggerService = new LoggerService();
		context.subscriptions.push(loggerService);

		loggerService.info('Activating GitIQ extension...');
		console.log('[GitIQ] LoggerService initialized');

		const settingsService = new SettingsService(context.secrets, loggerService);

		// Run migration and non-blocking validation asynchronously without letting them block activation
		try {
			void settingsService.migrateOldApiKeyIfNeeded();
			void settingsService.validateConfiguration();
		} catch (migError) {
			loggerService.warn(`Non-blocking activation check failed: ${migError instanceof Error ? migError.message : String(migError)}`);
		}

		const gitService = new GitService(loggerService);
		const historyService = new HistoryService(gitService, loggerService);
		const gitDiffPreviewProvider = new GitDiffPreviewProvider();
		const commitDetailsProvider = new CommitDetailsProvider();
		const commitExplainProvider = new CommitExplainProvider();
		const repoInfoProvider = new RepoInfoProvider();
		const pullRequestProvider = new PullRequestProvider();
		const historyPreviewProvider = new HistoryPreviewProvider();
		const providerFactory = new GitIQAIProviderFactory(loggerService);
		const commitMessageValidator = new CommitMessageValidator();
		const promptBuilder = new PromptBuilder();

		const commitMessageService = new CommitMessageService(
			gitService,
			settingsService,
			promptBuilder,
			providerFactory,
			commitMessageValidator,
			loggerService
		);

		const pullRequestService = new PullRequestService(
			gitService,
			settingsService,
			promptBuilder,
			providerFactory,
			loggerService
		);

		// Register Virtual Document Content Providers
		gitDiffPreviewProvider.register(context);
		commitDetailsProvider.register(context);
		commitExplainProvider.register(context);
		repoInfoProvider.register(context);
		pullRequestProvider.register(context);
		historyPreviewProvider.register(context);

		console.log('[GitIQ] Registering extension commands...');

		// Core Git & AI commands
		registerHelloCommand(context);
		registerCheckGitRepositoryCommand(context, gitService);
		registerPreviewGitDiffCommand(context, gitService, gitDiffPreviewProvider);
		registerGenerateCommitMessageCommand(context, commitMessageService, loggerService);

		// History & Explanation commands
		registerViewCommitHistoryCommand(context, gitService, commitDetailsProvider, loggerService);
		registerExplainCommitCommand(context, gitService, commitMessageService, commitExplainProvider, loggerService);
		registerCopyCommitHashCommand(context, gitService, loggerService);

		// GitHub Integration commands
		registerPushCommand(context, gitService, loggerService);
		registerPullCommand(context, gitService, loggerService);
		registerFetchCommand(context, gitService, loggerService);
		registerCurrentBranchCommand(context, gitService, loggerService);
		registerRepositoryInfoCommand(context, gitService, repoInfoProvider, loggerService);
		registerOpenRepositoryCommand(context, gitService, loggerService);
		registerOpenBranchCommand(context, gitService, loggerService);

		// Pull Request Helper commands
		registerGeneratePullRequestCommand(context, pullRequestService, pullRequestProvider, loggerService);
		registerCopyPRTitleCommand(context, loggerService);
		registerCopyPRDescriptionCommand(context, loggerService);
		registerCopyEntirePRCommand(context, loggerService);
		registerSavePullRequestCommand(context, loggerService);
		registerOpenPullRequestPageCommand(context, gitService, loggerService);

		// Commit History Analytics commands
		registerSearchCommitHistoryCommand(context, historyService, historyPreviewProvider, loggerService);
		registerCommitStatisticsCommand(context, historyService, historyPreviewProvider, loggerService);
		registerTopContributorsCommand(context, historyService, historyPreviewProvider, loggerService);
		registerCommitActivityCommand(context, historyService, historyPreviewProvider, loggerService);
		registerExportHistoryReportCommand(context, historyService, loggerService);

		// Settings & Configuration commands
		registerSetApiKeyCommand(context, settingsService, loggerService);
		registerUpdateApiKeyCommand(context, settingsService, loggerService);
		registerRemoveApiKeyCommand(context, settingsService, loggerService);
		registerSelectModelCommand(context, settingsService, loggerService);

		console.log('[GitIQ] All 29 commands registered successfully');
		loggerService.info('GitIQ extension activated successfully 🚀');
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`[GitIQ] Extension activation error: ${message}`, error);
	}
}

/**
 * Runs when VS Code deactivates the extension. Cleanly disposes long-lived services.
 */
export function deactivate(): void {
	if (loggerService) {
		loggerService.info('Deactivating GitIQ extension...');
		loggerService.dispose();
		loggerService = undefined;
	}
}
