import React from 'react';
import {Text, Box} from 'ink';
import {Client} from '@notionhq/client';
import {StepResult} from './types.js';

// Notion API Function
async function handleSubtaskConnections(client: Client, projectTaskId: string): Promise<{success: boolean; error?: string; subtasksProcessed?: number}> {
	try {
		console.log(`✓ Processing subtask connections for project ${projectTaskId}`);
		
		// Get the project page to read its "Subtask" relation property
		const projectPage = await client.pages.retrieve({ page_id: projectTaskId });
		if (!projectPage || !('properties' in projectPage)) {
			return { success: false, error: 'Project page not found or invalid response' };
		}

		const projectProps = projectPage.properties;

		// Get subtask IDs from the "Subtask" relation property
		if (!projectProps['Subtask'] || projectProps['Subtask'].type !== 'relation') {
			return { success: false, error: 'Project does not have a valid Subtask relation property' };
		}
		
		const subtaskRelationProperty = projectProps["Subtask"] as any;
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
		await client.pages.update({
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

// Business Logic
export async function executeHandleSubtasksStep(client: Client, taskId: string): Promise<StepResult> {
	console.log('🔄 HandleSubtasksStep: Starting execution');
	
	try {
		console.log('📞 HandleSubtasksStep: Calling handleSubtaskConnections');
		const result = await handleSubtaskConnections(client, taskId);
		console.log('📋 HandleSubtasksStep: Service result:', result);
		
		if (!result.success) {
			console.log('❌ HandleSubtasksStep: Service returned failure');
			return {
				success: false,
				error: result.error || 'Failed to handle subtask connections',
			};
		}

		console.log('✅ HandleSubtasksStep: Success, returning next step');
		return {
			success: true,
			data: {
				subtasksProcessed: result.subtasksProcessed || 0,
			},
			nextStep: 'await-manual-move',
		};
	} catch (error: any) {
		console.error('💥 HandleSubtasksStep: Exception caught:', error);
		return {
			success: false,
			error: `Failed to handle subtask connections: ${error.message || 'Unknown error'}`,
		};
	}
}

// UI Component
interface Props {
	subtasksProcessed?: number;
}

export default function HandleSubtasksStep({subtasksProcessed}: Props) {
	console.log('🖼️ HandleSubtasksStep UI: Component rendered, subtasksProcessed:', subtasksProcessed);
	
	return (
		<Box flexDirection="column">
			<Text>Handling subtask connections...</Text>
			{subtasksProcessed !== undefined && (
				<Text color="gray">Processing {subtasksProcessed} subtask(s)</Text>
			)}
		</Box>
	);
}