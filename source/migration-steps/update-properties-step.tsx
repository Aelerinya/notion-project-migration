import React from 'react';
import {Text, Box} from 'ink';
import {Client} from '@notionhq/client';
import {StepResult} from './types.js';

// Notion API Functions
async function restoreSubtaskConnections(client: Client, newProjectId: string): Promise<{success: boolean; error?: string; subtasksRestored?: number}> {
	try {
		// Get the moved project to read the "Subtasks to transfer" field
		const movedProject = await client.pages.retrieve({ page_id: newProjectId });
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
				const currentSubtask = await client.pages.retrieve({ page_id: subtaskId });
				const currentProps = (currentSubtask as any).properties;
				
				const existingRelations = currentProps.Projects?.relation || [];
				
				// Add the new project ID to Projects relation (avoid duplicates)
				const relationExists = existingRelations.some((rel: any) => rel.id === newProjectId);
				if (!relationExists) {
					await client.pages.update({
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
		await client.pages.update({
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

async function updatePropertiesForProjectsDB(client: Client, taskId: string): Promise<{success: boolean; error?: string; response?: any}> {
	try {
		// First get the current task properties to extract data for migration
		const currentTask = await client.pages.retrieve({ page_id: taskId });
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

		const updateResponse = await client.pages.update({
			page_id: taskId,
			properties: updatedProperties,
		});

		// After updating properties, restore subtask connections
		const restoreResult = await restoreSubtaskConnections(client, taskId);
		
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

// Business Logic
export async function executeUpdatePropertiesStep(client: Client, taskId: string): Promise<StepResult> {
	try {
		const result = await updatePropertiesForProjectsDB(client, taskId);
		
		if (!result.success) {
			return {
				success: false,
				error: result.error || 'Failed to update properties',
			};
		}

		return {
			success: true,
			data: {
				response: result.response,
			},
			nextStep: 'complete',
		};
	} catch (error: any) {
		return {
			success: false,
			error: `Failed to update properties: ${error.message || 'Unknown error'}`,
		};
	}
}

// UI Component
export default function UpdatePropertiesStep() {
	return (
		<Box>
			<Text>Updating properties for Projects database schema...</Text>
		</Box>
	);
}