const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { GitIqMcpServer } = require('../out/mcp/gitIqMcpServer');

test('GitIqMcpServer - Exposes all 6 required tools', () => {
	const server = new GitIqMcpServer();
	const tools = server.getToolDefinitions();

	assert.equal(tools.length, 6);
	const toolNames = tools.map((t) => t.name);
	assert.ok(toolNames.includes('get_repository_info'));
	assert.ok(toolNames.includes('get_git_status'));
	assert.ok(toolNames.includes('get_staged_diff'));
	assert.ok(toolNames.includes('search_commit_history'));
	assert.ok(toolNames.includes('generate_commit_message_suggestion'));
	assert.ok(toolNames.includes('prepare_pull_request_description'));
});

test('GitIqMcpServer - get_repository_info execution on valid repo', async () => {
	const server = new GitIqMcpServer();
	const result = await server.executeTool('get_repository_info', {
		workspacePath: path.resolve(__dirname, '..')
	});

	assert.equal(result.isError, undefined);
	assert.equal(result.content.length, 1);
	const parsed = JSON.parse(result.content[0].text);
	assert.equal(parsed.status, 'SUCCESS');
	assert.ok(parsed.data.repoName);
	assert.ok(parsed.data.currentBranch);
});

test('GitIqMcpServer - get_git_status execution', async () => {
	const server = new GitIqMcpServer();
	const result = await server.executeTool('get_git_status', {
		workspacePath: path.resolve(__dirname, '..')
	});

	assert.equal(result.isError, undefined);
	const parsed = JSON.parse(result.content[0].text);
	assert.equal(parsed.status, 'SUCCESS');
	assert.ok(typeof parsed.data.hasStagedChanges === 'boolean');
});

test('GitIqMcpServer - search_commit_history validates query parameter', async () => {
	const server = new GitIqMcpServer();

	// Missing query returns error
	const errResult = await server.executeTool('search_commit_history', {
		workspacePath: path.resolve(__dirname, '..')
	});
	assert.equal(errResult.isError, true);
	const errParsed = JSON.parse(errResult.content[0].text);
	assert.match(errParsed.error, /query.*required/i);

	// Valid query executes
	const successResult = await server.executeTool('search_commit_history', {
		workspacePath: path.resolve(__dirname, '..'),
		query: 'commit'
	});
	assert.equal(successResult.isError, undefined);
	const parsed = JSON.parse(successResult.content[0].text);
	assert.equal(parsed.tool, 'search_commit_history');
	assert.ok(Array.isArray(parsed.commits));
});

test('GitIqMcpServer - generate_commit_message_suggestion marks result as SUGGESTION_ONLY', async () => {
	const server = new GitIqMcpServer();
	const result = await server.executeTool('generate_commit_message_suggestion', {
		workspacePath: path.resolve(__dirname, '..')
	});

	assert.equal(result.isError, undefined);
	const parsed = JSON.parse(result.content[0].text);
	assert.ok(parsed.status === 'SUGGESTION_ONLY' || parsed.status === 'NO_CHANGES');
	if (parsed.status === 'SUGGESTION_ONLY') {
		assert.equal(parsed.executed, false);
		assert.match(parsed.note, /NOT been committed/);
	}
});

test('GitIqMcpServer - prepare_pull_request_description marks result as proposal', async () => {
	const server = new GitIqMcpServer();
	const result = await server.executeTool('prepare_pull_request_description', {
		workspacePath: path.resolve(__dirname, '..')
	});

	assert.equal(result.isError, undefined);
	const parsed = JSON.parse(result.content[0].text);
	assert.equal(parsed.status, 'SUGGESTION_ONLY');
	assert.equal(parsed.executed, false);
	assert.match(parsed.note, /NOT been created on GitHub/);
	assert.ok(parsed.suggestion.title);
	assert.ok(parsed.suggestion.description);
});

test('GitIqMcpServer - Rejects invalid workspace directory', async () => {
	const server = new GitIqMcpServer();
	const result = await server.executeTool('get_repository_info', {
		workspacePath: 'Z:\\non_existent_folder_xyz_12345'
	});

	assert.equal(result.isError, true);
	const parsed = JSON.parse(result.content[0].text);
	assert.match(parsed.error, /does not exist/);
});

test('GitIqMcpServer - Unknown tool error handling', async () => {
	const server = new GitIqMcpServer();
	const result = await server.executeTool('non_existent_tool', {
		workspacePath: path.resolve(__dirname, '..')
	});

	assert.equal(result.isError, true);
	const parsed = JSON.parse(result.content[0].text);
	assert.match(parsed.error, /Unknown tool/);
});

test('GitIqMcpServer - Handles directory outside a Git repository gracefully', async () => {
	const os = require('node:os');
	const fs = require('node:fs');
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitiq-nongit-'));

	try {
		const server = new GitIqMcpServer();
		const result = await server.executeTool('get_repository_info', {
			workspacePath: tempDir
		});

		assert.equal(result.isError, true);
		const parsed = JSON.parse(result.content[0].text);
		assert.equal(parsed.status, 'ERROR');
		assert.match(parsed.error, /not a Git repository/i);
	} finally {
		fs.rmSync(tempDir, { recursive: true, force: true });
	}
});

test('GitIqMcpServer - Standalone stdio process responds to initialize, tools/list, and tools/call', async () => {
	const { spawn } = require('node:child_process');
	const readline = require('node:readline');

	const serverScript = path.resolve(__dirname, '../out/mcp/server.js');
	const child = spawn(process.execPath, [serverScript], {
		stdio: ['pipe', 'pipe', 'pipe']
	});

	const responses = [];
	const rl = readline.createInterface({ input: child.stdout });

	const waitResponse = (expectedId) => {
		return new Promise((resolve, reject) => {
			const check = () => {
				const found = responses.find((r) => r.id === expectedId);
				if (found) {
					return resolve(found);
				}
				setTimeout(check, 20);
			};
			check();
			setTimeout(() => reject(new Error(`Timeout waiting for response id ${expectedId}`)), 5000);
		});
	};

	rl.on('line', (line) => {
		try {
			const json = JSON.parse(line.trim());
			responses.push(json);
		} catch {
			// ignore non-json log lines
		}
	});

	// 1. Send initialize
	child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }) + '\n');
	const initRes = await waitResponse(1);
	assert.equal(initRes.result.serverInfo.name, 'gitiq-mcp');

	// 2. Send tools/list
	child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n');
	const listRes = await waitResponse(2);
	assert.equal(listRes.result.tools.length, 6);

	// 3. Send tools/call
	child.stdin.write(
		JSON.stringify({
			jsonrpc: '2.0',
			id: 3,
			method: 'tools/call',
			params: {
				name: 'get_repository_info',
				arguments: { workspacePath: path.resolve(__dirname, '..') }
			}
		}) + '\n'
	);
	const callRes = await waitResponse(3);
	assert.ok(callRes.result.content[0].text);
	const parsed = JSON.parse(callRes.result.content[0].text);
	assert.equal(parsed.status, 'SUCCESS');

	child.kill();
});

