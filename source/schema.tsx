import React, {useState, useEffect} from 'react';
import {Text, Box} from 'ink';
import {writeFileSync, mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {NotionService, getNotionToken, type DatabaseSchemaResult} from './notion-service.js';

type Props = {
	subcommand?: string;
	token?: string;
	json?: boolean;
};

export default function Schema({subcommand, token, json}: Props) {
	const [result, setResult] = useState<DatabaseSchemaResult | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const fetchSchema = async () => {
			if (!subcommand || (subcommand !== 'tasks' && subcommand !== 'projects')) {
				setResult({
					success: false,
					error: 'Invalid subcommand. Use "tasks" or "projects".',
				});
				setLoading(false);
				return;
			}

			const notionToken = getNotionToken(token);
			
			if (!notionToken) {
				setResult({
					success: false,
					error: 'No Notion API token provided. Use --token flag or set NOTION_TOKEN environment variable.',
				});
				setLoading(false);
				return;
			}

			try {
				const service = new NotionService(notionToken);
				const schemaResult = await service.getDatabaseSchema(subcommand as 'tasks' | 'projects');
				setResult(schemaResult);
			} catch (error: any) {
				setResult({
					success: false,
					error: `Failed to fetch schema: ${error.message || 'Unknown error'}`,
				});
			}
			
			setLoading(false);
		};

		fetchSchema();
	}, [subcommand, token]);

	if (loading) {
		return (
			<Box>
				<Text>Fetching {subcommand} database schema...</Text>
			</Box>
		);
	}

	if (!result) {
		return (
			<Box>
				<Text color="red">No result available</Text>
			</Box>
		);
	}

	if (!result.success) {
		return (
			<Box flexDirection="column">
				<Text color="red">✗ Failed to fetch {subcommand} database schema</Text>
				<Text color="red">Error: {result.error}</Text>
			</Box>
		);
	}

	if (result.success && result.schema) {
		if (json && result.rawResponse) {
			try {
				const schemaDir = 'schema';
				const filename = subcommand === 'tasks' ? 'tasks.json' : 'projects.json';
				const filePath = join(schemaDir, filename);
				
				// Create schema directory if it doesn't exist
				mkdirSync(schemaDir, { recursive: true });
				
				// Write JSON to file
				writeFileSync(filePath, JSON.stringify(result.rawResponse, null, 2), 'utf8');
				
				return (
					<Box flexDirection="column">
						<Text color="green">✓ Successfully saved {subcommand} database schema to {filePath}</Text>
					</Box>
				);
			} catch (error: any) {
				return (
					<Box flexDirection="column">
						<Text color="red">✗ Failed to save schema to file</Text>
						<Text color="red">Error: {error.message}</Text>
					</Box>
				);
			}
		}

		return (
			<Box flexDirection="column">
				<Text color="green">✓ Successfully retrieved {subcommand} database schema</Text>
				<Box marginTop={1}>
					<Text color="cyan">Database: {result.schema.title}</Text>
				</Box>
				<Box marginTop={1}>
					<Text color="yellow">Properties:</Text>
				</Box>
				{result.schema.properties.map((property, index) => (
					<Box key={index} marginLeft={2}>
						<Text>• </Text>
						<Text color="white">{property.name}</Text>
						<Text color="gray"> ({property.type})</Text>
					</Box>
				))}
			</Box>
		);
	}

	return (
		<Box flexDirection="column">
			<Text color="red">✗ Unexpected error occurred</Text>
		</Box>
	);
}