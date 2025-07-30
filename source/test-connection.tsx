import React, {useState, useEffect} from 'react';
import {Text, Box} from 'ink';
import {NotionService, getNotionToken, type NotionConnectionResult} from './notion-service.js';

type Props = {
	token?: string;
};

export default function TestConnection({token}: Props) {
	const [result, setResult] = useState<NotionConnectionResult | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const testConnection = async () => {
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
				const connectionResult = await service.testConnection();
				setResult(connectionResult);
			} catch (error: any) {
				setResult({
					success: false,
					error: `Failed to test connection: ${error.message || 'Unknown error'}`,
				});
			}
			
			setLoading(false);
		};

		testConnection();
	}, [token]);

	if (loading) {
		return (
			<Box>
				<Text>Testing connection to Notion API...</Text>
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

	if (result.success) {
		return (
			<Box flexDirection="column">
				<Text color="green">✓ Successfully connected to Notion API</Text>
				{result.userInfo && (
					<Box marginTop={1}>
						<Text>User: {result.userInfo.name}</Text>
						{result.userInfo.email && (
							<Text> ({result.userInfo.email})</Text>
						)}
					</Box>
				)}
			</Box>
		);
	}

	return (
		<Box flexDirection="column">
			<Text color="red">✗ Failed to connect to Notion API</Text>
			<Text color="red">Error: {result.error}</Text>
		</Box>
	);
}