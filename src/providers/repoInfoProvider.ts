import * as vscode from 'vscode';
import type { RepositoryInfo } from '../services/gitService';

/**
 * Provides in-memory, read-only Markdown documents for Repository Information.
 */
export class RepoInfoProvider implements vscode.TextDocumentContentProvider, vscode.Disposable {
	public static readonly scheme = 'commitpilot-repo-info';

	private readonly uri = vscode.Uri.from({
		scheme: RepoInfoProvider.scheme,
		path: '/CommitPilot AI - Repository Information.md'
	});

	private readonly changeEmitter = new vscode.EventEmitter<vscode.Uri>();
	private content = '';

	/** Signals VS Code when stored document content changes. */
	public readonly onDidChange = this.changeEmitter.event;

	/** Registers this provider for the lifetime of the extension. */
	public register(context: vscode.ExtensionContext): void {
		context.subscriptions.push(
			vscode.workspace.registerTextDocumentContentProvider(RepoInfoProvider.scheme, this),
			this
		);
	}

	/**
	 * Creates and displays a read-only Markdown document containing repository details.
	 */
	public async showRepositoryInfo(info: RepositoryInfo): Promise<void> {
		this.content = [
			`# 📊 CommitPilot AI - Repository Information`,
			``,
			`- **Repository Name:** \`${info.repoName}\``,
			`- **Current Branch:** \`${info.currentBranch}\``,
			`- **Remote Origin URL:** \`${info.remoteUrl}\``,
			`- **Latest Commit:** \`${info.latestCommit}\``,
			`- **Total Commits:** \`${info.totalCommits}\``,
			``,
			`---`,
			``,
			`### Working Tree Status (\`git status --short\`)`,
			``,
			`\`\`\`text`,
			info.gitStatus,
			`\`\`\``
		].join('\n');

		this.changeEmitter.fire(this.uri);

		const document = await vscode.workspace.openTextDocument(this.uri);
		await vscode.languages.setTextDocumentLanguage(document, 'markdown');
		await vscode.window.showTextDocument(document, { preview: true });
	}

	/** Returns stored content when VS Code resolves provider URI. */
	public provideTextDocumentContent(uri: vscode.Uri): string {
		return uri.toString() === this.uri.toString() ? this.content : '';
	}

	/** Disposes the change event emitter. */
	public dispose(): void {
		this.changeEmitter.dispose();
	}
}
