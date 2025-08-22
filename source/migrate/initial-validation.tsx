import React, {useState, useEffect} from 'react';
import {Text, Box} from 'ink';
import {NotionService} from '../notion-service.js';
import {setupNotionClient, extractProjectSummary, displayProjectSummary, getAllRelationIds} from './utils.js';
import {MigrationResult, ValidationResult} from './types.js';

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

export default function InitialValidation({token}: Props) {
	const [result, setResult] = useState<MigrationResult & {data?: ValidationResult[]} | null>(null);
	const [loading, setLoading] = useState(true);
	const [progress, setProgress] = useState<ProgressState>({
		currentProject: 0,
		totalProjects: 0,
		currentProjectName: '',
		phase: 'loading',
		message: 'Initializing validation...',
	});

	useEffect(() => {
		validateProjects();
	}, []);

	const validateProjects = async () => {
		const {client, error} = setupNotionClient(token);
		
		if (!client) {
			setResult({success: false, error});
			setLoading(false);
			return;
		}

		try {
			const notionService = new NotionService('dummy'); // We'll use the client directly
			notionService.client = client;

			setProgress(prev => ({...prev, message: 'Fetching projects to validate...'}));
			// Get all projects with Migration status = "Project to migrate"
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
				message: `Found ${projects.length} project(s) to validate`,
			}));
			const validationResults: ValidationResult[] = [];

			// Validate each project
			for (let i = 0; i < projects.length; i++) {
				const project = projects[i];
				const projectSummary = extractProjectSummary(project);
				
				setProgress(prev => ({
					...prev,
					currentProject: i + 1,
					currentProjectName: projectSummary.title,
					message: `Validating project: ${projectSummary.title}`,
				}));
				
				const validation = await validateProject(client, project, projectSummary);
				validationResults.push(validation);
			}

			setProgress(prev => ({
				...prev,
				phase: 'complete',
				message: `Validation complete: ${projects.length} project(s) validated`,
			}));
			
			setResult({
				success: true,
				data: validationResults,
			});
		} catch (error: any) {
			let errorMessage = 'Failed to validate projects';
			
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

	const validateProject = async (client: any, project: any, projectSummary: any): Promise<ValidationResult> => {
		const errors: string[] = [];
		const properties = project.properties;

		// Check 1: Status must be "Done" or "Cancelled"
		const status = properties.Status?.status?.name;
		if (status !== 'Done' && status !== 'Cancelled' && status !== 'Ongoing') {
			errors.push(`Status is "${status}" but must be "Done", "Cancelled" or "Ongoing"`);
		}

		// Check 2: Must be a Project type
		const taskProjectActivity = properties['Task/project/activity']?.select?.name;
		if (taskProjectActivity !== 'Project' && taskProjectActivity !== 'Activity') {
			errors.push(`Task/project/activity is "${taskProjectActivity}" but must be one of "Project" or "Activity"`);
		}

		// Check 3: Must have no parent item (root-level project only)
		const parentItem = properties['Parent item']?.relation;
		if (parentItem && parentItem.length > 0) {
			errors.push('Project has parent item - only root-level projects can be migrated');
		}

		// Check 4: Validate subtask relations (now supports pagination)
		const subtaskRelation = properties['Subtask'] as any;
		if (subtaskRelation && subtaskRelation.relation && subtaskRelation.relation.length > 0) {
			// If has_more is true, we now handle this properly with pagination
			if (subtaskRelation.has_more) {
				// We can handle this now, but let's verify we can retrieve all subtasks
				const subtaskResult = await getAllRelationIds(client, project.id, 'Subtask');
				if (!subtaskResult.success) {
					errors.push(`Failed to retrieve all subtasks: ${subtaskResult.error}`);
				}
				// Note: No longer treating has_more as an error since we can handle pagination
			}
		}

		// If validation failed, set migration status to Error
		if (errors.length > 0) {
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
		}

		return {
			valid: errors.length === 0,
			errors,
			project: projectSummary,
		};
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
					<Text color="blue">Validating projects for migration...</Text>
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

	const validationResults = result.data || [];

	if (validationResults.length === 0) {
		return (
			<Box flexDirection="column">
				<Text color="yellow">No projects found with Migration status = "Project to migrate"</Text>
			</Box>
		);
	}

	const validProjects = validationResults.filter((r: ValidationResult) => r.valid);
	const invalidProjects = validationResults.filter((r: ValidationResult) => !r.valid);

	return (
		<Box flexDirection="column">
			<Text color="blue">Found {validationResults.length} project(s) to validate:</Text>
			<Text></Text>
			
			{validProjects.length > 0 && (
				<>
					<Text color="green">✓ Valid projects ({validProjects.length}):</Text>
					{validProjects.map((validation: ValidationResult, index: number) => (
						<Box key={index} flexDirection="column" marginLeft={2}>
							<Text>{displayProjectSummary(validation.project)}</Text>
							<Text color="gray">  {validation.project.url}</Text>
						</Box>
					))}
					<Text></Text>
				</>
			)}

			{invalidProjects.length > 0 && (
				<>
					<Text color="red">✗ Invalid projects ({invalidProjects.length}):</Text>
					{invalidProjects.map((validation: ValidationResult, index: number) => (
						<Box key={index} flexDirection="column" marginLeft={2}>
							<Text>{displayProjectSummary(validation.project)}</Text>
							<Text color="gray">  {validation.project.url}</Text>
							{validation.errors.map((error: string, errorIndex: number) => (
								<Text key={errorIndex} color="red">    • {error}</Text>
							))}
						</Box>
					))}
					<Text></Text>
				</>
			)}

			<Text color="blue">Summary:</Text>
			<Text color="green">  Valid: {validProjects.length}</Text>
			<Text color="red">  Invalid: {invalidProjects.length}</Text>
		</Box>
	);
}