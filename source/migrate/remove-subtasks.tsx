import React, {useState, useEffect} from 'react';
import {Text, Box} from 'ink';
import {NotionService} from '../notion-service.js';
import {setupNotionClient, extractProjectSummary, displayProjectSummary} from './utils.js';
import {MigrationResult, ProjectSummary} from './types.js';

interface Props {
	token?: string;
}

interface ProcessedProject {
	project: ProjectSummary;
	subtasksRemoved: number;
}

export default function RemoveSubtasks({token}: Props) {
	const [result, setResult] = useState<MigrationResult & {data?: ProcessedProject[]} | null>(null);
	const [loading, setLoading] = useState(true);

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

			const projectsResult = await notionService.getProjectsByMigrationStatus('Project to migrate');
			
			if (!projectsResult.success) {
				setResult({success: false, error: projectsResult.error});
				setLoading(false);
				return;
			}

			const projects = projectsResult.projects || [];
			const processedProjects: ProcessedProject[] = [];

			for (const project of projects) {
				const projectSummary = extractProjectSummary(project);
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
		return (
			<Box>
				<Text>Removing subtask relations from projects...</Text>
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