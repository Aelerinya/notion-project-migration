import {Client} from '@notionhq/client';
import {getDatabaseId, type DatabaseType, DATABASE_IDS} from './database-config.js';

export interface NotionConnectionResult {
	success: boolean;
	error?: string;
	userInfo?: {
		name?: string;
		email?: string;
	};
}

export interface DatabaseSchemaResult {
	success: boolean;
	error?: string;
	schema?: {
		title: string;
		properties: Array<{
			name: string;
			type: string;
			config?: any;
		}>;
	};
	rawResponse?: any;
}

export interface MigrationTestResult {
	success: boolean;
	error?: string;
	testTaskId?: string;
	testTaskUrl?: string;
	migratedPageId?: string;
	migratedPageUrl?: string;
	steps?: string[];
}

export class NotionService {
	public client: Client | null = null;

	constructor(token: string) {
		this.client = new Client({
			auth: token,
		});
	}

	async listUsers(): Promise<{
		success: boolean;
		error?: string;
		users?: Array<{id: string; name?: string; email?: string}>;
	}> {
		if (!this.client) {
			return {
				success: false,
				error: 'No Notion client initialized',
			};
		}

		try {
			const response = await this.client.users.list({});

			const users = response.results.map((user: any) => ({
				id: user.id,
				name: user.name || 'Unknown',
				email: 'person' in user ? user.person?.email : undefined,
			}));

			return {
				success: true,
				users,
			};
		} catch (error: any) {
			let errorMessage = 'Unknown error occurred';

			if (error?.code === 'unauthorized') {
				errorMessage = 'Invalid API token or insufficient permissions';
			} else if (error?.message) {
				errorMessage = error.message;
			}

			return {
				success: false,
				error: errorMessage,
			};
		}
	}

	async testConnection(): Promise<NotionConnectionResult> {
		if (!this.client) {
			return {
				success: false,
				error: 'No Notion client initialized',
			};
		}

		try {
			const response = await this.client.users.me({});

			return {
				success: true,
				userInfo: {
					name: response.name || 'Unknown',
					email: 'person' in response ? response.person?.email : undefined,
				},
			};
		} catch (error: any) {
			let errorMessage = 'Unknown error occurred';

			if (error?.code === 'unauthorized') {
				errorMessage = 'Invalid API token';
			} else if (error?.message) {
				errorMessage = error.message;
			}

			return {
				success: false,
				error: errorMessage,
			};
		}
	}

	async getDatabaseSchema(
		databaseType: DatabaseType,
	): Promise<DatabaseSchemaResult> {
		if (!this.client) {
			return {
				success: false,
				error: 'No Notion client initialized',
			};
		}

		const databaseId = getDatabaseId(databaseType);

		try {
			const response = await this.client.databases.retrieve({
				database_id: databaseId,
			});

			const properties = Object.entries(response.properties).map(
				([name, property]) => ({
					name,
					type: property.type,
					config: property,
				}),
			);

			const title =
				'title' in response && response.title?.[0]?.plain_text
					? response.title[0].plain_text
					: `${
							databaseType.charAt(0).toUpperCase() + databaseType.slice(1)
					  } Database`;

			return {
				success: true,
				schema: {
					title,
					properties,
				},
				rawResponse: response,
			};
		} catch (error: any) {
			let errorMessage = 'Unknown error occurred';

			if (error?.code === 'unauthorized') {
				errorMessage = 'Invalid API token or insufficient permissions';
			} else if (error?.code === 'object_not_found') {
				errorMessage = `${
					databaseType.charAt(0).toUpperCase() + databaseType.slice(1)
				} database not found or not accessible`;
			} else if (error?.message) {
				errorMessage = error.message;
			}

			return {
				success: false,
				error: errorMessage,
			};
		}
	}

	async getProjectsByMigrationStatus(migrationStatus: string): Promise<{success: boolean; error?: string; projects?: any[]}> {
		if (!this.client) {
			return {
				success: false,
				error: 'No Notion client initialized',
			};
		}

		try {
			const response = await this.client.databases.query({
				database_id: DATABASE_IDS.TASKS,
				filter: {
					property: 'Migration status',
					select: {
						equals: migrationStatus,
					},
				},
			});

			return {
				success: true,
				projects: response.results,
			};
		} catch (error: any) {
			let errorMessage = 'Failed to query projects by migration status';
			
			if (error?.code === 'unauthorized') {
				errorMessage = 'Invalid API token or insufficient permissions';
			} else if (error?.message) {
				errorMessage = `${error.code || 'Error'}: ${error.message}`;
			}

			return {
				success: false,
				error: errorMessage,
			};
		}
	}

	async getSubtasksByMigrationStatus(migrationStatus: string): Promise<{success: boolean; error?: string; subtasks?: any[]}> {
		if (!this.client) {
			return {
				success: false,
				error: 'No Notion client initialized',
			};
		}

		try {
			const response = await this.client.databases.query({
				database_id: DATABASE_IDS.TASKS,
				filter: {
					and: [
						{
							property: 'Migration status',
							select: {
								equals: migrationStatus,
							},
						},
						{
							property: 'Task/project/activity',
							select: {
								equals: 'Task',
							},
						},
					],
				},
			});

			return {
				success: true,
				subtasks: response.results,
			};
		} catch (error: any) {
			let errorMessage = 'Failed to query subtasks by migration status';
			
			if (error?.code === 'unauthorized') {
				errorMessage = 'Invalid API token or insufficient permissions';
			} else if (error?.message) {
				errorMessage = `${error.code || 'Error'}: ${error.message}`;
			}

			return {
				success: false,
				error: errorMessage,
			};
		}
	}

	async getProjectsInProjectsDB(migrationStatus: string): Promise<{success: boolean; error?: string; projects?: any[]}> {
		if (!this.client) {
			return {
				success: false,
				error: 'No Notion client initialized',
			};
		}

		try {
			const response = await this.client.databases.query({
				database_id: DATABASE_IDS.PROJECTS,
				filter: {
					property: 'Migration status',
					select: {
						equals: migrationStatus,
					},
				},
			});

			return {
				success: true,
				projects: response.results,
			};
		} catch (error: any) {
			let errorMessage = 'Failed to query projects in Projects DB by migration status';
			
			if (error?.code === 'unauthorized') {
				errorMessage = 'Invalid API token or insufficient permissions';
			} else if (error?.message) {
				errorMessage = `${error.code || 'Error'}: ${error.message}`;
			}

			return {
				success: false,
				error: errorMessage,
			};
		}
	}
}

export function getNotionToken(providedToken?: string): string | null {
	return providedToken || process.env['NOTION_TOKEN'] || null;
}
