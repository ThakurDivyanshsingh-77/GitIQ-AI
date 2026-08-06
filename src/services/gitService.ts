import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** A staged Git diff returned from a successful Git command invocation. */
export interface StagedDiff {
	readonly content: string;
	readonly hasChanges: boolean;
}

/**
 * Encapsulates all local Git process interaction for the extension.
 * Commands supply a workspace path; this service returns a safe boolean
 * instead of exposing Git process errors to the UI layer.
 */
export class GitService {
	/**
	 * Determines whether a directory belongs to a Git working tree.
	 * `execFile` avoids a shell, so the workspace path is never interpolated
	 * into a command string.
	 */
	public async isGitRepository(workspacePath: string): Promise<boolean> {
		try {
			const { stdout } = await execFileAsync(
				'git',
				['rev-parse', '--is-inside-work-tree'],
				{
					cwd: workspacePath,
					windowsHide: true
				}
			);

			return stdout.trim() === 'true';
		} catch {
			// Git returns a non-zero status outside repositories or when unavailable.
			// Both conditions mean this workspace cannot be treated as a Git repository.
			return false;
		}
	}

	/**
	 * Reads the staged changes for a repository without changing repository state.
	 * Errors are allowed to reach the caller so it can present an appropriate
	 * VS Code notification while this service remains independent of the UI.
	 */
	public async getStagedDiff(workspacePath: string): Promise<StagedDiff> {
		const { stdout } = await execFileAsync('git', ['diff', '--cached'], {
			cwd: workspacePath,
			windowsHide: true
		});

		const content = stdout.toString();

		return {
			content,
			hasChanges: content.trim().length > 0
		};
	}
}
