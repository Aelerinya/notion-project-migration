import React, {useState, useEffect} from 'react';
import {Text, Box} from 'ink';
import {NotionService} from '../notion-service.js';
import {setupNotionClient, extractProjectSummary, displayProjectSummary} from './utils.js';
import {MigrationResult, ProjectSummary} from './types.js';

interface Props {
	token?: string;
}

interface ProgressState {
	currentProject: number;
	totalProjects: number;
	currentProjectName: string;
	phase: 'loading' | 'processing' | 'complete';
	message: string;
}

interface ProjectWithRestoredSubtasks {
	project: ProjectSummary;
	subtasksRestored: number;
	subtaskTitles: string[];
}

export default function RelinkSubtasks({token}: Props) {
	const [result, setResult] = useState<MigrationResult & {data?: ProjectWithRestoredSubtasks[]} | null>(null);
	const [loading, setLoading] = useState(true);
	const [progress, setProgress] = useState<ProgressState>({
		currentProject: 0,
		totalProjects: 0,
		currentProjectName: '',
		phase: 'loading',
		message: 'Initializing task restoration...',
	});

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

			setProgress(prev => ({...prev, message: 'Fetching projects from Projects database...'}));
			const projectsResult = await notionService.getProjectsInProjectsDB('Project to migrate');
			
			if (!projectsResult.success) {
				setResult({success: false, error: projectsResult.error});
				setLoading(false);
				return;
			}

			const projects = projectsResult.projects || [];
			setProgress(prev => ({
				...prev,
				totalProjects: projects.length,
				phase: 'processing',
				message: `Found ${projects.length} project(s) to process`,
			}));
			const processedProjects: ProjectWithRestoredSubtasks[] = [];

			for (let i = 0; i < projects.length; i++) {
				const project = projects[i];
				const projectSummary = extractProjectSummary(project);
				
				setProgress(prev => ({
					...prev,
					currentProject: i + 1,
					currentProjectName: projectSummary.title,
					message: `Processing project: ${projectSummary.title}`,
				}));
				
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
				
				setProgress(prev => ({
					...prev,
					totalSubtasks: subtaskIds.length,
					message: `Found ${subtaskIds.length} subtask(s) to restore`,
				}));

				if (subtaskIds.length === 0) {
					processedProjects.push({
						project: projectSummary,
						subtasksRestored: 0,
						subtaskTitles: ['No valid subtask IDs found'],
					});
					continue;
				}

				// Skip title fetching and duplicate checking - update the project's Tasks relation directly
				setProgress(prev => ({
					...prev,
					message: `Updating project's Tasks relation with ${subtaskIds.length} task(s)`,
				}));

				const successfulConnections = subtaskIds.length;
				const subtaskTitles = subtaskIds.map(id => `Task ID: ${id.slice(0, 8)}...`);
				
				// Update project's Tasks relation with all tasks at once (no duplicate checking needed for fresh projects)
				await client.pages.update({
					page_id: project.id,
					properties: {
						'Tasks': {
							relation: subtaskIds.map(id => ({ id }))
						},
					},
				});
				
				setProgress(prev => ({
					...prev,
					message: `Successfully restored ${subtaskIds.length} task connection(s)`,
				}));
				

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

			setProgress(prev => ({
				...prev,
				phase: 'complete',
				message: `Subtask restoration complete: ${projects.length} project(s) processed`,
			}));
			
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
		if (progress.phase === 'loading') {
			return (
				<Box>
					<Text>{progress.message}</Text>
				</Box>
			);
		}
		
		if (progress.phase === 'processing') {
			return (
				<Box flexDirection="column">
					<Text color="blue">Restoring task connections (optimized approach)...</Text>
					<Text></Text>
					<Text color="cyan">Project Progress: {progress.currentProject}/{progress.totalProjects}</Text>
					<Text color="gray">Current: {progress.currentProjectName}</Text>
					<Text color="yellow">{progress.message}</Text>
				</Box>
			);
		}
		
		return (
			<Box>
				<Text color="green">{progress.message}</Text>
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
			<Text color="green">✓ Restored {totalSubtasksRestored} task connection(s)</Text>
			<Text></Text>

			{projectsWithRestoredSubtasks.length > 0 && (
				<>
					<Text color="blue">Projects with task connections restored ({projectsWithRestoredSubtasks.length}):</Text>
					{projectsWithRestoredSubtasks.map((item, index) => (
						<Box key={index} flexDirection="column" marginLeft={2}>
							<Text>{displayProjectSummary(item.project)} - Restored {item.subtasksRestored} task connection(s)</Text>
						</Box>
					))}
					<Text></Text>
				</>
			)}

			{projectsWithoutSubtasks.length > 0 && (
				<>
					<Text color="gray">Projects with no task connections ({projectsWithoutSubtasks.length}):</Text>
					{projectsWithoutSubtasks.map((item, index) => (
						<Box key={index} flexDirection="column" marginLeft={2}>
							<Text>{displayProjectSummary(item.project)}</Text>
						</Box>
					))}
					<Text></Text>
				</>
			)}

			<Text color="blue">Summary:</Text>
			<Text>  Projects with tasks restored: {projectsWithRestoredSubtasks.length}</Text>
			<Text>  Projects without tasks: {projectsWithoutSubtasks.length}</Text>
			<Text>  Total task connections restored: {totalSubtasksRestored}</Text>
			<Text></Text>
			<Text color="green">✓ Migration completed! All task connections have been restored.</Text>
		</Box>
	);
}