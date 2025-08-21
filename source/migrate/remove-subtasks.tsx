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

interface ProcessedProject {
	project: ProjectSummary;
	subtasksRemoved: number;
}

export default function RemoveSubtasks({token}: Props) {
	const [result, setResult] = useState<MigrationResult & {data?: ProcessedProject[]} | null>(null);
	const [loading, setLoading] = useState(true);
	const [progress, setProgress] = useState<ProgressState>({
		currentProject: 0,
		totalProjects: 0,
		currentProjectName: '',
		phase: 'loading',
		message: 'Initializing subtask removal...',
	});

	useEffect(() => {
		removeSubtaskRelations();
	}, []);

	const removeSubtaskRelations = async () => {
		const {client, error} = setupNotionClient(token);
		
		if (!client) {
			setResult({success: false, error});
			setLoading(false);
			return;
		}

		try {
			const notionService = new NotionService('dummy');
			notionService.client = client;

			setProgress(prev => ({...prev, message: 'Fetching projects to process...'}));
			const projectsResult = await notionService.getProjectsByMigrationStatus('Project to migrate');
			
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
			const processedProjects: ProcessedProject[] = [];

			for (let i = 0; i < projects.length; i++) {
				const project = projects[i];
				const projectSummary = extractProjectSummary(project);
				
				setProgress(prev => ({
					...prev,
					currentProject: i + 1,
					currentProjectName: projectSummary.title,
					message: `Removing subtasks from: ${projectSummary.title}`,
				}));
				
				const properties = project.properties;

				// Get current "Subtask" relation count
				const subtaskRelations = properties['Subtask']?.relation || [];
				const subtaskCount = subtaskRelations.length;

				// Clear the "Subtask" relation (set to empty array)
				await client.pages.update({
					page_id: project.id,
					properties: {
						'Subtask': {
							relation: [],
						},
					},
				});

				processedProjects.push({
					project: projectSummary,
					subtasksRemoved: subtaskCount,
				});
			}

			setProgress(prev => ({
				...prev,
				phase: 'complete',
				message: `Subtask removal complete: ${projects.length} project(s) processed`,
			}));
			
			setResult({
				success: true,
				data: processedProjects,
			});
		} catch (error: any) {
			let errorMessage = 'Failed to remove subtask relations';
			
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
					<Text color="blue">Removing subtask relations from projects...</Text>
					<Text></Text>
					<Text color="cyan">Progress: {progress.currentProject}/{progress.totalProjects} projects</Text>
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
				<Text color="yellow">No projects found with Migration status = "Project to migrate"</Text>
			</Box>
		);
	}

	const projectsWithRemovedSubtasks = processedProjects.filter(p => p.subtasksRemoved > 0);
	const projectsWithoutSubtasks = processedProjects.filter(p => p.subtasksRemoved === 0);
	const totalSubtasksRemoved = processedProjects.reduce((sum, p) => sum + p.subtasksRemoved, 0);

	return (
		<Box flexDirection="column">
			<Text color="green">✓ Processed {processedProjects.length} project(s)</Text>
			<Text color="green">✓ Removed {totalSubtasksRemoved} subtask relation(s) total</Text>
			<Text></Text>

			{projectsWithRemovedSubtasks.length > 0 && (
				<>
					<Text color="blue">Projects with subtask relations removed ({projectsWithRemovedSubtasks.length}):</Text>
					{projectsWithRemovedSubtasks.map((item, index) => (
						<Box key={index} flexDirection="column" marginLeft={2}>
							<Text>{displayProjectSummary(item.project)}</Text>
							<Text color="gray">  Removed {item.subtasksRemoved} subtask relation(s)</Text>
						</Box>
					))}
					<Text></Text>
				</>
			)}

			{projectsWithoutSubtasks.length > 0 && (
				<>
					<Text color="gray">Projects that had no subtasks ({projectsWithoutSubtasks.length}):</Text>
					{projectsWithoutSubtasks.map((item, index) => (
						<Box key={index} flexDirection="column" marginLeft={2}>
							<Text>{displayProjectSummary(item.project)}</Text>
						</Box>
					))}
					<Text></Text>
				</>
			)}

			<Text color="blue">Summary:</Text>
			<Text>  Projects with subtasks removed: {projectsWithRemovedSubtasks.length}</Text>
			<Text>  Projects without subtasks: {projectsWithoutSubtasks.length}</Text>
			<Text>  Total subtask relations removed: {totalSubtasksRemoved}</Text>
			<Text></Text>
			<Text color="yellow">ℹ  Projects are now ready for manual move to Projects database</Text>
		</Box>
	);
}