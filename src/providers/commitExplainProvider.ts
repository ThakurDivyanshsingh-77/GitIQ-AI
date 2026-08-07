import * as vscode from 'vscode';

/**
 * Provides in-memory, read-only Markdown documents for AI Commit Explanations.
 */
export class CommitExplainProvider implements vscode.TextDocumentContentProvider, vscode.Disposable {
	public static readonly scheme = 'gitiq-commit-explain';

	private readonly changeEmitter = new vscode.EventEmitter<vscode.Uri>();
	private readonly explanationMap = new Map<string, string>();

	/** Signals VS Code when stored document content changes. */
	public readonly onDidChange = this.changeEmitter.event;

	/** Registers this provider for the lifetime of the extension. */
	public register(context: vscode.ExtensionContext): void {
		context.subscriptions.push(
			vscode.workspace.registerTextDocumentContentProvider(CommitExplainProvider.scheme, this),
			this
		);
	}

	/**
	 * Creates and displays a read-only Markdown document containing the AI explanation.
	 */
	public async showExplanation(hash: string, subject: string, explanation: string): Promise<void> {
		const shortHash = hash.slice(0, 7);
		const uri = vscode.Uri.from({
			scheme: CommitExplainProvider.scheme,
			path: `/GitIQ - Explanation ${shortHash}.md`
		});

		const markdownContent = [
			`# 🤖 GitIQ AI Commit Explanation`,
			``,
			`**Commit:** \`${shortHash}\``,
			`**Subject:** ${subject}`,
			``,
			`---`,
			``,
			explanation
		].join('\n');

		this.explanationMap.set(uri.toString(), markdownContent);
		this.changeEmitter.fire(uri);

		const document = await vscode.workspace.openTextDocument(uri);
		await vscode.languages.setTextDocumentLanguage(document, 'markdown');
		await vscode.window.showTextDocument(document, { preview: true });
	}

	/** Returns stored content when VS Code resolves provider URI. */
	public provideTextDocumentContent(uri: vscode.Uri): string {
		return this.explanationMap.get(uri.toString()) || '';
	}

	/** Disposes the change event emitter. */
	public dispose(): void {
		this.changeEmitter.dispose();
		this.explanationMap.clear();
	}
}
