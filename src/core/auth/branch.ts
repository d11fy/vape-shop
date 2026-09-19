/**
 * The active branch is kept in its own cookie rather than on the session row:
 * a manager flipping between two branches on the shop floor should not write to
 * the database on every switch, and the choice is per-device anyway.
 */
export const BRANCH_COOKIE = 'vs_branch';
