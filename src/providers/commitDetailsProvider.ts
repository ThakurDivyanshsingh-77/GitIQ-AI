import * as vscode from 'vscode';

/**
 * Provides in-memory, read-only Virtual Document text for viewing full commit details and diff statistics.
 */
export class CommitDetailsProvider implements vscode.TextDocumentContentProvider, vscode.Disposable {
	public static readonly scheme = 'gitiq-commit-details';

	private readonly changeEmitter = new vscode.EventEmitter<vscode.Uri>();
	private readonly detailsMap = new Map<string, string>();

	/** Signals VS Code when stored document content changes. */
	public readonly onDidChange = this.changeEmitter.event;

	/** Registers this provider for the lifetime of the extension. */
	public register(context: vscode.ExtensionContext): void {
		context.subscriptions.push(
			vscode.workspace.registerTextDocumentContentProvider(CommitDetailsProvider.scheme, this),
			this
		);
	}

	public async showDetails(hash: string, fullOutput: string): Promise<void> {
		await this.showCommitDetails(hash, fullOutput);
	}

	/**
	 * Displays commit details in a read-only document editor.
	 */
	public async showCommitDetails(hash: string, fullOutput: string): Promise<void> {
		const uri = vscode.Uri.from({
			scheme: CommitDetailsProvider.scheme,
			path: `/GitIQ - Commit ${hash.slice(0, 7)}.git`
		});

		this.detailsMap.set(uri.toString(), fullOutput);
		this.changeEmitter.fire(uri);

		const document = await vscode.workspace.openTextDocument(uri);
		await vscode.languages.setTextDocumentLanguage(document, 'diff');
		await vscode.window.showTextDocument(document, { preview: true });
	}

	/** Returns stored content when VS Code resolves provider URI. */
	public provideTextDocumentContent(uri: vscode.Uri): string {
		return this.detailsMap.get(uri.toString()) || '';
	}

	/** Disposes the change event emitter. */
	public dispose(): void {
		this.changeEmitter.dispose();
		this.detailsMap.clear();
	}
}
