import React, {useState, useEffect} from 'react';
import {Text, Box} from 'ink';
import {NotionService} from '../notion-service.js';
import {setupNotionClient, extractProjectSummary, displayProjectSummary} from './utils.js';
import {MigrationResult, ProjectSummary} from './types.js';

interface Props {
	token?: string;
}

interface ProjectWithRestoredParents {
	project: ProjectSummary;
	parentProjectsRestored: number;
	parentProjectTitles: string[];
}

export default function RelinkParentProjects({token}: Props) {
	const [result, setResult] = useState<MigrationResult & {data?: ProjectWithRestoredParents[]} | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		relinkParentProjects();
	}, []);

	const relinkParentProjects = async () => {
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
			const processedProjects: ProjectWithRestoredParents[] = [];

			for (const project of projects) {
				const projectSummary = extractProjectSummary(project);
				const properties = project.properties;

				try {
					// Read "Parent projects to transfer" field
					const transferText = properties['Parent projects to transfer']?.rich_text?.[0]?.text?.content;
					
					if (!transferText) {
						// No parent projects to restore
						processedProjects.push({
							project: projectSummary,
							parentProjectsRestored: 0,
							parentProjectTitles: [],
						});
						continue;
					}

					// Parse comma-separated project IDs from the transfer text
					const parentProjectIds = transferText
						.split(',')
						.map(id => id.trim())
						.filter(id => id.length > 0);

					if (parentProjectIds.length === 0) {
						processedProjects.push({
							project: projectSummary,
							parentProjectsRestored: 0,
							parentProjectTitles: ['No valid parent project IDs found'],
						});
						continue;
					}

					// Get parent project titles for display
					const parentProjectTitles: string[] = [];
					for (const parentId of parentProjectIds) {
						try {
							const parentPage = await client.pages.retrieve({ page_id: parentId });
							const parentProps = (parentPage as any).properties;
							const parentTitle = parentProps.Name?.title?.[0]?.plain_text || 'Untitled';
							parentProjectTitles.push(parentTitle);
						} catch (error) {
							parentProjectTitles.push('Unknown Project (ID: ' + parentId.slice(0, 8) + '...)');
						}
					}

					// Restore connections in "Parent item" relation
					await client.pages.update({
						page_id: project.id,
						properties: {
							'Parent item': {
								relation: parentProjectIds.map((id: string) => ({ id }))
							},
							// Clear the transfer field after restoring connections
							'à transférer (to delete)': {
								rich_text: [
									{
										text: {
											content: `Transferred parent projects: ${parentProjectIds.length} connections restored on ${new Date().toISOString()}`,
										},
									},
								],
							},
						},
					});

					processedProjects.push({
						project: projectSummary,
						parentProjectsRestored: parentProjectIds.length,
						parentProjectTitles,
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
						parentProjectsRestored: 0,
						parentProjectTitles: [],
					});
				}
			}

			setResult({
				success: true,
				data: processedProjects,
			});
		} catch (error: any) {
			let errorMessage = 'Failed to relink parent projects';
			
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
				<Text>Restoring parent project connections...</Text>
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

	const projectsWithRestoredParents = processedProjects.filter(p => p.parentProjectsRestored > 0);
	const projectsWithoutParents = processedProjects.filter(p => p.parentProjectsRestored === 0);
	const totalParentsRestored = processedProjects.reduce((sum, p) => sum + p.parentProjectsRestored, 0);

	return (
		<Box flexDirection="column">
			<Text color="green">✓ Processed {processedProjects.length} project(s)</Text>
			<Text color="green">✓ Restored {totalParentsRestored} parent project connection(s)</Text>
			<Text></Text>

			{projectsWithRestoredParents.length > 0 && (
				<>
					<Text color="blue">Projects with parent connections restored ({projectsWithRestoredParents.length}):</Text>
					{projectsWithRestoredParents.map((item, index) => (
						<Box key={index} flexDirection="column" marginLeft={2}>
							<Text>{displayProjectSummary(item.project)}</Text>
							<Text color="gray">  Restored {item.parentProjectsRestored} parent project connection(s):</Text>
							{item.parentProjectTitles.map((title, titleIndex) => (
								<Text key={titleIndex} color="gray">    • {title}</Text>
							))}
						</Box>
					))}
					<Text></Text>
				</>
			)}

			{projectsWithoutParents.length > 0 && (
				<>
					<Text color="gray">Projects with no parent connections ({projectsWithoutParents.length}):</Text>
					{projectsWithoutParents.map((item, index) => (
						<Box key={index} flexDirection="column" marginLeft={2}>
							<Text>{displayProjectSummary(item.project)}</Text>
							{item.parentProjectTitles.length > 0 && (
								<Text color="gray">  {item.parentProjectTitles[0]}</Text>
							)}
						</Box>
					))}
					<Text></Text>
				</>
			)}

			<Text color="blue">Summary:</Text>
			<Text>  Projects with parents restored: {projectsWithRestoredParents.length}</Text>
			<Text>  Projects without parents: {projectsWithoutParents.length}</Text>
			<Text>  Total parent connections restored: {totalParentsRestored}</Text>
		</Box>
	);
}