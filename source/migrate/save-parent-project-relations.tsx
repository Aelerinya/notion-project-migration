import React, {useState, useEffect} from 'react';
import {Text, Box} from 'ink';
import {NotionService} from '../notion-service.js';
import {setupNotionClient, extractProjectSummary, displayProjectSummary, formatProjectUrl} from './utils.js';
import {MigrationResult, ProjectSummary} from './types.js';

interface Props {
	token?: string;
}

interface ProjectWithParents {
	project: ProjectSummary;
	parentProjects: Array<{id: string; title?: string}>;
}

export default function SaveParentProjectRelations({token}: Props) {
	const [result, setResult] = useState<MigrationResult & {data?: ProjectWithParents[]} | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		saveParentRelations();
	}, []);

	const saveParentRelations = async () => {
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
			const processedProjects: ProjectWithParents[] = [];

			for (const project of projects) {
				const projectSummary = extractProjectSummary(project);
				const properties = project.properties;

				try {
					// Check if "Parent projects to transfer" is already filled
					const existingTransferText = properties['Parent projects to transfer']?.rich_text?.[0]?.text?.content;
					if (existingTransferText) {
						throw new Error(`"Parent projects to transfer" already filled: ${existingTransferText}`);
					}

					// Get current "Projects" relation
					const projectsRelation = properties['Projects']?.relation || [];

					if (projectsRelation.length === 0) {
						// No parent projects, skip but track
						processedProjects.push({
							project: projectSummary,
							parentProjects: [],
						});
						continue;
					}

					// Get parent project details for display
					const parentProjects: Array<{id: string; title?: string}> = [];
					
					for (const parentRef of projectsRelation) {
						try {
							const parentPage = await client.pages.retrieve({page_id: parentRef.id});
							const parentProps = (parentPage as any).properties;
							const parentTitle = parentProps.Name?.title?.[0]?.plain_text || 'Untitled';
							
							parentProjects.push({
								id: parentRef.id,
								title: parentTitle,
							});
						} catch (error) {
							// If we can't retrieve parent, still save the ID
							parentProjects.push({
								id: parentRef.id,
								title: 'Unknown Project',
							});
						}
					}

					// Create comma-separated list of parent project IDs
					const projectIds = projectsRelation
						.map((parent: any) => parent.id)
						.join(', ');

					// Save to "Parent projects to transfer" field
					await client.pages.update({
						page_id: project.id,
						properties: {
							'Parent projects to transfer': {
								rich_text: [
									{
										text: {
											content: projectIds,
										},
									},
								],
							},
						},
					});

					processedProjects.push({
						project: projectSummary,
						parentProjects,
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
						parentProjects: [],
					});
				}
			}

			setResult({
				success: true,
				data: processedProjects,
			});
		} catch (error: any) {
			let errorMessage = 'Failed to save parent project relations';
			
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
				<Text>Saving parent project relations...</Text>
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

	const projectsWithParents = processedProjects.filter(p => p.parentProjects.length > 0);
	const projectsWithoutParents = processedProjects.filter(p => p.parentProjects.length === 0);

	return (
		<Box flexDirection="column">
			<Text color="green">✓ Processed {processedProjects.length} project(s)</Text>
			<Text></Text>

			{projectsWithParents.length > 0 && (
				<>
					<Text color="blue">Projects with parent relations saved ({projectsWithParents.length}):</Text>
					{projectsWithParents.map((item, index) => (
						<Box key={index} flexDirection="column" marginLeft={2}>
							<Text>{displayProjectSummary(item.project)}</Text>
							<Text color="gray">  Saved {item.parentProjects.length} parent project(s):</Text>
							{item.parentProjects.map((parent, parentIndex) => (
								<Text key={parentIndex} color="gray">    • {parent.title}</Text>
							))}
						</Box>
					))}
					<Text></Text>
				</>
			)}

			{projectsWithoutParents.length > 0 && (
				<>
					<Text color="gray">Projects with no parent relations ({projectsWithoutParents.length}):</Text>
					{projectsWithoutParents.map((item, index) => (
						<Box key={index} flexDirection="column" marginLeft={2}>
							<Text>{displayProjectSummary(item.project)}</Text>
						</Box>
					))}
					<Text></Text>
				</>
			)}

			<Text color="blue">Summary:</Text>
			<Text>  Projects with parents saved: {projectsWithParents.length}</Text>
			<Text>  Projects without parents: {projectsWithoutParents.length}</Text>
		</Box>
	);
}