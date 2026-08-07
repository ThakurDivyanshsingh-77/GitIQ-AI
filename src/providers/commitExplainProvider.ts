import * as vscode from 'vscode';

/**
 * Provides in-memory, read-only documents for AI Commit Explanations.
 */
export class CommitExplainProvider implements vscode.TextDocumentContentProvider, vscode.Disposable {
	public static readonly scheme = 'commitpilot-commit-explain';

	private readonly changeEmitter = new vscode.EventEmitter<vscode.Uri>();
	private readonly contentMap = new Map<string, string>();

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
	public async showExplanation(hash: string, explanation: string): Promise<void> {
		const shortHash = hash.slice(0, 8);
		const uri = vscode.Uri.from({
			scheme: CommitExplainProvider.scheme,
			path: `/Commit ${shortHash} - AI Explanation.md`
		});

		const formattedContent = [
			`# 🤖 CommitPilot AI Explanation`,
			`**Commit Hash:** \`${hash}\``,
			``,
			`---`,
			``,
			explanation
		].join('\n');

		this.contentMap.set(uri.toString(), formattedContent);
		this.changeEmitter.fire(uri);

		const document = await vscode.workspace.openTextDocument(uri);
		await vscode.languages.setTextDocumentLanguage(document, 'markdown');
		await vscode.window.showTextDocument(document, { preview: true });
	}

	/** Returns stored content when VS Code resolves a provider URI. */
	public provideTextDocumentContent(uri: vscode.Uri): string {
		return this.contentMap.get(uri.toString()) || '';
	}

	/** Disposes the change event emitter. */
	public dispose(): void {
		this.changeEmitter.dispose();
		this.contentMap.clear();
	}
}
