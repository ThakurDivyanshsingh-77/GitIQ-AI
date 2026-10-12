const mockVscode = require('./mockVscode.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { CodeReviewService } = require('../out/services/codeReviewService');
const { SidebarWebviewProvider } = require('../out/providers/sidebarWebviewProvider');
const { Provider } = require('../out/types/provider');
const {
	ConfigurationError,
	NotGitRepositoryError,
	ProviderAuthenticationError,
	ProviderRateLimitError,
	ProviderTimeoutError
} = require('../out/utils/errors');

function createMockGitService(overrides = {}) {
	return {
		isGitRepository: async () => true,
		getCurrentBranch: async () => 'feature/auth',
		getDefaultBranch: async () => 'main',
		getWorkingTreeDiff: async () => ({
			content: '',
			hasChanges: false,
			originalLength: 0,
			filteredLength: 0
		}),
		getStagedDiff: async () => ({
			content: '',
			hasChanges: false,
			originalLength: 0,
			filteredLength: 0
		}),
		getBranchDiff: async () => '',
		...overrides
	};
}

function createMockSettingsService(overrides = {}) {
	return {
		getConfigurationSnapshot: async () => ({
			provider: Provider.Groq,
			model: 'llama-3.3-70b-versatile',
			apiKey: 'gsk-valid-key',
			temperature: 0.2,
			timeout: 30000,
			...overrides
		})
	};
}

function createMockProviderFactory(providerInstance) {
	return {
		getProvider: () => providerInstance
	};
}

// 1. Working-tree changes
test('CodeReviewService - 1. Detects and prioritizes uncommitted working-tree changes', async () => {
	const workingTreeDiff = [
		'diff --git a/src/auth.ts b/src/auth.ts',
		'--- a/src/auth.ts',
		'+++ b/src/auth.ts',
		'@@ -10,3 +10,4 @@',
		'+const hardcodedSecret = "my-secret-key";'
	].join('\n');

	const stagedDiff = [
		'diff --git a/src/db.ts b/src/db.ts',
		'--- a/src/db.ts',
		'+++ b/src/db.ts',
		'@@ -5,1 +5,2 @@',
		'+export function connect() {}'
	].join('\n');

	const gitService = createMockGitService({
		getWorkingTreeDiff: async () => ({
			content: workingTreeDiff,
			hasChanges: true,
			originalLength: workingTreeDiff.length,
			filteredLength: workingTreeDiff.length
		}),
		getStagedDiff: async () => ({
			content: stagedDiff,
			hasChanges: true,
			originalLength: stagedDiff.length,
			filteredLength: stagedDiff.length
		})
	});

	const service = new CodeReviewService(
		gitService,
		createMockSettingsService(),
		createMockProviderFactory({})
	);

	const target = await service.determineReviewTarget('/fake/repo');
	assert.equal(target.type, 'working-tree');
	assert.ok(target.diff.includes('hardcodedSecret'));
	assert.deepEqual(target.files, ['src/auth.ts']);
	assert.ok(target.targetLabel.includes('Working-Tree Changes'));
});

// 2. Staged changes
test('CodeReviewService - 2. Detects staged changes when no working-tree changes exist', async () => {
	const stagedDiff = [
		'diff --git a/src/config.ts b/src/config.ts',
		'--- a/src/config.ts',
		'+++ b/src/config.ts',
		'@@ -1,2 +1,3 @@',
		'+export const PORT = process.env.PORT || 3000;'
	].join('\n');

	const gitService = createMockGitService({
		getWorkingTreeDiff: async () => ({
			content: '',
			hasChanges: false,
			originalLength: 0,
			filteredLength: 0
		}),
		getStagedDiff: async () => ({
			content: stagedDiff,
			hasChanges: true,
			originalLength: stagedDiff.length,
			filteredLength: stagedDiff.length
		})
	});

	const service = new CodeReviewService(
		gitService,
		createMockSettingsService(),
		createMockProviderFactory({})
	);

	const target = await service.determineReviewTarget('/fake/repo');
	assert.equal(target.type, 'staged');
	assert.deepEqual(target.files, ['src/config.ts']);
	assert.ok(target.targetLabel.includes('Staged Changes'));
});

// 3. No changes available
test('CodeReviewService - 3. Handles no changes available and stops with clear error', async () => {
	const gitService = createMockGitService({
		getWorkingTreeDiff: async () => ({ content: '', hasChanges: false, originalLength: 0, filteredLength: 0 }),
		getStagedDiff: async () => ({ content: '', hasChanges: false, originalLength: 0, filteredLength: 0 }),
		getBranchDiff: async () => '',
		getCurrentBranch: async () => 'main',
		getDefaultBranch: async () => 'main'
	});

	const service = new CodeReviewService(
		gitService,
		createMockSettingsService(),
		createMockProviderFactory({})
	);

	const target = await service.determineReviewTarget('/fake/repo');
	assert.equal(target.type, 'none');

	await assert.rejects(
		() => service.runCodeReview('/fake/repo', target),
		(err) => {
			assert.ok(err instanceof Error);
			assert.match(err.message, /No reviewable changes found/i);
			return true;
		}
	);
});

// 4. Multiple changed files
test('CodeReviewService - 4. Correctly extracts and associates multiple changed files', async () => {
	const multiFileDiff = [
		'diff --git a/src/controllers/auth.ts b/src/controllers/auth.ts',
		'--- a/src/controllers/auth.ts',
		'+++ b/src/controllers/auth.ts',
		'@@ -1,1 +1,2 @@',
		'+// auth change',
		'diff --git a/src/models/user.ts b/src/models/user.ts',
		'--- a/src/models/user.ts',
		'+++ b/src/models/user.ts',
		'@@ -10,1 +10,2 @@',
		'+// user model change',
		'diff --git a/src/routes/api.ts b/src/routes/api.ts',
		'--- a/src/routes/api.ts',
		'+++ b/src/routes/api.ts',
		'@@ -5,1 +5,2 @@',
		'+// api route change'
	].join('\n');

	const service = new CodeReviewService(
		createMockGitService(),
		createMockSettingsService(),
		createMockProviderFactory({})
	);

	const files = service.extractChangedFilesFromDiff(multiFileDiff);
	assert.deepEqual(files, [
		'src/controllers/auth.ts',
		'src/models/user.ts',
		'src/routes/api.ts'
	]);
});

// 5. Large diffs and chunking
test('CodeReviewService - 5. Splits large diffs into manageable chunks under limit', () => {
	const service = new CodeReviewService(
		createMockGitService(),
		createMockSettingsService(),
		createMockProviderFactory({})
	);

	// Create 4 files with 10k characters each (total ~40k chars, > MAX_DIFF_CHUNK_CHARS of 24k)
	const fileA = 'diff --git a/fileA.ts b/fileA.ts\n' + '+'.repeat(10000);
	const fileB = 'diff --git a/fileB.ts b/fileB.ts\n' + '+'.repeat(10000);
	const fileC = 'diff --git a/fileC.ts b/fileC.ts\n' + '+'.repeat(10000);
	const fileD = 'diff --git a/fileD.ts b/fileD.ts\n' + '+'.repeat(10000);
	const largeDiff = [fileA, fileB, fileC, fileD].join('\n');

	const chunks = service.createDiffChunks(largeDiff);
	assert.ok(chunks.length >= 2, `Expected at least 2 chunks, got ${chunks.length}`);

	for (const chunk of chunks) {
		assert.ok(chunk.diff.length <= 26000, `Chunk length ${chunk.diff.length} exceeds threshold`);
		assert.ok(chunk.files.length > 0);
	}
});

// 6. Valid review output (JSON schema validation & sorting)
test('CodeReviewService - 6. Parses valid AI review output into sorted structured findings', async () => {
	const validAiJson = JSON.stringify({
		overallSummary: 'Several security and error handling issues were identified.',
		findings: [
			{
				severity: 'High',
				category: 'Security',
				file: 'src/auth.ts',
				line: 15,
				title: 'Hardcoded secret token detected',
				explanation: 'Sensitive API key is committed directly into the source code.',
				impact: 'Exposes private credential in version control.',
				recommendation: 'Move the secret into environment variables.',
				codeSuggestion: 'const secret = process.env.API_SECRET;',
				confidence: 'Certain'
			},
			{
				severity: 'Critical',
				category: 'Bug',
				file: 'src/parser.ts',
				line: 42,
				endLine: 45,
				title: 'Unhandled null pointer dereference',
				explanation: 'Accessing properties of undefined child node.',
				impact: 'Causes server crash on malformed payloads.',
				recommendation: 'Add null check before property access.',
				confidence: 'Certain'
			},
			{
				severity: 'Low',
				category: 'Maintainability',
				file: 'src/utils.ts',
				line: 8,
				title: 'Unused import statement',
				explanation: 'Imported module is never referenced.',
				impact: 'Minor clutter in bundle.',
				recommendation: 'Remove unused import.',
				confidence: 'Certain'
			}
		]
	});

	const mockProvider = {
		initialize: async () => {},
		generateCommitMessage: async () => ({
			message: { subject: validAiJson }
		})
	};

	const service = new CodeReviewService(
		createMockGitService(),
		createMockSettingsService(),
		createMockProviderFactory(mockProvider)
	);

	const parsed = service.parseReviewResponse(validAiJson, ['src/auth.ts', 'src/parser.ts']);
	assert.equal(parsed.findings.length, 3);

	// Verify sorting and summary calculation
	const summary = service.buildSummary(parsed.findings, 'working-tree', 'Working-Tree Changes', ['src/auth.ts', 'src/parser.ts']);
	assert.equal(summary.totalFindings, 3);
	assert.equal(summary.criticalCount, 1);
	assert.equal(summary.highCount, 1);
	assert.equal(summary.lowCount, 1);
	assert.equal(summary.mediumCount, 0);

	// Markdown report contains findings
	const report = service.formatMarkdownReport({ summary, findings: parsed.findings, timestamp: Date.now() });
	assert.ok(report.includes('🔴 [Critical]'));
	assert.ok(report.includes('🟠 [High]'));
	assert.ok(report.includes('Hardcoded secret token detected'));
});

// 7. Invalid or incomplete AI responses
test('CodeReviewService - 7. Safely handles malformed JSON and conversational AI output', () => {
	const service = new CodeReviewService(
		createMockGitService(),
		createMockSettingsService(),
		createMockProviderFactory({})
	);

	// Conversational preamble with broken JSON
	const malformedResponse = 'Here are my findings:\n```json\n{ "findings": [ { incomplete json...\n```';
	const result1 = service.parseReviewResponse(malformedResponse, ['src/index.ts']);
	assert.ok(Array.isArray(result1.findings));

	// Markdown fallback response
	const markdownResponse = [
		'## Code Review Summary',
		'Detected a performance issue in loop.',
		'',
		'### [High] [Performance] Inefficient array concatenation in loop',
		'File: `src/data.ts:50`',
		'The loop reallocates memory on every iteration.'
	].join('\n');

	const result2 = service.parseReviewResponse(markdownResponse, ['src/data.ts']);
	assert.ok(result2.findings.length >= 1);
	assert.equal(result2.findings[0].severity, 'High');
	assert.equal(result2.findings[0].file, 'src/data.ts');
	assert.equal(result2.findings[0].line, 50);

	// Empty AI response
	const emptyResult = service.parseReviewResponse('', ['src/index.ts']);
	assert.equal(emptyResult.findings.length, 0);
});

// 8. Missing API key / Auth failure
test('CodeReviewService - 8. Propagates ProviderAuthenticationError immediately', async () => {
	const mockProvider = {
		initialize: async () => {
			throw new ProviderAuthenticationError('Gemini API key missing. Configure your key in VS Code Settings.');
		},
		generateCommitMessage: async () => ({ message: { subject: '' } })
	};

	const gitService = createMockGitService({
		getWorkingTreeDiff: async () => ({
			content: 'diff --git a/a.ts b/a.ts\n+const x = 1;',
			hasChanges: true,
			originalLength: 30,
			filteredLength: 30
		})
	});

	const service = new CodeReviewService(
		gitService,
		createMockSettingsService(),
		createMockProviderFactory(mockProvider)
	);

	await assert.rejects(
		() => service.runCodeReview('/fake/repo'),
		(err) => {
			assert.ok(err instanceof ProviderAuthenticationError);
			assert.match(err.message, /Gemini API key missing/i);
			return true;
		}
	);
});

// 9. Provider/API failure and timeout
test('CodeReviewService - 9. Propagates ProviderTimeoutError and ProviderRateLimitError directly', async () => {
	// Timeout test
	const timeoutProvider = {
		initialize: async () => {},
		generateCommitMessage: async () => {
			throw new ProviderTimeoutError('Groq API request timed out after 30000ms.');
		}
	};

	const gitService = createMockGitService({
		getWorkingTreeDiff: async () => ({
			content: 'diff --git a/a.ts b/a.ts\n+const x = 1;',
			hasChanges: true,
			originalLength: 30,
			filteredLength: 30
		})
	});

	const timeoutService = new CodeReviewService(
		gitService,
		createMockSettingsService(),
		createMockProviderFactory(timeoutProvider)
	);

	await assert.rejects(
		() => timeoutService.runCodeReview('/fake/repo'),
		(err) => {
			assert.ok(err instanceof ProviderTimeoutError);
			assert.match(err.message, /timed out/i);
			return true;
		}
	);

	// Rate limit test
	const rateLimitProvider = {
		initialize: async () => {},
		generateCommitMessage: async () => {
			throw new ProviderRateLimitError('Rate limit exceeded. Please wait 60s.');
		}
	};

	const rateLimitService = new CodeReviewService(
		gitService,
		createMockSettingsService(),
		createMockProviderFactory(rateLimitProvider)
	);

	await assert.rejects(
		() => rateLimitService.runCodeReview('/fake/repo'),
		(err) => {
			assert.ok(err instanceof ProviderRateLimitError);
			assert.match(err.message, /Rate limit exceeded/i);
			return true;
		}
	);
});

// 10. File navigation and invalid line numbers
test('CodeReviewService & Sidebar - 10. openFileAtLine clamps invalid line numbers safely', async () => {
	let openedUri = null;
	let revealedLine = null;

	mockVscode.workspace.workspaceFolders = [{ uri: { fsPath: '/test/workspace' } }];
	mockVscode.workspace.openTextDocument = async (uri) => {
		openedUri = uri;
		return {
			uri,
			lineCount: 50 // document has 50 lines (0 to 49)
		};
	};

	mockVscode.window.showTextDocument = async () => ({
		revealRange: (range) => {
			revealedLine = range.start.line;
		}
	});

	const sidebar = new SidebarWebviewProvider({ fsPath: '/test' }, createMockGitService(), createMockSettingsService());

	// Test line 25 (valid line -> 0-indexed 24)
	await sidebar.openFileAtLine('src/auth.ts', 25);
	assert.ok(openedUri);
	assert.equal(revealedLine, 24);

	// Test line 0 (invalid line -> clamped to line 0)
	await sidebar.openFileAtLine('src/auth.ts', 0);
	assert.equal(revealedLine, 0);

	// Test line -5 (negative line -> clamped to line 0)
	await sidebar.openFileAtLine('src/auth.ts', -5);
	assert.equal(revealedLine, 0);

	// Test line 9999 (exceeds lineCount 50 -> clamped to 49)
	await sidebar.openFileAtLine('src/auth.ts', 9999);
	assert.equal(revealedLine, 49);
});
