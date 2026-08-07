import * as vscode from 'vscode';
import type { RepositoryInfo } from '../services/gitService';

/**
 * Provides in-memory, read-only Markdown documents for Repository Information summary.
 */
export class RepoInfoProvider implements vscode.TextDocumentContentProvider, vscode.Disposable {
	public static readonly scheme = 'gitiq-repo-info';

	private readonly uri = vscode.Uri.from({
		scheme: RepoInfoProvider.scheme,
		path: '/GitIQ - Repository Information.md'
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
	 * Formats and displays repository information in a read-only Markdown document.
	 */
	public async showRepositoryInfo(info: RepositoryInfo): Promise<void> {
		this.content = [
			`# 📁 Repository Information: ${info.repoName}`,
			``,
			`---`,
			``,
			`- **Current Branch:** \`${info.currentBranch}\``,
			`- **Remote Origin:** ${info.remoteUrl}`,
			`- **Total Commits:** ${info.totalCommits}`,
			`- **Latest Commit:** ${info.latestCommit}`,
			``,
			`---`,
			``,
			`## 🛠 Working Tree Status`,
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
