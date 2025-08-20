import React, {useState, useEffect} from 'react';
import {Text, Box} from 'ink';
import {NotionService} from '../notion-service.js';
import {setupNotionClient, extractProjectSummary, displayProjectSummary} from './utils.js';
import {MigrationResult, ProjectSummary} from './types.js';

interface Props {
	token?: string;
}

interface UpdatedProject {
	project: ProjectSummary;
	updates: string[];
}

export default function PostMoveUpdate({token}: Props) {
	const [result, setResult] = useState<MigrationResult & {data?: UpdatedProject[]} | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		updateProjectProperties();
	}, []);

	const updateProjectProperties = async () => {
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
			const updatedProjects: UpdatedProject[] = [];

			for (const project of projects) {
				const projectSummary = extractProjectSummary(project);
				const properties = project.properties;
				const updatedProperties: any = {};
				const updates: string[] = [];

				// Status mapping: Done → Completed, Cancelled → Cancelled
				if (properties.Status?.status?.name) {
					const currentStatus = properties.Status.status.name;
					if (currentStatus === 'Done') {
						updatedProperties.Status = { status: { name: 'Completed' } };
						updates.push('Status: Done → Completed');
					} else if (currentStatus === 'Cancelled') {
						updatedProperties.Status = { status: { name: 'Cancelled' } };
						updates.push('Status: Cancelled → Cancelled (no change)');
					}
				}

				// Task/project/activity → Type (rename property)
				if (properties['Task/project/activity']?.select?.name) {
					updatedProperties.Type = {
						select: { name: properties['Task/project/activity'].select.name }
					};
					updates.push(`Type: ${properties['Task/project/activity'].select.name}`);
				}

				// Importance → Impact (rename property, keep star ratings)
				if (properties.Importance?.select?.name) {
					updatedProperties.Impact = {
						select: { name: properties.Importance.select.name }
					};
					updates.push(`Impact: ${properties.Importance.select.name}`);
				}

				// Comments & updates → Comments (rename property)
				// if (properties['Comments & updates']?.rich_text) {
				// 	updatedProperties.Comments = {
				// 		rich_text: properties['Comments & updates'].rich_text
				// 	};
				// 	updates.push('Comments: Copied from Comments & updates');
				// }

				// In charge → Owner (only if single person)
				if (properties['In charge']?.people && properties['In charge'].people.length === 1) {
					updatedProperties.Owner = {
						people: [{ id: properties['In charge'].people[0].id }]
					};
					updates.push(`Owner: ${properties['In charge'].people[0].name || 'Unknown'}`);
				}

				// Deadline → Start and end dates (approximate)
				if (properties.Deadline?.date) {
					updatedProperties['Start and end dates (approximate)'] = {
						date: properties.Deadline.date
					};
					updates.push(`Start and end dates: ${properties.Deadline.date.start || 'Unknown'}`);
				}

				// Only update if there are changes
				if (Object.keys(updatedProperties).length > 0) {
					await client.pages.update({
						page_id: project.id,
						properties: updatedProperties,
					});
				}

				updatedProjects.push({
					project: projectSummary,
					updates: updates.length > 0 ? updates : ['No updates needed'],
				});
			}

			setResult({
				success: true,
				data: updatedProjects,
			});
		} catch (error: any) {
			let errorMessage = 'Failed to update project properties';
			
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
				<Text>Updating project properties for Projects database schema...</Text>
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

	const updatedProjects = result.data || [];

	if (updatedProjects.length === 0) {
		return (
			<Box flexDirection="column">
				<Text color="yellow">No projects found in Projects database with Migration status = "Project to migrate"</Text>
			</Box>
		);
	}

	const projectsWithUpdates = updatedProjects.filter(p => p.updates[0] !== 'No updates needed');
	const projectsWithoutUpdates = updatedProjects.filter(p => p.updates[0] === 'No updates needed');

	return (
		<Box flexDirection="column">
			<Text color="green">✓ Processed {updatedProjects.length} project(s)</Text>
			<Text></Text>

			{projectsWithUpdates.length > 0 && (
				<>
					<Text color="blue">Projects updated ({projectsWithUpdates.length}):</Text>
					{projectsWithUpdates.map((item, index) => (
						<Box key={index} flexDirection="column" marginLeft={2}>
							<Text>{displayProjectSummary(item.project)}</Text>
							<Text color="gray">  Property transformations applied:</Text>
							{item.updates.map((update, updateIndex) => (
								<Text key={updateIndex} color="gray">    • {update}</Text>
							))}
						</Box>
					))}
					<Text></Text>
				</>
			)}

			{projectsWithoutUpdates.length > 0 && (
				<>
					<Text color="gray">Projects with no updates needed ({projectsWithoutUpdates.length}):</Text>
					{projectsWithoutUpdates.map((item, index) => (
						<Box key={index} flexDirection="column" marginLeft={2}>
							<Text>{displayProjectSummary(item.project)}</Text>
						</Box>
					))}
					<Text></Text>
				</>
			)}

			<Text color="blue">Summary:</Text>
			<Text>  Projects updated: {projectsWithUpdates.length}</Text>
			<Text>  Projects with no updates: {projectsWithoutUpdates.length}</Text>
			<Text></Text>
			<Text color="green">✓ Property transformations completed</Text>
			<Text color="yellow">ℹ  Ready to restore parent project and subtask connections</Text>
		</Box>
	);
}