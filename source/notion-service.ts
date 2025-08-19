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

	async validateProjectForMigration(projectTaskId: string): Promise<{success: boolean; error?: string}> {
		if (!this.client) {
			return {
				success: false,
				error: 'No Notion client initialized',
			};
		}

		try {
			console.log(`🔍 Validating project ${projectTaskId} for migration`);
			
			// Get the project page to validate its properties
			const projectPage = await this.client.pages.retrieve({ page_id: projectTaskId });
			if (!projectPage || !('properties' in projectPage)) {
				return { success: false, error: 'Project page not found or invalid response' };
			}

			const projectProps = projectPage.properties;

			// Check 1: Verify this is a Project type
			const taskProjectActivity = projectProps['Task/project/activity'];
			if (!taskProjectActivity || taskProjectActivity.type !== 'select' || 
				!taskProjectActivity.select || taskProjectActivity.select.name !== 'Project') {
				return { 
					success: false, 
					error: 'Page is not a Project type. Only pages with Task/project/activity = "Project" can be migrated.' 
				};
			}

			// Check 2: Verify this is not a sub-project (has no parent item)
			const parentItem = projectProps['Parent item'];
			if (parentItem && parentItem.type === 'relation' && parentItem.relation && parentItem.relation.length > 0) {
				return { 
					success: false, 
					error: 'This project has a parent item and appears to be a sub-project. Please migrate the root parent project first.' 
				};
			}

			console.log(`✓ Project validation passed - it's a root-level Project type`);
			return { success: true };

		} catch (error: any) {
			console.error('Project validation error:', error);
			let errorMessage = 'Failed to validate project for migration';
			
			if (error?.code === 'unauthorized') {
				errorMessage = 'Invalid API token or insufficient permissions';
			} else if (error?.code === 'object_not_found') {
				errorMessage = 'Project page not found or not accessible';
			} else if (error?.message) {
				errorMessage = `${error.code || 'Error'}: ${error.message}`;
			}

			return {
				success: false,
				error: errorMessage,
			};
		}
	}

	async handleSubtaskConnections(projectTaskId: string): Promise<{success: boolean; error?: string; subtasksProcessed?: number}> {
		if (!this.client) {
			return {
				success: false,
				error: 'No Notion client initialized',
			};
		}

		try {
			console.log(`✓ Processing subtask connections for project ${projectTaskId}`);
			

			// Get the project page to read its "Subtask" relation property
			const projectPage = await this.client.pages.retrieve({ page_id: projectTaskId });
			if (!projectPage || !('properties' in projectPage)) {
				return { success: false, error: 'Project page not found or invalid response' };
			}

			const projectProps = projectPage.properties;

			// Get subtask IDs from the "Subtask" relation property
			if (!projectProps['Subtask'] || projectProps['Subtask'].type !== 'relation') {
				return { success: false, error: 'Project does not have a valid Subtask relation property' };
			}
			
			const subtaskRelationProperty = projectProps["Subtask"];
			const subtaskRelations = subtaskRelationProperty.relation || [];
			
			// Check if there are more subtasks than what's visible (Notion pagination limit)
			if (subtaskRelationProperty.has_more) {
				return { 
					success: false, 
					error: `Project has too many subtasks (${subtaskRelations.length}+). Migration cannot handle projects with more than ${subtaskRelations.length} subtasks due to Notion API pagination limits. Please reduce the number of subtasks before migrating.` 
				};
			}
			
			console.log(`✓ Found ${subtaskRelations.length} subtask(s) in project's Subtask relation`);

			if (subtaskRelations.length === 0) {
				return { success: true, subtasksProcessed: 0 };
			}

			// Extract the subtask IDs
			const subtaskIds = subtaskRelations.map((rel: any) => rel.id);
			const subtaskIdsList = subtaskIds.join(', ');

			// Store the subtask IDs list on the project's "Subtasks to transfer" field
			// and clear the Subtask relation to prevent auto-moving subtasks
			await this.client.pages.update({
				page_id: projectTaskId,
				properties: {
					'Subtasks to transfer': {
						rich_text: [
							{
								text: {
									content: subtaskIdsList,
								},
							},
						],
					},
					'Subtask': {
						relation: [],
					},
				},
			});

			console.log(`✓ Saved ${subtaskRelations.length} subtask ID(s) to project's 'Subtasks to transfer' field`);
			console.log(`✓ Cleared Subtask relation to prevent auto-moving subtasks during migration`);

			return { 
				success: true, 
				subtasksProcessed: subtaskRelations.length 
			};

		} catch (error: any) {
			console.error('Handle subtask connections error:', error);
			let errorMessage = 'Failed to handle subtask connections';
			
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

	async saveProjectsRelationBeforeMove(taskId: string): Promise<{success: boolean; error?: string}> {
		if (!this.client) {
			return {
				success: false,
				error: 'No Notion client initialized',
			};
		}

		try {
			// Get current task properties to extract Projects relation
			const currentTask = await this.client.pages.retrieve({ page_id: taskId });
			const currentProps = (currentTask as any).properties;

			// Check if there's a Projects relation to save
			if (currentProps.Projects?.relation && currentProps.Projects.relation.length > 0) {
				const projectIds = currentProps.Projects.relation.map((rel: any) => rel.id);
				const projectLinksText = projectIds.map((id: string) => `https://www.notion.so/${id.replace(/-/g, '')}`).join(', ');

				console.log(`✓ Saving ${projectIds.length} project relation(s) to 'Parent projects to transfer' field`);

				// Save the project links to "Parent projects to transfer" field
				await this.client.pages.update({
					page_id: taskId,
					properties: {
						'Parent projects to transfer': {
							rich_text: [
								{
									text: {
										content: `${projectLinksText}`,
									},
								},
							],
						},
					},
				});

				return { success: true };
			} else {
				console.log('ℹ No Projects relation found to save');
				return { success: true };
			}

		} catch (error: any) {
			console.error('Save projects relation error:', error);
			let errorMessage = 'Failed to save projects relation';
			
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

	async createTestTask(): Promise<{success: boolean; error?: string; taskId?: string; taskUrl?: string; subtaskId?: string; subtaskUrl?: string}> {
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

			// Also create a subtask that references this project
			const subtask = await this.client.pages.create({
				parent: {
					database_id: DATABASE_IDS.TASKS,
				},
				properties: {
					'Name': {
						title: [
							{
								text: {
									content: `Subtask of Test Migration Project - ${new Date().toISOString()}`,
								},
							},
						],
					},
					'Task/project/activity': {
						select: {
							name: 'Task',
						},
					},
					'Status': {
						status: {
							name: 'Done',
						},
					},
					'Duration (h)': {
						number: 2,
					},
					'Cost (k€)': {
						number: 0.5,
					},
					'Team': {
						select: {
							name: 'R&D',
						},
					},
					'Comments & updates': {
						rich_text: [
							{
								text: {
									content: 'Test subtask created for migration testing purposes.',
								},
							},
						],
					},
					'Parent item': {
						relation: [
							{
								id: testTask.id, // Reference the main project task
							},
						],
					},
				},
			});

			const taskUrl = `https://www.notion.so/${testTask.id.replace(/-/g, '')}`;
			const subtaskUrl = `https://www.notion.so/${subtask.id.replace(/-/g, '')}`;

			console.log(`✓ Created test project with subtask: ${subtask.id}`);

			// Validate the created project
			const validation = await this.validateProjectForMigration(testTask.id);
			if (!validation.success) {
				return {
					success: false,
					error: `Test project validation failed: ${validation.error}`,
				};
			}

			return {
				success: true,
				taskId: testTask.id,
				taskUrl,
				subtaskId: subtask.id,
				subtaskUrl,
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

			// Restore parent project connections from "Parent projects to transfer"
			if (currentProps['Parent projects to transfer']?.rich_text?.[0]?.text?.content) {
				const transferText = currentProps['Parent projects to transfer'].rich_text[0].text.content;
				
				// Extract project IDs from URLs in the transfer text
				const urlMatches = transferText.match(/https:\/\/www\.notion\.so\/([a-f0-9]{32})/g);
				if (urlMatches) {
					const parentProjectIds = urlMatches.map((url: string) => {
						const id = url.match(/([a-f0-9]{32})$/)?.[1];
						// Convert back to UUID format with hyphens
						return id ? `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}` : null;
					}).filter(Boolean) as string[];

					if (parentProjectIds.length > 0) {
						console.log(`✓ Restoring ${parentProjectIds.length} parent project connection(s)`);
						updatedProperties['Parent item'] = {
							relation: parentProjectIds.map((id: string) => ({ id }))
						};

						// Clear the transfer field after restoring connections
						updatedProperties['à transférer (to delete)'] = {
							rich_text: [
								{
									text: {
										content: `Transferred parent projects: ${parentProjectIds.length} connections restored`,
									},
								},
							],
						};
					}
				}
			}

			console.log('✓ Updating properties for Projects DB');

			const updateResponse = await this.client.pages.update({
				page_id: taskId,
				properties: updatedProperties,
			});

			// After updating properties, restore subtask connections
			const restoreResult = await this.restoreSubtaskConnections(taskId);
			
			if (!restoreResult.success) {
				console.error('Failed to restore subtask connections after property update');
				return {
					success: false,
					error: `Property update succeeded but subtask restoration failed: ${restoreResult.error}`,
				};
			}

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

	async restoreSubtaskConnections(newProjectId: string): Promise<{success: boolean; error?: string; subtasksRestored?: number}> {
		if (!this.client) {
			return {
				success: false,
				error: 'No Notion client initialized',
			};
		}

		try {
			// Get the moved project to read the "Subtasks to transfer" field
			const movedProject = await this.client.pages.retrieve({ page_id: newProjectId });
			const projectProps = (movedProject as any).properties;

			// Check if there's a subtasks list to restore
			const subtasksToTransferText = projectProps['Subtasks to transfer']?.rich_text?.[0]?.text?.content;
			
			if (!subtasksToTransferText) {
				console.log('ℹ No subtasks to restore');
				return { success: true, subtasksRestored: 0 };
			}

			// Parse the comma-separated list of subtask IDs
			const subtaskIds = subtasksToTransferText.split(', ').map((id: string) => id.trim()).filter(Boolean);
			console.log(`✓ Found ${subtaskIds.length} subtask(s) to reconnect to moved project`);

			if (subtaskIds.length === 0) {
				return { success: true, subtasksRestored: 0 };
			}

			// Process each subtask to restore connection
			for (const subtaskId of subtaskIds) {
				try {
					// Get current Projects relations for this subtask
					const currentSubtask = await this.client.pages.retrieve({ page_id: subtaskId });
					const currentProps = (currentSubtask as any).properties;
					
					const existingRelations = currentProps.Projects?.relation || [];
					
					// Add the new project ID to Projects relation (avoid duplicates)
					const relationExists = existingRelations.some((rel: any) => rel.id === newProjectId);
					if (!relationExists) {
						await this.client.pages.update({
							page_id: subtaskId,
							properties: {
								'Projects': {
									relation: [
										...existingRelations,
										{ id: newProjectId }
									],
								},
							},
						});

						console.log(`✓ Restored connection for subtask ${subtaskId} to moved project`);
					} else {
						console.log(`ℹ Subtask ${subtaskId} already connected to project`);
					}
				} catch (subtaskError: any) {
					console.error(`⚠ Failed to restore connection for subtask ${subtaskId}:`, subtaskError.message);
				}
			}

			// Clear the transfer field after processing
			await this.client.pages.update({
				page_id: newProjectId,
				properties: {
					'Subtasks to transfer': {
						rich_text: [
							{
								text: {
									content: `Transferred ${subtaskIds.length} subtask connections on ${new Date().toISOString()}`,
								},
							},
						],
					},
				},
			});

			return { 
				success: true, 
				subtasksRestored: subtaskIds.length 
			};

		} catch (error: any) {
			console.error('Restore subtask connections error:', error);
			let errorMessage = 'Failed to restore subtask connections';
			
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