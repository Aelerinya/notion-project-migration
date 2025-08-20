import React, {useState, useEffect} from 'react';
import {Text, Box} from 'ink';
import {DATABASE_IDS} from '../database-config.js';
import {setupNotionClient, formatProjectUrl} from './utils.js';
import {MigrationResult} from './types.js';

interface Props {
	token?: string;
}

interface CreatedProject {
	projectId: string;
	projectUrl: string;
	subtask1Id: string;
	subtask1Url: string;
	subtask2Id: string;
	subtask2Url: string;
}

export default function CreateTestProject({token}: Props) {
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

			// Create first test subtask
			const subtask1 = await client.pages.create({
				parent: {
					database_id: DATABASE_IDS.TASKS,
				},
				properties: {
					'Name': {
						title: [
							{
								text: {
									content: `Test Subtask 1 - ${timestamp}`,
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
						number: 2,
					},
					'Cost (k€)': {
						number: 0.5,
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
									content: 'Test subtask 1 created for migration testing purposes.',
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

			// Create second test subtask
			const subtask2 = await client.pages.create({
				parent: {
					database_id: DATABASE_IDS.TASKS,
				},
				properties: {
					'Name': {
						title: [
							{
								text: {
									content: `Test Subtask 2 - ${timestamp}`,
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
						number: 1.5,
					},
					'Cost (k€)': {
						number: 0.3,
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
									content: 'Test subtask 2 created for migration testing purposes.',
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

			const projectData: CreatedProject = {
				projectId: testProject.id,
				projectUrl: formatProjectUrl(testProject.id),
				subtask1Id: subtask1.id,
				subtask1Url: formatProjectUrl(subtask1.id),
				subtask2Id: subtask2.id,
				subtask2Url: formatProjectUrl(subtask2.id),
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
			<Text color="blue">Subtask 1:</Text>
			<Text>  ID: {data?.subtask1Id}</Text>
			<Text>  URL: {data?.subtask1Url}</Text>
			<Text></Text>
			<Text color="blue">Subtask 2:</Text>
			<Text>  ID: {data?.subtask2Id}</Text>
			<Text>  URL: {data?.subtask2Url}</Text>
			<Text></Text>
			<Text color="green">✓ Test project created with all proper properties and relations</Text>
		</Box>
	);
}