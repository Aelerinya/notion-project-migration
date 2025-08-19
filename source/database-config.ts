// Database IDs for the Notion databases
export const DATABASE_IDS = {
	TASKS: 'f22a6d02e2d04c6cae8b20818cedd576',
	PROJECTS: '1b966ef02bab80cc9e51d8a48308b4fe',
} as const;

export type DatabaseType = 'tasks' | 'projects';

export function getDatabaseId(type: DatabaseType): string {
	switch (type) {
		case 'tasks':
			return DATABASE_IDS.TASKS;
		case 'projects':
			return DATABASE_IDS.PROJECTS;
		default:
			throw new Error(`Unknown database type: ${type}`);
	}
}