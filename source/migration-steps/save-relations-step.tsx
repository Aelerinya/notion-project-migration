import React from 'react';
import {Text, Box} from 'ink';
import {Client} from '@notionhq/client';
import {StepResult} from './types.js';

// Notion API Function
async function saveProjectsRelationBeforeMove(client: Client, taskId: string): Promise<{success: boolean; error?: string}> {
	try {
		// Get current task properties to extract Projects relation
		const currentTask = await client.pages.retrieve({ page_id: taskId });
		const currentProps = (currentTask as any).properties;

		// Check if there's a Projects relation to save
		if (currentProps.Projects?.relation && currentProps.Projects.relation.length > 0) {
			const projectIds = currentProps.Projects.relation.map((rel: any) => rel.id);
			const projectLinksText = projectIds.map((id: string) => `https://www.notion.so/${id.replace(/-/g, '')}`).join(', ');

			console.log(`✓ Saving ${projectIds.length} project relation(s) to 'Parent projects to transfer' field`);

			// Save the project links to "Parent projects to transfer" field
			await client.pages.update({
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

// Business Logic
export async function executeSaveRelationsStep(client: Client, taskId: string): Promise<StepResult> {
	console.log('🔄 SaveRelationsStep: Starting execution for taskId:', taskId);
	
	try {
		console.log('📞 SaveRelationsStep: Calling saveProjectsRelationBeforeMove');
		const result = await saveProjectsRelationBeforeMove(client, taskId);
		console.log('📋 SaveRelationsStep: Service returned:', result);
		
		if (!result.success) {
			console.log('❌ SaveRelationsStep: Service returned failure');
			return {
				success: false,
				error: result.error || 'Failed to save projects relation',
			};
		}

		console.log('✅ SaveRelationsStep: Success, returning next step');
		return {
			success: true,
			nextStep: 'handling-subtasks',
		};
	} catch (error: any) {
		console.error('💥 SaveRelationsStep: Exception caught:', error);
		return {
			success: false,
			error: `Failed to save projects relation: ${error.message || 'Unknown error'}`,
		};
	}
}

// UI Component
export default function SaveRelationsStep() {
	return (
		<Box>
			<Text>Saving parent project connections before move...</Text>
		</Box>
	);
}