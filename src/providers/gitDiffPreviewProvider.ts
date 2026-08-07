import * as vscode from 'vscode';

/**
 * Provides in-memory, read-only Virtual Document text for viewing staged Git diff previews.
 */
export class GitDiffPreviewProvider implements vscode.TextDocumentContentProvider, vscode.Disposable {
	public static readonly scheme = 'gitiq-git-diff';

	private readonly uri = vscode.Uri.from({
		scheme: GitDiffPreviewProvider.scheme,
		path: '/GitIQ - Git Diff.patch'
	});

	private readonly changeEmitter = new vscode.EventEmitter<vscode.Uri>();
	private diffContent = '';

	/** Signals VS Code when stored document content changes. */
	public readonly onDidChange = this.changeEmitter.event;

	/** Registers this provider for the lifetime of the extension. */
	public register(context: vscode.ExtensionContext): void {
		context.subscriptions.push(
			vscode.workspace.registerTextDocumentContentProvider(GitDiffPreviewProvider.scheme, this),
			this
		);
	}

	public async showPreview(stagedDiff: string): Promise<void> {
		await this.showDiffPreview(stagedDiff);
	}

	/**
	 * Updates internal stored diff content, notifies VS Code of document updates, and reveals
	 * the diff preview in a side-by-side or dedicated editor tab.
	 */
	public async showDiffPreview(stagedDiff: string): Promise<void> {
		this.diffContent = stagedDiff;
		this.changeEmitter.fire(this.uri);

		const document = await vscode.workspace.openTextDocument(this.uri);
		await vscode.languages.setTextDocumentLanguage(document, 'diff');
		await vscode.window.showTextDocument(document, { preview: true });
	}

	/** Returns stored content when VS Code resolves provider URI. */
	public provideTextDocumentContent(uri: vscode.Uri): string {
		return uri.toString() === this.uri.toString() ? this.diffContent : '';
	}

	/** Disposes the change event emitter. */
	public dispose(): void {
		this.changeEmitter.dispose();
	}
}
