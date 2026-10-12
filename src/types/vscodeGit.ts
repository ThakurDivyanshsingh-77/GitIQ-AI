import type * as vscode from 'vscode';

/**
 * Type declarations for the official VS Code built-in Git extension API.
 * Sourced from the VS Code git extension public API contract.
 */

export interface GitExtension {
	readonly enabled: boolean;
	getAPI(version: 1): GitAPI;
}

export type API = GitAPI;

export interface GitAPI {
	readonly state: 'uninitialized' | 'initialized';
	readonly onDidChangeState: vscode.Event<'uninitialized' | 'initialized'>;
	readonly repositories: Repository[];
	readonly onDidOpenRepository: vscode.Event<Repository>;
	readonly onDidCloseRepository: vscode.Event<Repository>;
	getRepository(uri: vscode.Uri): Repository | null;
}

export interface Repository {
	readonly rootUri: vscode.Uri;
	readonly state: RepositoryState;
	readonly ui: RepositoryUI;
	status(): Promise<void>;
}

export interface RepositoryUI {
	readonly selected: boolean;
	readonly onDidChange: vscode.Event<void>;
}

export interface RepositoryState {
	readonly HEAD: Branch | undefined;
	readonly refs: Ref[];
	readonly remotes: Remote[];
	readonly submodules: Submodule[];
	readonly rebaseCommit: Commit | undefined;
	readonly mergeChanges: Change[];
	readonly indexChanges: Change[];
	readonly workingTreeChanges: Change[];
	readonly onDidChange: vscode.Event<void>;
}

export enum RefType {
	Head = 0,
	RemoteHead = 1,
	Tag = 2
}

export interface Ref {
	readonly type: RefType;
	readonly name?: string;
	readonly commit?: string;
}

export interface Branch {
	readonly type: RefType;
	readonly name?: string;
	readonly commit?: string;
	readonly upstream?: UpstreamRef;
	readonly ahead?: number;
	readonly behind?: number;
}

export interface UpstreamRef {
	readonly remote: string;
	readonly name: string;
}

export interface Remote {
	readonly name: string;
	readonly fetchUrl?: string;
	readonly pushUrl?: string;
	readonly isReadOnly?: boolean;
}

export interface Change {
	readonly uri: vscode.Uri;
	readonly originalUri: vscode.Uri;
	readonly renameUri?: vscode.Uri;
	readonly status: number;
}

export interface Commit {
	readonly hash: string;
	readonly message: string;
	readonly parents: string[];
	readonly authorDate?: Date;
	readonly commitDate?: Date;
}

export interface Submodule {
	readonly name: string;
	readonly path: string;
	readonly url: string;
}
