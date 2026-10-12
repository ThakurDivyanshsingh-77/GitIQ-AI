// Mock VS Code API for standalone Node.js unit tests
const Module = require('node:module');

const mockVscode = {
	ConfigurationTarget: {
		Global: 1,
		Workspace: 2,
		WorkspaceFolder: 3
	},
	workspace: {
		workspaceFolders: [],
		getConfiguration: () => ({
			get: () => undefined,
			update: async () => {}
		}),
		onDidChangeWorkspaceFolders: () => ({ dispose: () => {} })
	},
	window: {
		showInformationMessage: async () => undefined,
		showWarningMessage: async () => undefined,
		showErrorMessage: async () => undefined,
		showQuickPick: async () => undefined,
		showInputBox: async () => undefined,
		registerWebviewViewProvider: () => ({ dispose: () => {} })
	},
	commands: {
		registerCommand: () => ({ dispose: () => {} }),
		executeCommand: async () => undefined
	},
	CancellationError: class CancellationError extends Error {
		constructor(message = 'Operation cancelled') {
			super(message);
			this.name = 'CancellationError';
		}
	},
	LanguageModelChatMessage: {
		User: (content) => ({ role: 1, content }),
		Assistant: (content) => ({ role: 2, content })
	},
	CancellationTokenSource: class {
		constructor() {
			this.token = {
				isCancellationRequested: false,
				onCancellationRequested: () => ({ dispose: () => {} })
			};
		}
		dispose() {}
	},
	lm: {
		selectChatModels: async () => []
	}
};

// Inject into require cache
require.cache['vscode'] = {
	id: 'vscode',
	filename: 'vscode',
	loaded: true,
	exports: mockVscode
};

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
	if (request === 'vscode') {
		return 'vscode';
	}
	return originalResolveFilename.call(this, request, parent, isMain, options);
};

module.exports = mockVscode;
