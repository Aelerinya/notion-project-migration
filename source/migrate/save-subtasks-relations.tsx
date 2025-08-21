import React, {useState, useEffect} from 'react';
import {Text, Box} from 'ink';
import {NotionService} from '../notion-service.js';
import {setupNotionClient, extractProjectSummary, displayProjectSummary, getAllRelationIds} from './utils.js';
import {MigrationResult, ProjectSummary} from './types.js';

interface Props {
	token?: string;
}

interface ProjectWithSubtasks {
	project: ProjectSummary;
	subtasks: Array<{id: string; title?: string}>;
}

interface ProgressState {
	currentProject: number;
	totalProjects: number;
	currentProjectName: string;
	currentSubtask: number;
	totalSubtasks: number;
	phase: 'loading' | 'processing' | 'complete';
	message: string;
}

export default function SaveSubtasksRelations({token}: Props) {
	const [result, setResult] = useState<MigrationResult & {data?: ProjectWithSubtasks[]} | null>(null);
	const [progress, setProgress] = useState<ProgressState>({
		currentProject: 0,
		totalProjects: 0,
		currentProjectName: '',
		currentSubtask: 0,
		totalSubtasks: 0,
		phase: 'loading',
		message: 'Initializing...'
	});

	useEffect(() => {
		saveSubtaskRelations();
	}, []);

	const saveSubtaskRelations = async () => {
		const {client, error} = setupNotionClient(token);
		
		if (!client) {
			setResult({success: false, error});
			setProgress(prev => ({...prev, phase: 'complete', message: 'Error: ' + error}));
			return;
		}

		try {
			setProgress(prev => ({...prev, message: 'Fetching projects to migrate...'}));
			
			const notionService = new NotionService('dummy');
			notionService.client = client;

			const projectsResult = await notionService.getProjectsByMigrationStatus('Project to migrate');
			
			if (!projectsResult.success) {
				setResult({success: false, error: projectsResult.error});
				setProgress(prev => ({...prev, phase: 'complete', message: 'Error: ' + projectsResult.error}));
				return;
			}

			const projects = projectsResult.projects || [];
			const processedProjects: ProjectWithSubtasks[] = [];
			
			setProgress(prev => ({
				...prev,
				phase: 'processing',
				totalProjects: projects.length,
				message: `Found ${projects.length} project(s) to process`
			}));

			for (let i = 0; i < projects.length; i++) {
				const project = projects[i];
				const projectSummary = extractProjectSummary(project);

				setProgress(prev => ({
					...prev,
					currentProject: i + 1,
					currentProjectName: projectSummary.title,
					currentSubtask: 0,
					totalSubtasks: 0,
					message: `Processing project: ${projectSummary.title}`
				}));

				try {
					// Get ALL subtask relations using pagination if needed
					setProgress(prev => ({...prev, message: `Retrieving subtasks for: ${projectSummary.title}`}));
					const subtaskResult = await getAllRelationIds(client, project.id, 'Subtask');
					if (!subtaskResult.success) {
						throw new Error(`Failed to retrieve subtasks: ${subtaskResult.error}`);
					}
					
					const subtaskIds = subtaskResult.relationIds;

					if (subtaskIds.length === 0) {
						setProgress(prev => ({...prev, message: `No subtasks found for: ${projectSummary.title}`}));
						// No subtasks, skip but track
						processedProjects.push({
							project: projectSummary,
							subtasks: [],
						});
						continue;
					}

					setProgress(prev => ({
						...prev,
						totalSubtasks: subtaskIds.length,
						message: `Found ${subtaskIds.length} subtask(s) for: ${projectSummary.title}`
					}));

					// Get subtask details and update them
					const subtasks: Array<{id: string; title?: string}> = [];
					
					for (let j = 0; j < subtaskIds.length; j++) {
						const subtaskId = subtaskIds[j];
						
						// Skip if subtaskId is undefined (shouldn't happen but type safety)
						if (!subtaskId) {
							continue;
						}
						
						setProgress(prev => ({
							...prev,
							currentSubtask: j + 1,
							message: `Processing subtask ${j + 1}/${subtaskIds.length} for: ${projectSummary.title}`
						}));
						
						try {
							const subtaskPage = await client.pages.retrieve({page_id: subtaskId});
							const subtaskProps = (subtaskPage as any).properties;
							const subtaskTitle = subtaskProps.Name?.title?.[0]?.plain_text || 'Untitled';
							
							subtasks.push({
								id: subtaskId,
								title: subtaskTitle,
							});

							// Update subtask's Migration status to "Subtask to relink"
							// and set "Parent projects to transfer" to the project ID
							await client.pages.update({
								page_id: subtaskId,
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
								id: subtaskId,
								title: 'Unknown Subtask (error updating)',
							});
						}
					}

					// Create comma-separated list of subtask IDs
					const subtaskIdsList = subtaskIds.join(', ');

					setProgress(prev => ({
						...prev, 
						message: `Saving subtask list for: ${projectSummary.title}`
					}));

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

					setProgress(prev => ({
						...prev, 
						message: `✓ Completed ${projectSummary.title} with ${subtaskIds.length} subtask(s)`
					}));

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

			setProgress(prev => ({
				...prev,
				phase: 'complete',
				message: `✓ Processing complete! ${processedProjects.length} project(s) processed`
			}));

			setResult({
				success: true,
				data: processedProjects,
			});
		} catch (error: unknown) {
			const errorMessage = error instanceof Error ? error.message : 'Failed to save subtask relations';
			
			setProgress(prev => ({
				...prev,
				phase: 'complete',
				message: `Error: ${errorMessage}`
			}));

			setResult({success: false, error: errorMessage});
		}
	};

	// Show real-time progress during processing
	if (progress.phase !== 'complete') {
		return (
			<Box flexDirection="column">
				<Text color="blue">Save Subtasks Relations</Text>
				<Text></Text>
				
				{progress.totalProjects > 0 && (
					<Text>Progress: {progress.currentProject}/{progress.totalProjects} projects</Text>
				)}
				
				{progress.currentProjectName && (
					<>
						<Text color="cyan">Current: {progress.currentProjectName}</Text>
						{progress.totalSubtasks > 0 && (
							<Text color="gray">  Subtasks: {progress.currentSubtask}/{progress.totalSubtasks}</Text>
						)}
					</>
				)}
				
				<Text></Text>
				<Text>{progress.message}</Text>
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