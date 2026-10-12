import * as vscode from 'vscode';

/**
 * Provides an in-memory, read-only Markdown document for the AI Code Review report.
 */
export class CodeReviewProvider implements vscode.TextDocumentContentProvider, vscode.Disposable {
	public static readonly scheme = 'gitiq-code-review';

	private readonly uri = vscode.Uri.from({
		scheme: CodeReviewProvider.scheme,
		path: '/GitIQ - Code Review.md'
	});

	private readonly changeEmitter = new vscode.EventEmitter<vscode.Uri>();
	private content = '';

	/** Signals VS Code when stored document content changes. */
	public readonly onDidChange = this.changeEmitter.event;

	/** Registers this provider for the lifetime of the extension. */
	public register(context: vscode.ExtensionContext): void {
		context.subscriptions.push(
			vscode.workspace.registerTextDocumentContentProvider(CodeReviewProvider.scheme, this),
			this
		);
	}

	/**
	 * Creates and displays a read-only Markdown document containing the review report.
	 */
	public async showCodeReview(markdown: string): Promise<void> {
		this.content = markdown;
		this.changeEmitter.fire(this.uri);

		const document = await vscode.workspace.openTextDocument(this.uri);
		await vscode.languages.setTextDocumentLanguage(document, 'markdown');
		await vscode.window.showTextDocument(document, { preview: true, viewColumn: vscode.ViewColumn.Beside });
	}

	/** Returns stored content when VS Code resolves the provider URI. */
	public provideTextDocumentContent(uri: vscode.Uri): string {
		return uri.toString() === this.uri.toString() ? this.content : '';
	}

	/** Disposes the change event emitter. */
	public dispose(): void {
		this.changeEmitter.dispose();
	}
}
