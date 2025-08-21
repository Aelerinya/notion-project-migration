import React, {useState, useEffect} from 'react';
import {Text, Box} from 'ink';
import {NotionService} from '../notion-service.js';
import {setupNotionClient, displayProjectSummary} from './utils.js';
import {MigrationResult, ProjectSummary} from './types.js';

interface Props {
	token?: string;
}

interface ProgressState {
	currentCheck: number;
	totalChecks: number;
	phase: 'loading' | 'processing' | 'complete';
	message: string;
}

export default function VerifyMove({token}: Props) {
	const [result, setResult] = useState<MigrationResult & {data?: ProjectSummary[]} | null>(null);
	const [loading, setLoading] = useState(true);
	const [progress, setProgress] = useState<ProgressState>({
		currentCheck: 0,
		totalChecks: 1,
		phase: 'loading',
		message: 'Initializing move verification...',
	});

	useEffect(() => {
		verifyProjectsMove();
	}, []);

	const verifyProjectsMove = async () => {
		const {client, error} = setupNotionClient(token);
		
		if (!client) {
			setResult({success: false, error});
			setLoading(false);
			return;
		}

		try {
			const notionService = new NotionService('dummy');
			notionService.client = client;

			setProgress(prev => ({
				...prev,
				phase: 'processing',
				message: 'Searching Projects database for moved projects...'
			}));

			// Query Projects database for projects with Migration status = "Project to migrate"
			const projectsResult = await notionService.getProjectsInProjectsDB('Project to migrate');
			
			if (!projectsResult.success) {
				setResult({success: false, error: projectsResult.error});
				setLoading(false);
				return;
			}

			const projects = projectsResult.projects || [];
			setProgress(prev => ({
				...prev,
				currentCheck: 1,
				message: `Found ${projects.length} project(s) in Projects database`,
			}));
			const movedProjects: ProjectSummary[] = projects.map(project => {
				// Extract project summary from Projects DB (schema might be different)
				const properties = project.properties;
				
				const title = properties.Name?.title?.[0]?.plain_text || 'Untitled';
				const status = properties.Status?.status?.name || 'Unknown';
				// Projects DB uses "Owner" instead of "In charge"
				const inCharge = properties.Owner?.people?.map((person: any) => person.name || 'Unknown') || 
								properties['In charge']?.people?.map((person: any) => person.name || 'Unknown') || [];
				const migrationStatus = properties['Migration status']?.select?.name || 'Unknown';
				
				return {
					id: project.id,
					title,
					url: `https://www.notion.so/${project.id.replace(/-/g, '')}`,
					status,
					inCharge,
					migrationStatus,
				};
			});

			setProgress(prev => ({
				...prev,
				phase: 'complete',
				message: `Verification complete: Found ${projects.length} moved project(s)`,
			}));
			
			setResult({
				success: true,
				data: movedProjects,
			});
		} catch (error: any) {
			let errorMessage = 'Failed to verify moved projects';
			
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
					<Text color="blue">Verifying projects have been moved to Projects database...</Text>
					<Text></Text>
					<Text color="cyan">Progress: {progress.currentCheck}/{progress.totalChecks} checks</Text>
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

	const movedProjects = result.data || [];

	if (movedProjects.length === 0) {
		return (
			<Box flexDirection="column">
				<Text color="yellow">No projects found in Projects database with Migration status = "Project to migrate"</Text>
				<Text color="gray">This means either:</Text>
				<Text color="gray">  • Projects haven't been moved yet</Text>
				<Text color="gray">  • Projects were moved but their Migration status was changed</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column">
			<Text color="green">✓ Found {movedProjects.length} project(s) in Projects database</Text>
			<Text></Text>
			<Text color="blue">Verified moved projects:</Text>
			{movedProjects.map((project, index) => (
				<Box key={index} flexDirection="column" marginLeft={2}>
					<Text>{displayProjectSummary(project)}</Text>
					<Text color="gray">  {project.url}</Text>
				</Box>
			))}
			<Text></Text>
			<Text color="blue">Summary:</Text>
			<Text>  Projects verified in Projects database: {movedProjects.length}</Text>
			<Text></Text>
			<Text color="green">✓ Projects have been successfully moved to Projects database</Text>
			<Text color="yellow">ℹ  Ready to proceed with post-move updates</Text>
		</Box>
	);
}