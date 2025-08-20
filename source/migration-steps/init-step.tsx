import React from 'react';
import {Text, Box} from 'ink';
import {Client} from '@notionhq/client';
import {DATABASE_IDS} from '../database-config.js';
import {StepResult} from './types.js';

// Notion API Functions
async function validateProjectForMigration(client: Client, projectTaskId: string): Promise<{success: boolean; error?: string}> {
	try {
		console.log(`🔍 Validating project ${projectTaskId} for migration`);
		
		// Get the project page to validate its properties
		const projectPage = await client.pages.retrieve({ page_id: projectTaskId });
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

async function createTestTask(client: Client): Promise<{success: boolean; error?: string; taskId?: string; taskUrl?: string; subtaskId?: string; subtaskUrl?: string}> {
	try {
		const testTask = await client.pages.create({
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
		const subtask = await client.pages.create({
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
		const validation = await validateProjectForMigration(client, testTask.id);
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

// Business Logic
export async function executeInitStep(client: Client): Promise<StepResult> {
	try {
		const result = await createTestTask(client);
		
		if (!result.success) {
			return {
				success: false,
				error: result.error || 'Failed to create test task',
			};
		}

		return {
			success: true,
			data: {
				taskId: result.taskId,
				taskUrl: result.taskUrl,
				subtaskId: result.subtaskId,
				subtaskUrl: result.subtaskUrl,
			},
			nextStep: 'created',
		};
	} catch (error: any) {
		return {
			success: false,
			error: `Failed to create test task: ${error.message || 'Unknown error'}`,
		};
	}
}

// UI Component
export default function InitStep() {
	return (
		<Box>
			<Text>Creating test task in Tasks database...</Text>
		</Box>
	);
}