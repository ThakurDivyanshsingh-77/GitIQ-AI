import * as vscode from 'vscode';

/**
 * Provides in-memory, read-only documents for staged-diff previews. This
 * avoids creating temporary files while retaining a descriptive editor title.
 */
export class GitDiffPreviewProvider implements vscode.TextDocumentContentProvider, vscode.Disposable {
	public static readonly scheme = 'commitpilot-git-diff';

	private readonly previewUri = vscode.Uri.from({
		scheme: GitDiffPreviewProvider.scheme,
		path: '/CommitPilot AI - Git Diff Preview'
	});
	private readonly changeEmitter = new vscode.EventEmitter<vscode.Uri>();
	private content = '';

	/** Signals VS Code when the stored preview content changes. */
	public readonly onDidChange = this.changeEmitter.event;

	/** Registers this provider for the lifetime of the extension. */
	public register(context: vscode.ExtensionContext): void {
		context.subscriptions.push(
			vscode.workspace.registerTextDocumentContentProvider(GitDiffPreviewProvider.scheme, this),
			this
		);
	}

	/**
	 * Creates and displays a read-only Diff-language document for the supplied
	 * staged changes. A unique query keeps each preview invocation independent.
	 */
	public async showPreview(diff: string): Promise<void> {
		this.content = diff;
		this.changeEmitter.fire(this.previewUri);

		const document = await vscode.workspace.openTextDocument(this.previewUri);
		await vscode.languages.setTextDocumentLanguage(document, 'diff');
		await vscode.window.showTextDocument(document, { preview: true });
	}

	/** Returns stored preview content when VS Code resolves a provider URI. */
	public provideTextDocumentContent(uri: vscode.Uri): string {
		return uri.toString() === this.previewUri.toString() ? this.content : '';
	}

	/** Releases the change event emitter when the extension is deactivated. */
	public dispose(): void {
		this.changeEmitter.dispose();
	}
}
