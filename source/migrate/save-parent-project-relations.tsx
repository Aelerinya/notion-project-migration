import React, {useState, useEffect} from 'react';
import {Text, Box} from 'ink';
import {NotionService} from '../notion-service.js';
import {setupNotionClient, extractProjectSummary, displayProjectSummary} from './utils.js';
import {MigrationResult, ProjectSummary} from './types.js';

interface Props {
	token?: string;
}

interface ProjectWithParents {
	project: ProjectSummary;
	parentProjects: Array<{id: string; title?: string}>;
}

interface ProgressState {
	currentProject: number;
	totalProjects: number;
	currentProjectName: string;
	currentParent: number;
	totalParents: number;
	phase: 'loading' | 'processing' | 'complete';
	message: string;
}

export default function SaveParentProjectRelations({token}: Props) {
	const [result, setResult] = useState<MigrationResult & {data?: ProjectWithParents[]} | null>(null);
	const [progress, setProgress] = useState<ProgressState>({
		currentProject: 0,
		totalProjects: 0,
		currentProjectName: '',
		currentParent: 0,
		totalParents: 0,
		phase: 'loading',
		message: 'Initializing...'
	});

	useEffect(() => {
		saveParentRelations();
	}, []);

	const saveParentRelations = async () => {
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
			const processedProjects: ProjectWithParents[] = [];
			
			setProgress(prev => ({
				...prev,
				phase: 'processing',
				totalProjects: projects.length,
				message: `Found ${projects.length} project(s) to process`
			}));

			for (let i = 0; i < projects.length; i++) {
				const project = projects[i];
				const projectSummary = extractProjectSummary(project);
				const properties = project.properties;

				setProgress(prev => ({
					...prev,
					currentProject: i + 1,
					currentProjectName: projectSummary.title,
					currentParent: 0,
					totalParents: 0,
					message: `Processing project: ${projectSummary.title}`
				}));

				try {
					// Check if "Parent projects to transfer" is already filled
					setProgress(prev => ({...prev, message: `Checking existing data for: ${projectSummary.title}`}));
					const existingTransferText = properties['Parent projects to transfer']?.rich_text?.[0]?.text?.content;
					if (existingTransferText) {
						throw new Error(`"Parent projects to transfer" already filled: ${existingTransferText}`);
					}

					// Get current "Projects" relation
					setProgress(prev => ({...prev, message: `Reading parent relations for: ${projectSummary.title}`}));
					const projectsRelation = properties['Projects']?.relation || [];

					if (projectsRelation.length === 0) {
						setProgress(prev => ({...prev, message: `No parent projects found for: ${projectSummary.title}`}));
						// No parent projects, skip but track
						processedProjects.push({
							project: projectSummary,
							parentProjects: [],
						});
						continue;
					}

					setProgress(prev => ({
						...prev,
						totalParents: projectsRelation.length,
						message: `Found ${projectsRelation.length} parent project(s) for: ${projectSummary.title}`
					}));

					// Get parent project details for display
					const parentProjects: Array<{id: string; title?: string}> = [];
					
					for (let j = 0; j < projectsRelation.length; j++) {
						const parentRef = projectsRelation[j];
						
						setProgress(prev => ({
							...prev,
							currentParent: j + 1,
							message: `Processing parent ${j + 1}/${projectsRelation.length} for: ${projectSummary.title}`
						}));
						
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

					setProgress(prev => ({
						...prev, 
						message: `Saving parent project list for: ${projectSummary.title}`
					}));

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

					setProgress(prev => ({
						...prev, 
						message: `✓ Completed ${projectSummary.title} with ${projectsRelation.length} parent project(s)`
					}));

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
			const errorMessage = error instanceof Error ? error.message : 'Failed to save parent project relations';
			
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
				<Text color="blue">Save Parent Project Relations</Text>
				<Text></Text>
				
				{progress.totalProjects > 0 && (
					<Text>Progress: {progress.currentProject}/{progress.totalProjects} projects</Text>
				)}
				
				{progress.currentProjectName && (
					<>
						<Text color="cyan">Current: {progress.currentProjectName}</Text>
						{progress.totalParents > 0 && (
							<Text color="gray">  Parents: {progress.currentParent}/{progress.totalParents}</Text>
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