import React, {useState, useEffect} from 'react';
import {Text, Box} from 'ink';
import SelectInput from 'ink-select-input';
import {NotionService} from '../notion-service.js';
import {setupNotionClient, extractProjectSummary} from './utils.js';
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

interface ProjectWithMultipleInCharge {
	project: ProjectSummary;
	inChargeUsers: Array<{id: string; name: string}>;
	parentProjects: Array<{id: string; title: string; owner?: string}>;
}

interface SelectItem {
	label: string;
	value: string;
}

export default function FixInCharge({token}: Props) {
	const [result, setResult] = useState<MigrationResult | null>(null);
	const [loading, setLoading] = useState(true);
	const [projectsToFix, setProjectsToFix] = useState<ProjectWithMultipleInCharge[]>([]);
	const [currentProjectIndex, setCurrentProjectIndex] = useState(0);
	const [client, setClient] = useState<import('@notionhq/client').Client | null>(null);
	const [progress, setProgress] = useState<ProgressState>({
		currentProject: 0,
		totalProjects: 0,
		currentProjectName: '',
		phase: 'loading',
		message: 'Initializing "In charge" validation...',
	});

	useEffect(() => {
		findProjectsWithMultipleInCharge();
	}, []);

	const findProjectsWithMultipleInCharge = async () => {
		const {client: notionClient, error} = setupNotionClient(token);
		
		if (!notionClient) {
			setResult({success: false, error});
			setLoading(false);
			return;
		}

		setClient(notionClient);

		try {
			const notionService = new NotionService('dummy');
			notionService.client = notionClient;

			setProgress(prev => ({...prev, message: 'Fetching projects to validate...'}));
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
				message: `Found ${projects.length} project(s) to check`,
			}));
			const problematicProjects: ProjectWithMultipleInCharge[] = [];
			const integrationUserId = '338ba5ec-fba4-45c1-b205-98086fa639a2';
			let projectsWithNoInCharge = 0;

			for (let i = 0; i < projects.length; i++) {
				const project = projects[i];
				const projectSummary = extractProjectSummary(project);
				
				setProgress(prev => ({
					...prev,
					currentProject: i + 1,
					currentProjectName: projectSummary.title,
					message: `Checking "In charge" for: ${projectSummary.title}`,
				}));
				
				const properties = project.properties;
				const inChargeUsers = properties['In charge']?.people || [];

				// Handle projects with no one in charge - automatically assign integration user
				if (inChargeUsers.length === 0) {
					try {
						await notionClient.pages.update({
							page_id: project.id,
							properties: {
								'In charge': {
									people: [{id: integrationUserId}],
								},
							},
						});
						projectsWithNoInCharge++;
					} catch (error) {
						// If we can't update, we'll handle this as a problematic project
						const projectSummary = extractProjectSummary(project);
						problematicProjects.push({
							project: {
								...projectSummary,
								title: `${projectSummary.title} (ERROR: No one in charge, failed to assign integration)`,
							},
							inChargeUsers: [],
							parentProjects: [],
						});
					}
					continue;
				}

				if (inChargeUsers.length > 1) {
					
					// Get parent projects information
					const parentProjects: Array<{id: string; title: string; owner?: string}> = [];
					const projectsRelation = properties['Projects']?.relation || [];
					
					for (const parentRef of projectsRelation) {
						try {
							const parentPage = await notionClient.pages.retrieve({page_id: parentRef.id});
							const parentProps = (parentPage as {properties: Record<string, {title?: Array<{plain_text?: string}>; people?: Array<{id: string; name?: string}>}>}).properties;
							const parentTitle = parentProps['Name']?.title?.[0]?.plain_text || 'Untitled';
							
							const inChargeProperty = parentProps['Owner'];
							let owner = 'Unknown Owner';
							if (inChargeProperty && inChargeProperty.people && inChargeProperty.people.length > 0) {
								owner = inChargeProperty.people[0]?.name || 'Unknown User';
							}
							
							parentProjects.push({
								id: parentRef.id,
								title: parentTitle,
								owner,
							});
						} catch (error) {
							// If we can't retrieve parent, still save the ID
							parentProjects.push({
								id: parentRef.id,
								title: 'Unknown Project',
								owner: 'Unknown Owner',
							});
						}
					}

					problematicProjects.push({
						project: projectSummary,
						inChargeUsers: inChargeUsers.map((user: {id: string; name?: string}) => ({
							id: user.id,
							name: user.name || 'Unknown User',
						})),
						parentProjects,
					});
				}
			}

			setProgress(prev => ({
				...prev,
				phase: 'complete',
				message: `Scanning complete: Found ${problematicProjects.length} project(s) needing fixes`,
			}));
			
			setProjectsToFix(problematicProjects);
			setLoading(false);

			if (problematicProjects.length === 0) {
				const message = projectsWithNoInCharge > 0 
					? `All projects have single person in charge. ${projectsWithNoInCharge} project(s) with no one in charge were automatically assigned to integration user.`
					: 'All projects have single person in charge';
				setResult({success: true, data: {message}});
			}
		} catch (error: unknown) {
			let errorMessage = 'Failed to find projects with multiple "In charge"';
			
			if (error && typeof error === 'object' && 'code' in error && error.code === 'unauthorized') {
				errorMessage = 'Invalid API token or insufficient permissions';
			} else if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
				const code = 'code' in error && typeof error.code === 'string' ? error.code : 'Error';
				errorMessage = `${code}: ${error.message}`;
			}

			setResult({success: false, error: errorMessage});
			setLoading(false);
		}
	};

	const handleUserSelection = async (selectedItem: SelectItem) => {
		const currentProject = projectsToFix[currentProjectIndex];
		if (!currentProject) return;
		
		const selectedUserId = selectedItem.value;
		const otherUsers = currentProject.inChargeUsers.filter(user => user.id !== selectedUserId);

		try {
			// Get current project page to read existing participants
			const projectPage = await client!.pages.retrieve({page_id: currentProject.project.id});
			const currentProps = (projectPage as {properties: Record<string, {people?: Array<{id: string}>}>}).properties;
			const existingParticipants = currentProps['Participants']?.people || [];

			// Combine existing participants with users being moved from "In charge"
			const allParticipants = [
				...existingParticipants,
				...otherUsers.map(user => ({id: user.id}))
			];

			// Update the project
			await client!.pages.update({
				page_id: currentProject.project.id,
				properties: {
					'In charge': {
						people: [{id: selectedUserId}],
					},
					'Participants': {
						people: allParticipants,
					},
				},
			});

			// Move to next project or complete
			if (currentProjectIndex < projectsToFix.length - 1) {
				setCurrentProjectIndex(currentProjectIndex + 1);
			} else {
				setResult({
					success: true,
					data: {message: `Fixed "In charge" for ${projectsToFix.length} project(s)`}
				});
			}
		} catch (error: unknown) {
			let errorMessage = 'Failed to update project';
			
			if (error && typeof error === 'object' && 'code' in error && error.code === 'unauthorized') {
				errorMessage = 'Invalid API token or insufficient permissions';
			} else if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
				const code = 'code' in error && typeof error.code === 'string' ? error.code : 'Error';
				errorMessage = `${code}: ${error.message}`;
			}

			setResult({success: false, error: errorMessage});
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
					<Text color="blue">Finding projects with multiple "In charge" assignments...</Text>
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

	if (result?.success && projectsToFix.length === 0) {
		return (
			<Box flexDirection="column">
				<Text color="green">✓ All projects have single person in charge - no fixes needed</Text>
			</Box>
		);
	}

	if (result?.success) {
		return (
			<Box flexDirection="column">
				<Text color="green">✓ {result.data?.message}</Text>
			</Box>
		);
	}

	if (result && !result.success) {
		return (
			<Box flexDirection="column">
				<Text color="red">Error: {result.error}</Text>
			</Box>
		);
	}

	if (projectsToFix.length === 0) {
		return (
			<Box flexDirection="column">
				<Text color="green">✓ No projects found with multiple "In charge" assignments</Text>
			</Box>
		);
	}

	const currentProject = projectsToFix[currentProjectIndex];
	if (!currentProject) {
		return (
			<Box flexDirection="column">
				<Text color="red">Error: No current project found</Text>
			</Box>
		);
	}
	
	const items: SelectItem[] = currentProject.inChargeUsers.map(user => ({
		label: user.name,
		value: user.id,
	}));

	return (
		<Box flexDirection="column">
			<Text color="blue">Project {currentProjectIndex + 1} of {projectsToFix.length}:</Text>
			<Text color="cyan" bold>{currentProject.project.title}</Text>
			<Text color="gray">{currentProject.project.url}</Text>
			{currentProject.parentProjects.length > 0 && (
				<>
					<Text></Text>
					<Text color="blue">Parent Projects:</Text>
					{currentProject.parentProjects.map((parent, index) => (
						<Text key={index} color="gray">  • {parent.title} (Owner: {parent.owner})</Text>
					))}
				</>
			)}
			<Text></Text>
			<Text color="yellow">This project has {currentProject.inChargeUsers.length} people "In charge".</Text>
			<Text>Please select the ONE person who should remain "In charge":</Text>
			<Text color="gray">(Other users will be moved to "Participants")</Text>
			<Text></Text>
			<SelectInput items={items} onSelect={handleUserSelection} />
		</Box>
	);
}