import React, {useState, useEffect} from 'react';
import {Text, Box} from 'ink';
import {DATABASE_IDS} from '../database-config.js';
import {setupNotionClient, formatProjectUrl} from './utils.js';
import {MigrationResult} from './types.js';

interface Props {
	token?: string;
	subtasksN?: number;
}

interface CreatedSubtask {
	id: string;
	url: string;
	title: string;
}

interface CreatedProject {
	projectId: string;
	projectUrl: string;
	subtasks: CreatedSubtask[];
}

export default function CreateTestProject({token, subtasksN = 2}: Props) {
	const [result, setResult] = useState<MigrationResult & {data?: CreatedProject} | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		createTestProject();
	}, []);

	const createTestProject = async () => {
		const {client, error} = setupNotionClient(token);
		
		if (!client) {
			setResult({success: false, error});
			setLoading(false);
			return;
		}

		try {
			const timestamp = new Date().toISOString();
			
			// Create the test project
			const testProject = await client.pages.create({
				parent: {
					database_id: DATABASE_IDS.TASKS,
				},
				properties: {
					'Name': {
						title: [
							{
								text: {
									content: `Test Migration Project - ${timestamp}`,
								},
							},
						],
					},
					'Task/project/activity': {
						select: {
							name: 'Project',
						},
					},
					'Status': {
						status: {
							name: 'Done',
						},
					},
					'Deadline': {
						date: {
							start: '2025-03-01',
						},
					},
					'Duration (h)': {
						number: 10,
					},
					'Cost (k€)': {
						number: 5,
					},
					'In charge': {
						people: [
							{
								id: '9494ea4b-765a-4eac-9cc2-39feef9c4bb7',
							},
						],
					},
					'Importance': {
						select: {
							name: '⭐⭐⭐⭐',
						},
					},
					'Team': {
						select: {
							name: 'R&D',
						},
					},
					'Supervisor': {
						people: [
							{
								id: '6d25e541-6b16-41c1-be36-8c2f548f0f36',
							},
						],
					},
					'Comments & updates': {
						rich_text: [
							{
								text: {
									content: 'Test migration project created for database migration testing purposes.',
								},
							},
						],
					},
					'Projects': {
						relation: [
							{
								id: '23f66ef02bab80d7b205d1b31f3aad2e',
							},
						],
					},
					'Migration status': {
						select: {
							name: 'Project to migrate',
						},
					},
				},
			});

			// Create test subtasks dynamically
			const createdSubtasks: CreatedSubtask[] = [];
			
			for (let i = 1; i <= subtasksN; i++) {
				const subtask = await client.pages.create({
					parent: {
						database_id: DATABASE_IDS.TASKS,
					},
					properties: {
						'Name': {
							title: [
								{
									text: {
										content: `Test Subtask ${i} - ${timestamp}`,
									},
								},
							],
						},
						'Task/project/activity': {
							select: {
								name: 'Task',
							},
						},
						'Status': {
							status: {
								name: 'Done',
							},
						},
						'Duration (h)': {
							number: 1 + (i * 0.5), // Vary duration: 1.5, 2, 2.5, etc.
						},
						'Cost (k€)': {
							number: 0.2 + (i * 0.1), // Vary cost: 0.3, 0.4, 0.5, etc.
						},
						'Team': {
							select: {
								name: 'R&D',
							},
						},
						'Comments & updates': {
							rich_text: [
								{
									text: {
										content: `Test subtask ${i} created for migration testing purposes.`,
									},
								},
							],
						},
						'Parent item': {
							relation: [
								{
									id: testProject.id,
								},
							],
						},
					},
				});

				createdSubtasks.push({
					id: subtask.id,
					url: formatProjectUrl(subtask.id),
					title: `Test Subtask ${i} - ${timestamp}`,
				});
			}

			const projectData: CreatedProject = {
				projectId: testProject.id,
				projectUrl: formatProjectUrl(testProject.id),
				subtasks: createdSubtasks,
			};

			setResult({
				success: true,
				data: projectData,
			});
		} catch (error: any) {
			let errorMessage = 'Failed to create test project';
			
			if (error?.code === 'unauthorized') {
				errorMessage = 'Invalid API token or insufficient permissions';
			} else if (error?.code === 'object_not_found') {
				errorMessage = 'Tasks database not found or not accessible';
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
				<Text>Creating test project with subtasks...</Text>
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

	const {data} = result;

	return (
		<Box flexDirection="column">
			<Text color="green">✓ Test project created successfully!</Text>
			<Text></Text>
			<Text color="blue">Project:</Text>
			<Text>  ID: {data?.projectId}</Text>
			<Text>  URL: {data?.projectUrl}</Text>
			<Text></Text>
			<Text color="blue">Subtasks ({data?.subtasks.length || 0}):</Text>
			{data?.subtasks.map((subtask, index) => (
				<Box key={subtask.id} flexDirection="column" marginLeft={2}>
					<Text color="cyan">Subtask {index + 1}:</Text>
					<Text>  Title: {subtask.title}</Text>
					<Text>  ID: {subtask.id}</Text>
					<Text>  URL: {subtask.url}</Text>
					{index < (data.subtasks.length - 1) && <Text></Text>}
				</Box>
			))}
			<Text></Text>
			<Text color="green">✓ Test project created with all proper properties and relations</Text>
		</Box>
	);
}