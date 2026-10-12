const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// Ensure mock VS Code is active
const vscode = require('./mockVscode.cjs');

// Require built files or services
// Note: RepositoryDetector and SidebarWebviewProvider can be imported from out/
const { RepositoryDetector } = require('../out/services/repositoryDetector.js');
const { SidebarWebviewProvider } = require('../out/providers/sidebarWebviewProvider.js');

test('Repository Detection - 1. Normal Git repository via official VS Code Git API', async () => {
	// Setup workspace folders
	const rootPath = path.resolve('c:/projects/my-repo');
	vscode.workspace.workspaceFolders = [{ uri: { fsPath: rootPath } }];

	const repoStateEmitter = new vscode.EventEmitter();
	const mockRepo = {
		rootUri: { fsPath: rootPath },
		state: {
			HEAD: { name: 'feature/login', commit: 'abc123456789' },
			remotes: [{ name: 'origin', fetchUrl: 'https://github.com/org/my-repo.git' }],
			indexChanges: [{ uri: { fsPath: `${rootPath}/file1.ts` } }],
			workingTreeChanges: [{ uri: { fsPath: `${rootPath}/file2.ts` } }],
			mergeChanges: [],
			onDidChange: repoStateEmitter.event
		},
		ui: {
			selected: true,
			onDidChange: () => ({ dispose: () => {} })
		},
		status: async () => {}
	};

	vscode.extensions.getExtension = (id) => {
		if (id === 'vscode.git') {
			return {
				id: 'vscode.git',
				isActive: true,
				exports: {
					getAPI: (version) => {
						assert.equal(version, 1);
						return {
							state: 'initialized',
							repositories: [mockRepo],
							onDidOpenRepository: () => ({ dispose: () => {} }),
							onDidCloseRepository: () => ({ dispose: () => {} }),
							onDidChangeState: () => ({ dispose: () => {} }),
							getRepository: (uri) => (uri.fsPath === rootPath ? mockRepo : null)
						};
					}
				}
			};
		}
		return undefined;
	};

	const detector = new RepositoryDetector();
	const state = await detector.detectRepositories();

	assert.equal(state.status, 'detected');
	assert.ok(state.activeRepo, 'Active repo should be defined');
	assert.equal(state.activeRepo.repoName, 'org/my-repo');
	assert.equal(state.activeRepo.branch, 'feature/login');
	assert.equal(state.activeRepo.remoteUrl, 'https://github.com/org/my-repo.git');
	assert.equal(state.activeRepo.stagedCount, 1);
	assert.equal(state.activeRepo.uncommittedCount, 1);
	assert.equal(state.activeRepo.isClean, false);
	assert.equal(state.activeRepo.statusSummary, '1 staged • 1 uncommitted');

	detector.dispose();
});

test('Repository Detection - 2. Workspace without a Git repository resolves to "no-repo" without hanging', async () => {
	const rootPath = path.resolve('c:/projects/empty-folder');
	vscode.workspace.workspaceFolders = [{ uri: { fsPath: rootPath } }];

	vscode.extensions.getExtension = (id) => {
		if (id === 'vscode.git') {
			return {
				id: 'vscode.git',
				isActive: true,
				exports: {
					getAPI: () => ({
						state: 'initialized',
						repositories: [],
						onDidOpenRepository: () => ({ dispose: () => {} }),
						onDidCloseRepository: () => ({ dispose: () => {} }),
						onDidChangeState: () => ({ dispose: () => {} }),
						getRepository: () => null
					})
				}
			};
		}
		return undefined;
	};

	const mockGitService = {
		isGitRepository: async () => false,
		getWorkingTreeDiff: async () => ({ hasChanges: false }),
		getStagedDiff: async () => ({ hasChanges: false })
	};

	const detector = new RepositoryDetector(mockGitService);
	const state = await detector.detectRepositories();

	assert.equal(state.status, 'no-repo');
	assert.equal(state.allRepos.length, 0);
	assert.equal(state.activeRepo, undefined);

	detector.dispose();
});

test('Repository Detection - 3. Git extension unavailable falls back safely', async () => {
	const rootPath = path.resolve('c:/projects/cli-repo');
	vscode.workspace.workspaceFolders = [{ uri: { fsPath: rootPath } }];

	// Git extension is missing
	vscode.extensions.getExtension = () => undefined;

	const mockGitService = {
		isGitRepository: async (p) => p === rootPath,
		getCurrentBranch: async () => 'main',
		getRemoteUrl: async () => 'git@github.com:company/cli-repo.git',
		getStagedDiff: async () => ({ hasChanges: false }),
		getWorkingTreeDiff: async () => ({ hasChanges: false })
	};

	const detector = new RepositoryDetector(mockGitService);
	const state = await detector.detectRepositories();

	assert.equal(state.status, 'detected');
	assert.ok(state.activeRepo);
	assert.equal(state.activeRepo.repoName, 'company/cli-repo');
	assert.equal(state.activeRepo.branch, 'main');
	assert.equal(state.activeRepo.isClean, true);

	detector.dispose();
});

test('Repository Detection - 4. Delayed Git extension activation', async () => {
	const rootPath = path.resolve('c:/projects/delayed-repo');
	vscode.workspace.workspaceFolders = [{ uri: { fsPath: rootPath } }];

	let activated = false;
	const mockRepo = {
		rootUri: { fsPath: rootPath },
		state: {
			HEAD: { name: 'dev', commit: '999aaa' },
			remotes: [],
			indexChanges: [],
			workingTreeChanges: [],
			mergeChanges: [],
			onDidChange: () => ({ dispose: () => {} })
		},
		ui: { selected: true, onDidChange: () => ({ dispose: () => {} }) },
		status: async () => {}
	};

	vscode.extensions.getExtension = (id) => {
		if (id === 'vscode.git') {
			return {
				id: 'vscode.git',
				get isActive() {
					return activated;
				},
				activate: async () => {
					activated = true;
				},
				exports: {
					getAPI: () => ({
						state: 'initialized',
						repositories: [mockRepo],
						onDidOpenRepository: () => ({ dispose: () => {} }),
						onDidCloseRepository: () => ({ dispose: () => {} }),
						onDidChangeState: () => ({ dispose: () => {} }),
						getRepository: () => mockRepo
					})
				}
			};
		}
		return undefined;
	};

	const detector = new RepositoryDetector();
	const state = await detector.detectRepositories();

	assert.equal(activated, true, 'Git extension activate() should have been called');
	assert.equal(state.status, 'detected');
	assert.equal(state.activeRepo.branch, 'dev');

	detector.dispose();
});

test('Repository Detection - 5. Nested repositories and multi-root workspaces support selection', async () => {
	const repo1Path = path.resolve('c:/workspace/frontend');
	const repo2Path = path.resolve('c:/workspace/backend');

	vscode.workspace.workspaceFolders = [
		{ uri: { fsPath: repo1Path } },
		{ uri: { fsPath: repo2Path } }
	];

	const makeRepo = (p, branch) => ({
		rootUri: { fsPath: p },
		state: {
			HEAD: { name: branch, commit: '111222' },
			remotes: [{ name: 'origin', fetchUrl: `https://github.com/team/${path.basename(p)}.git` }],
			indexChanges: [],
			workingTreeChanges: [],
			mergeChanges: [],
			onDidChange: () => ({ dispose: () => {} })
		},
		ui: { selected: false, onDidChange: () => ({ dispose: () => {} }) },
		status: async () => {}
	});

	const repo1 = makeRepo(repo1Path, 'main');
	const repo2 = makeRepo(repo2Path, 'develop');

	vscode.extensions.getExtension = () => ({
		id: 'vscode.git',
		isActive: true,
		exports: {
			getAPI: () => ({
				state: 'initialized',
				repositories: [repo1, repo2],
				onDidOpenRepository: () => ({ dispose: () => {} }),
				onDidCloseRepository: () => ({ dispose: () => {} }),
				onDidChangeState: () => ({ dispose: () => {} }),
				getRepository: (uri) => (uri.fsPath === repo1Path ? repo1 : repo2)
			})
		}
	});

	const detector = new RepositoryDetector();
	const state = await detector.detectRepositories();

	assert.equal(state.status, 'detected');
	assert.equal(state.allRepos.length, 2);
	assert.equal(state.activeRepo.repoName, 'team/frontend');

	// Simulate QuickPick selection of the second repo
	vscode.window.showQuickPick = async (items) => items.find((i) => i.repo.id === repo2Path);

	const selected = await detector.selectActiveRepository();
	assert.ok(selected);
	assert.equal(selected.id, repo2Path);
	assert.equal(detector.getActiveRepository().repoName, 'team/backend');
	assert.equal(detector.getActiveRepository().branch, 'develop');

	detector.dispose();
});

test('Repository Detection - 6. Detached HEAD and empty repository handled without crashing', async () => {
	const rootPath = path.resolve('c:/projects/detached-repo');
	vscode.workspace.workspaceFolders = [{ uri: { fsPath: rootPath } }];

	const mockRepo = {
		rootUri: { fsPath: rootPath },
		state: {
			HEAD: { name: undefined, commit: 'abcdef123456789' }, // Detached HEAD
			remotes: [], // No remote
			indexChanges: [],
			workingTreeChanges: [],
			mergeChanges: [],
			onDidChange: () => ({ dispose: () => {} })
		},
		ui: { selected: true, onDidChange: () => ({ dispose: () => {} }) },
		status: async () => {}
	};

	vscode.extensions.getExtension = () => ({
		id: 'vscode.git',
		isActive: true,
		exports: {
			getAPI: () => ({
				state: 'initialized',
				repositories: [mockRepo],
				onDidOpenRepository: () => ({ dispose: () => {} }),
				onDidCloseRepository: () => ({ dispose: () => {} }),
				onDidChangeState: () => ({ dispose: () => {} }),
				getRepository: () => mockRepo
			})
		}
	});

	const detector = new RepositoryDetector();
	const state = await detector.detectRepositories();

	assert.equal(state.status, 'detected');
	assert.equal(state.activeRepo.branch, 'HEAD (detached at abcdef1)');
	assert.equal(state.activeRepo.remoteUrl, undefined);
	assert.equal(state.activeRepo.isClean, true);

	detector.dispose();
});

test('Repository Detection - 7. Dynamic Git state changes update detector and notify listeners', async () => {
	const rootPath = path.resolve('c:/projects/dynamic-repo');
	vscode.workspace.workspaceFolders = [{ uri: { fsPath: rootPath } }];

	let repoStateListener;
	const mockRepo = {
		rootUri: { fsPath: rootPath },
		state: {
			HEAD: { name: 'feature-A', commit: 'aaa' },
			remotes: [],
			indexChanges: [],
			workingTreeChanges: [],
			mergeChanges: [],
			onDidChange: (listener) => {
				repoStateListener = listener;
				return { dispose: () => {} };
			}
		},
		ui: { selected: true, onDidChange: () => ({ dispose: () => {} }) },
		status: async () => {}
	};

	vscode.extensions.getExtension = () => ({
		id: 'vscode.git',
		isActive: true,
		exports: {
			getAPI: () => ({
				state: 'initialized',
				repositories: [mockRepo],
				onDidOpenRepository: () => ({ dispose: () => {} }),
				onDidCloseRepository: () => ({ dispose: () => {} }),
				onDidChangeState: () => ({ dispose: () => {} }),
				getRepository: () => mockRepo
			})
		}
	});

	const detector = new RepositoryDetector();
	await detector.detectRepositories();
	assert.equal(detector.getActiveRepository().branch, 'feature-A');

	// Simulate branch switch in Git repository
	mockRepo.state.HEAD.name = 'feature-B';
	assert.ok(repoStateListener, 'State listener should have been attached');

	let notifiedBranch = '';
	detector.onDidChangeState((s) => {
		if (s.activeRepo) {
			notifiedBranch = s.activeRepo.branch;
		}
	});

	// Fire repo change
	repoStateListener();

	// Wait for async detect
	await new Promise((r) => setTimeout(r, 50));
	assert.equal(notifiedBranch, 'feature-B');

	detector.dispose();
});

test('SidebarWebviewProvider - 8. webviewReady handshake immediately posts detected repository state', async () => {
	const rootPath = path.resolve('c:/projects/handshake-repo');
	vscode.workspace.workspaceFolders = [{ uri: { fsPath: rootPath } }];

	const mockRepo = {
		rootUri: { fsPath: rootPath },
		state: {
			HEAD: { name: 'main', commit: '111' },
			remotes: [{ name: 'origin', fetchUrl: 'https://github.com/owner/handshake-repo.git' }],
			indexChanges: [],
			workingTreeChanges: [],
			mergeChanges: [],
			onDidChange: () => ({ dispose: () => {} })
		},
		ui: { selected: true, onDidChange: () => ({ dispose: () => {} }) },
		status: async () => {}
	};

	vscode.extensions.getExtension = () => ({
		id: 'vscode.git',
		isActive: true,
		exports: {
			getAPI: () => ({
				state: 'initialized',
				repositories: [mockRepo],
				onDidOpenRepository: () => ({ dispose: () => {} }),
				onDidCloseRepository: () => ({ dispose: () => {} }),
				onDidChangeState: () => ({ dispose: () => {} }),
				getRepository: () => mockRepo
			})
		}
	});

	const detector = new RepositoryDetector();
	await detector.detectRepositories();

	const postedMessages = [];
	let webviewMessageHandler;

	const mockWebviewView = {
		description: undefined,
		webview: {
			options: {},
			html: '',
			onDidReceiveMessage: (handler) => {
				webviewMessageHandler = handler;
				return { dispose: () => {} };
			},
			postMessage: async (msg) => {
				postedMessages.push(msg);
				return true;
			}
		}
	};

	const provider = new SidebarWebviewProvider(
		{ fsPath: '/ext' },
		undefined,
		undefined,
		undefined,
		detector
	);

	provider.resolveWebviewView(mockWebviewView);

	// Simulate webview client sending 'webviewReady' handshake
	assert.ok(webviewMessageHandler);
	await webviewMessageHandler({ command: 'webviewReady' });

	// Verify that webview received 'updateRepoState' with resolved state, not stuck on loading!
	const repoStateMsgs = postedMessages.filter((m) => m.type === 'updateRepoState');
	assert.ok(repoStateMsgs.length >= 1, 'Webview should receive updateRepoState on handshake');
	const latestState = repoStateMsgs[repoStateMsgs.length - 1].state;
	assert.equal(latestState.status, 'detected');
	assert.equal(latestState.repoName, 'owner/handshake-repo');
	assert.equal(latestState.branch, 'main');
	assert.equal(latestState.isGitRepo, true);

	provider.dispose();
	detector.dispose();
});
