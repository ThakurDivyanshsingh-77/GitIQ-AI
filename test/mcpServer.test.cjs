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
