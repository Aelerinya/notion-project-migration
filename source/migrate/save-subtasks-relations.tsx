import React, {useState, useEffect} from 'react';
import {Text, Box} from 'ink';
import {NotionService} from '../notion-service.js';
import {setupNotionClient, extractProjectSummary, displayProjectSummary} from './utils.js';
import {MigrationResult, ProjectSummary} from './types.js';

interface Props {
	token?: string;
}

interface ProjectWithSubtasks {
	project: ProjectSummary;
	subtasks: Array<{id: string; title?: string}>;
}

export default function SaveSubtasksRelations({token}: Props) {
	const [result, setResult] = useState<MigrationResult & {data?: ProjectWithSubtasks[]} | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		saveSubtaskRelations();
	}, []);

	const saveSubtaskRelations = async () => {
		const {client, error} = setupNotionClient(token);
		
		if (!client) {
			setResult({success: false, error});
			setLoading(false);
			return;
		}

		try {
			const notionService = new NotionService('dummy');
			notionService.client = client;

			const projectsResult = await notionService.getProjectsByMigrationStatus('Project to migrate');
			
			if (!projectsResult.success) {
				setResult({success: false, error: projectsResult.error});
				setLoading(false);
				return;
			}

			const projects = projectsResult.projects || [];
			const processedProjects: ProjectWithSubtasks[] = [];

			for (const project of projects) {
				const projectSummary = extractProjectSummary(project);
				const properties = project.properties;

				try {
					// Check again that subtask property doesn't have has_more
					const subtaskRelation = properties['Subtask'] as any;
					if (subtaskRelation?.has_more) {
						throw new Error('Project has too many subtasks (pagination limit exceeded). Cannot proceed.');
					}

					// Get current "Subtask" relation
					const subtaskRelations = subtaskRelation?.relation || [];

					if (subtaskRelations.length === 0) {
						// No subtasks, skip but track
						processedProjects.push({
							project: projectSummary,
							subtasks: [],
						});
						continue;
					}

					// Get subtask details and update them
					const subtasks: Array<{id: string; title?: string}> = [];
					
					for (const subtaskRef of subtaskRelations) {
						try {
							const subtaskPage = await client.pages.retrieve({page_id: subtaskRef.id});
							const subtaskProps = (subtaskPage as any).properties;
							const subtaskTitle = subtaskProps.Name?.title?.[0]?.plain_text || 'Untitled';
							
							subtasks.push({
								id: subtaskRef.id,
								title: subtaskTitle,
							});

							// Update subtask's Migration status to "Subtask to relink"
							// and set "Parent projects to transfer" to the project ID
							await client.pages.update({
								page_id: subtaskRef.id,
								properties: {
									'Migration status': {
										select: {
											name: 'Subtask to relink',
										},
									},
									'Parent projects to transfer': {
										rich_text: [
											{
												text: {
													content: project.id,
												},
											},
										],
									},
								},
							});
						} catch (error) {
							// If we can't retrieve/update subtask, still save the ID
							subtasks.push({
								id: subtaskRef.id,
								title: 'Unknown Subtask (error updating)',
							});
						}
					}

					// Create comma-separated list of subtask IDs
					const subtaskIdsList = subtaskRelations.map((subtask: any) => subtask.id).join(', ');

					// Save to "Subtasks to transfer" field
					await client.pages.update({
						page_id: project.id,
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
						},
					});

					processedProjects.push({
						project: projectSummary,
						subtasks,
					});
				} catch (error: any) {
					// Set migration status to Error and continue with other projects
					await client.pages.update({
						page_id: project.id,
						properties: {
							'Migration status': {
								select: {
									name: 'Error',
								},
							},
						},
					});

					// Track the project with error for display
					processedProjects.push({
						project: {
							...projectSummary,
							title: `${projectSummary.title} (ERROR: ${error.message})`,
						},
						subtasks: [],
					});
				}
			}

			setResult({
				success: true,
				data: processedProjects,
			});
		} catch (error: any) {
			let errorMessage = 'Failed to save subtask relations';
			
			if (error?.code === 'unauthorized') {
				errorMessage = 'Invalid API token or insufficient permissions';
			} else if (error?.message) {
				errorMessage = error.message;
			}

			setResult({success: false, error: errorMessage});
		} finally {
			setLoading(false);
		}
	};

	if (loading) {
		return (
			<Box>
				<Text>Saving subtask relations and updating subtask migration status...</Text>
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
				<Text color="yellow">No projects found with Migration status = "Project to migrate"</Text>
			</Box>
		);
	}

	const projectsWithSubtasks = processedProjects.filter(p => p.subtasks.length > 0);
	const projectsWithoutSubtasks = processedProjects.filter(p => p.subtasks.length === 0);
	const totalSubtasks = projectsWithSubtasks.reduce((sum, p) => sum + p.subtasks.length, 0);

	return (
		<Box flexDirection="column">
			<Text color="green">✓ Processed {processedProjects.length} project(s) and {totalSubtasks} subtask(s)</Text>
			<Text></Text>

			{projectsWithSubtasks.length > 0 && (
				<>
					<Text color="blue">Projects with subtask relations saved ({projectsWithSubtasks.length}):</Text>
					{projectsWithSubtasks.map((item, index) => (
						<Box key={index} flexDirection="column" marginLeft={2}>
							<Text>{displayProjectSummary(item.project)}</Text>
							<Text color="gray">  Saved {item.subtasks.length} subtask(s) and set their status to "Subtask to relink":</Text>
							{item.subtasks.map((subtask, subtaskIndex) => (
								<Text key={subtaskIndex} color="gray">    • {subtask.title}</Text>
							))}
						</Box>
					))}
					<Text></Text>
				</>
			)}

			{projectsWithoutSubtasks.length > 0 && (
				<>
					<Text color="gray">Projects with no subtasks ({projectsWithoutSubtasks.length}):</Text>
					{projectsWithoutSubtasks.map((item, index) => (
						<Box key={index} flexDirection="column" marginLeft={2}>
							<Text>{displayProjectSummary(item.project)}</Text>
						</Box>
					))}
					<Text></Text>
				</>
			)}

			<Text color="blue">Summary:</Text>
			<Text>  Projects with subtasks processed: {projectsWithSubtasks.length}</Text>
			<Text>  Projects without subtasks: {projectsWithoutSubtasks.length}</Text>
			<Text>  Total subtasks updated: {totalSubtasks}</Text>
		</Box>
	);
}