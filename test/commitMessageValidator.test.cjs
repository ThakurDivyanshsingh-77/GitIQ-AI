const test = require('node:test');
const assert = require('node:assert/strict');
const { CommitMessageValidator } = require('../out/services/commitMessageValidator');

test('CommitMessageValidator - Accepts valid Conventional Commit message', () => {
	const validator = new CommitMessageValidator();
	const result = validator.validate('feat(auth): implement token refresh flow');
	assert.equal(result.isValid, true);
	assert.equal(result.sanitized, 'feat(auth): implement token refresh flow');
});

test('CommitMessageValidator - Strips markdown code fences', () => {
	const validator = new CommitMessageValidator();
	const result = validator.validate('```\nfix(parser): resolve null pointer exception\n```');
	assert.equal(result.isValid, true);
	assert.equal(result.sanitized, 'fix(parser): resolve null pointer exception');
});

test('CommitMessageValidator - Strips conversational AI prefixes', () => {
	const validator = new CommitMessageValidator();
	const result = validator.validate('Here is the suggested commit message: docs: update readme with quickstart');
	assert.equal(result.isValid, true);
	assert.equal(result.sanitized, 'docs: update readme with quickstart');
});

test('CommitMessageValidator - Strips surrounding quotes and trailing periods', () => {
	const validator = new CommitMessageValidator();
	const result = validator.validate('"perf(cache): optimize memory usage by 40%."');
	assert.equal(result.isValid, true);
	assert.equal(result.sanitized, 'perf(cache): optimize memory usage by 40%');
});

test('CommitMessageValidator - Rejects non-conventional format', () => {
	const validator = new CommitMessageValidator();
	const result = validator.validate('Updated some stuff in the backend');
	assert.equal(result.isValid, false);
	assert.match(result.reason || '', /Conventional Commit/);
});

test('CommitMessageValidator - Rejects empty string', () => {
	const validator = new CommitMessageValidator();
	const result = validator.validate('   ');
	assert.equal(result.isValid, false);
	assert.match(result.reason || '', /empty/);
});
