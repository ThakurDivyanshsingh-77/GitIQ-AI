import * as vscode from 'vscode';

/**
 * Provides in-memory, read-only Markdown documents for Commit History Analytics.
 */
export class HistoryPreviewProvider implements vscode.TextDocumentContentProvider, vscode.Disposable {
	public static readonly scheme = 'commitpilot-history';

	private readonly changeEmitter = new vscode.EventEmitter<vscode.Uri>();
	private readonly contentMap = new Map<string, string>();

	/** Signals VS Code when stored document content changes. */
	public readonly onDidChange = this.changeEmitter.event;

	/** Registers this provider for the lifetime of the extension. */
	public register(context: vscode.ExtensionContext): void {
		context.subscriptions.push(
			vscode.workspace.registerTextDocumentContentProvider(HistoryPreviewProvider.scheme, this),
			this
		);
	}

	/**
	 * Creates and opens a read-only document for the supplied title and markdown content.
	 *
	 * @param documentPath Relative URI path identifier for the document.
	 * @param markdownContent Markdown text string to display.
	 */
	public async showPreview(documentPath: string, markdownContent: string): Promise<void> {
		const uri = vscode.Uri.from({
			scheme: HistoryPreviewProvider.scheme,
			path: `/${documentPath}.md`
		});

		this.contentMap.set(uri.toString(), markdownContent);
		this.changeEmitter.fire(uri);

		const document = await vscode.workspace.openTextDocument(uri);
		await vscode.languages.setTextDocumentLanguage(document, 'markdown');
		await vscode.window.showTextDocument(document, { preview: true });
	}

	/** Returns stored content when VS Code resolves a provider URI. */
	public provideTextDocumentContent(uri: vscode.Uri): string {
		return this.contentMap.get(uri.toString()) || '';
	}

	/** Releases resources when deactivated. */
	public dispose(): void {
		this.changeEmitter.dispose();
		this.contentMap.clear();
	}
}
