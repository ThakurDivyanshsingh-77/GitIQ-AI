import * as vscode from 'vscode';
import { registerCheckGitRepositoryCommand } from './commands/checkGitRepositoryCommand';
import { registerCopyCommitHashCommand } from './commands/copyCommitHashCommand';
import { registerCopyEntirePRCommand } from './commands/copyEntirePRCommand';
import { registerCopyPRDescriptionCommand } from './commands/copyPRDescriptionCommand';
import { registerCopyPRTitleCommand } from './commands/copyPRTitleCommand';
import { registerCurrentBranchCommand } from './commands/currentBranchCommand';
import { registerExplainCommitCommand } from './commands/explainCommitCommand';
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
import { registerRepositoryInfoCommand } from './commands/repositoryInfoCommand';
import { registerSavePullRequestCommand } from './commands/savePullRequestCommand';
import { registerViewCommitHistoryCommand } from './commands/viewCommitHistoryCommand';
import { CommitPilotAIProviderFactory } from './providers/AIProviderFactory';
import { CommitDetailsProvider } from './providers/commitDetailsProvider';
import { CommitExplainProvider } from './providers/commitExplainProvider';
import { GitDiffPreviewProvider } from './providers/gitDiffPreviewProvider';
import { PullRequestProvider } from './providers/pullRequestProvider';
import { RepoInfoProvider } from './providers/repoInfoProvider';
import { CommitMessageService } from './services/commitMessageService';
import { CommitMessageValidator } from './services/commitMessageValidator';
import { ConfigService } from './services/configService';
import { GitService } from './services/gitService';
import { LoggerService } from './services/loggerService';
import { PromptBuilder } from './services/promptBuilder';
import { PullRequestService } from './services/pullRequestService';

let loggerService: LoggerService | undefined;

/**
 * Activates CommitPilot AI when VS Code invokes one of its activation events.
 * Handles service composition, configuration validation, and output logging.
 */
export function activate(context: vscode.ExtensionContext): void {
	loggerService = new LoggerService();
	context.subscriptions.push(loggerService);

	loggerService.info('Activating CommitPilot AI extension...');

	const configService = new ConfigService();
	configService.validateConfiguration(loggerService);

	const gitService = new GitService(loggerService);
	const gitDiffPreviewProvider = new GitDiffPreviewProvider();
	const commitDetailsProvider = new CommitDetailsProvider();
	const commitExplainProvider = new CommitExplainProvider();
	const repoInfoProvider = new RepoInfoProvider();
	const pullRequestProvider = new PullRequestProvider();
	const providerFactory = new CommitPilotAIProviderFactory(loggerService);
	const commitMessageValidator = new CommitMessageValidator();
	const promptBuilder = new PromptBuilder();

	const commitMessageService = new CommitMessageService(
		gitService,
		configService,
		promptBuilder,
		providerFactory,
		commitMessageValidator,
		loggerService
	);

	const pullRequestService = new PullRequestService(
		gitService,
		configService,
		promptBuilder,
		providerFactory,
		loggerService
	);

	gitDiffPreviewProvider.register(context);
	commitDetailsProvider.register(context);
	commitExplainProvider.register(context);
	repoInfoProvider.register(context);
	pullRequestProvider.register(context);

	// Phase 1–7 commands
	registerHelloCommand(context);
	registerCheckGitRepositoryCommand(context, gitService);
	registerPreviewGitDiffCommand(context, gitService, gitDiffPreviewProvider);
	registerGenerateCommitMessageCommand(context, commitMessageService, loggerService);

	// Phase 8 commands
	registerViewCommitHistoryCommand(context, gitService, commitDetailsProvider, loggerService);
	registerExplainCommitCommand(context, gitService, commitMessageService, commitExplainProvider, loggerService);
	registerCopyCommitHashCommand(context, gitService, loggerService);

	// Phase 9 commands
	registerPushCommand(context, gitService, loggerService);
	registerPullCommand(context, gitService, loggerService);
	registerFetchCommand(context, gitService, loggerService);
	registerCurrentBranchCommand(context, gitService, loggerService);
	registerRepositoryInfoCommand(context, gitService, repoInfoProvider, loggerService);
	registerOpenRepositoryCommand(context, gitService, loggerService);
	registerOpenBranchCommand(context, gitService, loggerService);

	// Phase 10 commands
	registerGeneratePullRequestCommand(context, pullRequestService, pullRequestProvider, loggerService);
	registerCopyPRTitleCommand(context, loggerService);
	registerCopyPRDescriptionCommand(context, loggerService);
	registerCopyEntirePRCommand(context, loggerService);
	registerSavePullRequestCommand(context, loggerService);
	registerOpenPullRequestPageCommand(context, gitService, loggerService);

	loggerService.info('CommitPilot AI extension activated successfully 🚀');
}

/**
 * Runs when VS Code deactivates the extension. Cleanly disposes long-lived services.
 */
export function deactivate(): void {
	if (loggerService) {
		loggerService.info('Deactivating CommitPilot AI extension...');
		loggerService.dispose();
		loggerService = undefined;
	}
}
