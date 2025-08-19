import {Client} from '@notionhq/client';
import {DATABASE_IDS, getDatabaseId, type DatabaseType} from './database-config.js';

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
	private client: Client | null = null;

	constructor(token: string) {
		this.client = new Client({
			auth: token,
		});
	}

	async listUsers(): Promise<{success: boolean; error?: string; users?: Array<{id: string; name?: string; email?: string}>}> {
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

	async getDatabaseSchema(databaseType: DatabaseType): Promise<DatabaseSchemaResult> {
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

			const properties = Object.entries(response.properties).map(([name, property]) => ({
				name,
				type: property.type,
				config: property,
			}));

			const title = 'title' in response && response.title?.[0]?.plain_text 
				? response.title[0].plain_text 
				: `${databaseType.charAt(0).toUpperCase() + databaseType.slice(1)} Database`;

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
				errorMessage = `${databaseType.charAt(0).toUpperCase() + databaseType.slice(1)} database not found or not accessible`;
			} else if (error?.message) {
				errorMessage = error.message;
			}

			return {
				success: false,
				error: errorMessage,
			};
		}
	}

	async createTestTask(): Promise<{success: boolean; error?: string; taskId?: string; taskUrl?: string}> {
		if (!this.client) {
			return {
				success: false,
				error: 'No Notion client initialized',
			};
		}

		try {
			const testTask = await this.client.pages.create({
				parent: {
					database_id: DATABASE_IDS.TASKS,
				},
				properties: {
					'Name': {
						title: [
							{
								text: {
									content: `Test Migration Project - ${new Date().toISOString()}`,
								},
							},
						],
					},
					'Task/project/activity': {
						select: {
							name: 'Project',
						},
					},
					'Status': {
						status: {
							name: 'Done',
						},
					},
					'Duration (h)': {
						number: 10,
					},
					'Cost (k€)': {
						number: 5,
					},
					'Deadline': {
						date: {
							start: '2024-12-31',
						},
					},
					'In charge': {
						people: [
							{
								id: '9494ea4b-765a-4eac-9cc2-39feef9c4bb7',
							},
						],
					},
					'Importance': {
						select: {
							name: '⭐⭐⭐⭐',
						},
					},
					'Team': {
						select: {
							name: 'R&D',
						},
					},
					'Supervisor': {
						people: [
							{
								id: '6d25e541-6b16-41c1-be36-8c2f548f0f36',
							},
						],
					},
					'Comments & updates': {
						rich_text: [
							{
								text: {
									content: 'Test migration project created for database migration testing purposes.',
								},
							},
						],
					},
					'Projects': {
						relation: [
							{
								id: '23f66ef02bab80d7b205d1b31f3aad2e',
							},
						],
					},
				},
			});

			const taskUrl = `https://www.notion.so/${testTask.id.replace(/-/g, '')}`;

			return {
				success: true,
				taskId: testTask.id,
				taskUrl,
			};

		} catch (error: any) {
			let errorMessage = 'Failed to create test task';
			
			if (error?.code === 'unauthorized') {
				errorMessage = 'Invalid API token or insufficient permissions';
			} else if (error?.code === 'object_not_found') {
				errorMessage = 'Tasks database not found or not accessible';
			} else if (error?.message) {
				errorMessage = error.message;
			}

			return {
				success: false,
				error: errorMessage,
			};
		}
	}

	async verifyPageInProjectsDB(pageId: string): Promise<{success: boolean; error?: string; response?: any; pageUrl?: string}> {
		if (!this.client) {
			return {
				success: false,
				error: 'No Notion client initialized',
			};
		}

		try {
			// Check if the page is now in Projects database
			const page = await this.client.pages.retrieve({ page_id: pageId });
			
			const pageUrl = `https://www.notion.so/${pageId.replace(/-/g, '')}`;

			// Check if parent is Projects database - use type assertion for parent access
			const pageParent = (page as any).parent;
			if (pageParent && 'database_id' in pageParent) {
				// Normalize both IDs by removing hyphens for comparison
				const currentDbId = pageParent.database_id.replace(/-/g, '');
				const expectedDbId = DATABASE_IDS.PROJECTS.replace(/-/g, '');
				
				if (currentDbId === expectedDbId) {
					console.log(`✓ Page successfully moved to Projects database`);
					return {
						success: true,
						response: page,
						pageUrl,
					};
				} else {
					console.log(`✗ Page is still in wrong database`);
					return {
						success: false,
						error: `Page is in database ${pageParent.database_id}, expected ${DATABASE_IDS.PROJECTS}`,
					};
				}
			} else {
				console.log('✗ Page parent is not a database');
				return {
					success: false,
					error: 'Page parent is not a database - please ensure page is moved to Projects database',
				};
			}

		} catch (error: any) {
			console.error('Verification error:', error);
			
			let errorMessage = 'Failed to verify page location';
			
			if (error?.code === 'unauthorized') {
				errorMessage = 'Invalid API token or insufficient permissions';
			} else if (error?.code === 'object_not_found') {
				errorMessage = 'Page not found or not accessible';
			} else if (error?.message) {
				errorMessage = `${error.code || 'Error'}: ${error.message}`;
			}

			return {
				success: false,
				error: errorMessage,
			};
		}
	}

	async updatePropertiesForProjectsDB(taskId: string): Promise<{success: boolean; error?: string; response?: any}> {
		if (!this.client) {
			return {
				success: false,
				error: 'No Notion client initialized',
			};
		}

		try {
			// First get the current task properties to extract data for migration
			const currentTask = await this.client.pages.retrieve({ page_id: taskId });
			const currentProps = (currentTask as any).properties;

			// Build the property update object - only for RENAMES and TRANSFORMATIONS
			const updatedProperties: any = {};

			// Status mapping: Done → Completed, Cancelled → Cancelled
			if (currentProps.Status?.status?.name) {
				const currentStatus = currentProps.Status.status.name;
				if (currentStatus === 'Done') {
					updatedProperties.Status = { status: { name: 'Completed' } };
				} else if (currentStatus === 'Cancelled') {
					updatedProperties.Status = { status: { name: 'Cancelled' } };
				}
			}

			// Task/project/activity → Type (rename property)
			if (currentProps['Task/project/activity']?.select?.name) {
				updatedProperties.Type = {
					select: { name: currentProps['Task/project/activity'].select.name }
				};
			}

			// Importance → Impact (rename property, keep star ratings)
			if (currentProps.Importance?.select?.name) {
				updatedProperties.Impact = {
					select: { name: currentProps.Importance.select.name }
				};
			}

			// Comments & updates → Comments (rename property)
			if (currentProps['Comments & updates']?.rich_text) {
				updatedProperties.Comments = {
					rich_text: currentProps['Comments & updates'].rich_text
				};
			}

			// In charge → Owner (only if single person)
			if (currentProps['In charge']?.people && currentProps['In charge'].people.length === 1) {
				updatedProperties.Owner = {
					people: [{ id: currentProps['In charge'].people[0].id }]
				};
			}

			// Deadline → Start and end dates (approximate)
			if (currentProps.Deadline?.date) {
				updatedProperties['Start and end dates (approximate)'] = {
					date: currentProps.Deadline.date
				};
			}

			console.log('✓ Updating properties for Projects DB');

			const updateResponse = await this.client.pages.update({
				page_id: taskId,
				properties: updatedProperties,
			});

			return {
				success: true,
				response: updateResponse,
			};

		} catch (error: any) {
			console.error('Update properties error:', error);
			let errorMessage = 'Failed to update properties';
			
			if (error?.code === 'unauthorized') {
				errorMessage = 'Invalid API token or insufficient permissions';
			} else if (error?.code === 'object_not_found') {
				errorMessage = 'Page not found or not accessible';
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