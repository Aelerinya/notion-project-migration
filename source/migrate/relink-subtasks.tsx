import React, {useState, useEffect} from 'react';
import {Text, Box} from 'ink';
import {NotionService} from '../notion-service.js';
import {setupNotionClient, extractProjectSummary, displayProjectSummary} from './utils.js';
import {MigrationResult, ProjectSummary} from './types.js';

interface Props {
	token?: string;
}

interface ProjectWithRestoredSubtasks {
	project: ProjectSummary;
	subtasksRestored: number;
	subtaskTitles: string[];
}

export default function RelinkSubtasks({token}: Props) {
	const [result, setResult] = useState<MigrationResult & {data?: ProjectWithRestoredSubtasks[]} | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		relinkSubtasks();
	}, []);

	const relinkSubtasks = async () => {
		const {client, error} = setupNotionClient(token);
		
		if (!client) {
			setResult({success: false, error});
			setLoading(false);
			return;
		}

		try {
			const notionService = new NotionService('dummy');
			notionService.client = client;

			const projectsResult = await notionService.getProjectsInProjectsDB('Project to migrate');
			
			if (!projectsResult.success) {
				setResult({success: false, error: projectsResult.error});
				setLoading(false);
				return;
			}

			const projects = projectsResult.projects || [];
			const processedProjects: ProjectWithRestoredSubtasks[] = [];

			for (const project of projects) {
				const projectSummary = extractProjectSummary(project);
				const properties = project.properties;

				// Read "Subtasks to transfer" field with stored subtask IDs
				const subtasksToTransferText = properties['Subtasks to transfer']?.rich_text?.[0]?.text?.content;
				
				if (!subtasksToTransferText) {
					// No subtasks to restore
					processedProjects.push({
						project: projectSummary,
						subtasksRestored: 0,
						subtaskTitles: [],
					});
					continue;
				}

				// Parse the comma-separated list of subtask IDs
				const subtaskIds = subtasksToTransferText.split(', ').map((id: string) => id.trim()).filter(Boolean);

				if (subtaskIds.length === 0) {
					processedProjects.push({
						project: projectSummary,
						subtasksRestored: 0,
						subtaskTitles: ['No valid subtask IDs found'],
					});
					continue;
				}

				// Process each subtask to restore connection and get titles
				const subtaskTitles: string[] = [];
				let successfulConnections = 0;

				for (const subtaskId of subtaskIds) {
					try {
						// Get current Projects relations for this subtask
						const currentSubtask = await client.pages.retrieve({ page_id: subtaskId });
						const currentProps = (currentSubtask as any).properties;
						
						const subtaskTitle = currentProps.Name?.title?.[0]?.plain_text || 'Untitled';
						const existingRelations = currentProps.Projects?.relation || [];
						
						// Add the new project ID to Projects relation (avoid duplicates)
						const relationExists = existingRelations.some((rel: any) => rel.id === project.id);
						
						if (!relationExists) {
							await client.pages.update({
								page_id: subtaskId,
								properties: {
									'Projects': {
										relation: [
											...existingRelations,
											{ id: project.id }
										],
									},
								},
							});
							
							subtaskTitles.push(subtaskTitle);
							successfulConnections++;
						} else {
							subtaskTitles.push(`${subtaskTitle} (already connected)`);
							successfulConnections++;
						}
					} catch (subtaskError: any) {
						subtaskTitles.push(`Unknown Subtask (ID: ${subtaskId.slice(0, 8)}... - Error: ${subtaskError.message})`);
					}
				}

				// Clear the transfer field after processing
				// await client.pages.update({
				// 	page_id: project.id,
				// 	properties: {
				// 		'Subtasks to transfer': {
				// 			rich_text: [
				// 				{
				// 					text: {
				// 						content: `Transferred ${successfulConnections} subtask connections on ${new Date().toISOString()}`,
				// 					},
				// 				},
				// 			],
				// 		},
				// 	},
				// });

				processedProjects.push({
					project: projectSummary,
					subtasksRestored: successfulConnections,
					subtaskTitles,
				});
			}

			setResult({
				success: true,
				data: processedProjects,
			});
		} catch (error: any) {
			let errorMessage = 'Failed to relink subtasks';
			
			if (error?.code === 'unauthorized') {
				errorMessage = 'Invalid API token or insufficient permissions';
			} else if (error?.message) {
				errorMessage = `${error.code || 'Error'}: ${error.message}`;
			}

			setResult({success: false, error: errorMessage});
		} finally {
			setLoading(false);
		}
	};

	if (loading) {
		return (
			<Box>
				<Text>Restoring subtask connections to Tasks relation...</Text>
			</Box>
		);
	}

	if (!result?.success) {
		return (
			<Box flexDirection="column">
				<Text color="red">Error: {result?.error}</Text>
			</Box>
		);
	}

	const processedProjects = result.data || [];

	if (processedProjects.length === 0) {
		return (
			<Box flexDirection="column">
				<Text color="yellow">No projects found in Projects database with Migration status = "Project to migrate"</Text>
			</Box>
		);
	}

	const projectsWithRestoredSubtasks = processedProjects.filter(p => p.subtasksRestored > 0);
	const projectsWithoutSubtasks = processedProjects.filter(p => p.subtasksRestored === 0);
	const totalSubtasksRestored = processedProjects.reduce((sum, p) => sum + p.subtasksRestored, 0);

	return (
		<Box flexDirection="column">
			<Text color="green">✓ Processed {processedProjects.length} project(s)</Text>
			<Text color="green">✓ Restored {totalSubtasksRestored} subtask connection(s)</Text>
			<Text></Text>

			{projectsWithRestoredSubtasks.length > 0 && (
				<>
					<Text color="blue">Projects with subtask connections restored ({projectsWithRestoredSubtasks.length}):</Text>
					{projectsWithRestoredSubtasks.map((item, index) => (
						<Box key={index} flexDirection="column" marginLeft={2}>
							<Text>{displayProjectSummary(item.project)}</Text>
							<Text color="gray">  Restored {item.subtasksRestored} subtask connection(s):</Text>
							{item.subtaskTitles.map((title, titleIndex) => (
								<Text key={titleIndex} color="gray">    • {title}</Text>
							))}
						</Box>
					))}
					<Text></Text>
				</>
			)}

			{projectsWithoutSubtasks.length > 0 && (
				<>
					<Text color="gray">Projects with no subtask connections ({projectsWithoutSubtasks.length}):</Text>
					{projectsWithoutSubtasks.map((item, index) => (
						<Box key={index} flexDirection="column" marginLeft={2}>
							<Text>{displayProjectSummary(item.project)}</Text>
							{item.subtaskTitles.length > 0 && (
								<Text color="gray">  {item.subtaskTitles[0]}</Text>
							)}
						</Box>
					))}
					<Text></Text>
				</>
			)}

			<Text color="blue">Summary:</Text>
			<Text>  Projects with subtasks restored: {projectsWithRestoredSubtasks.length}</Text>
			<Text>  Projects without subtasks: {projectsWithoutSubtasks.length}</Text>
			<Text>  Total subtask connections restored: {totalSubtasksRestored}</Text>
			<Text></Text>
			<Text color="green">✓ Migration completed! All subtask connections have been restored.</Text>
		</Box>
	);
}