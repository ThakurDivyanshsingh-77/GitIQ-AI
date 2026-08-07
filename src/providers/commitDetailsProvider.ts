import * as vscode from 'vscode';

/**
 * Provides in-memory, read-only documents for Git commit detail previews.
 */
export class CommitDetailsProvider implements vscode.TextDocumentContentProvider, vscode.Disposable {
	public static readonly scheme = 'commitpilot-commit-details';

	private readonly changeEmitter = new vscode.EventEmitter<vscode.Uri>();
	private readonly contentMap = new Map<string, string>();

	/** Signals VS Code when stored document content changes. */
	public readonly onDidChange = this.changeEmitter.event;

	/** Registers this provider for the lifetime of the extension. */
	public register(context: vscode.ExtensionContext): void {
		context.subscriptions.push(
			vscode.workspace.registerTextDocumentContentProvider(CommitDetailsProvider.scheme, this),
			this
		);
	}

	/**
	 * Creates and displays a read-only document for the supplied commit details.
	 */
	public async showDetails(hash: string, detailsContent: string): Promise<void> {
		const shortHash = hash.slice(0, 8);
		const uri = vscode.Uri.from({
			scheme: CommitDetailsProvider.scheme,
			path: `/Commit ${shortHash} - Details`
		});

		this.contentMap.set(uri.toString(), detailsContent);
		this.changeEmitter.fire(uri);

		const document = await vscode.workspace.openTextDocument(uri);
		await vscode.languages.setTextDocumentLanguage(document, 'diff');
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
