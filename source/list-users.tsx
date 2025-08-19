import React, {useState, useEffect} from 'react';
import {Text, Box} from 'ink';
import {NotionService, getNotionToken} from './notion-service.js';

type Props = {
	token?: string;
};

export default function ListUsers({token}: Props) {
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [users, setUsers] = useState<Array<{id: string; name?: string; email?: string}>>([]);

	useEffect(() => {
		const fetchUsers = async () => {
			const notionToken = getNotionToken(token);
			
			if (!notionToken) {
				setError('No Notion API token provided. Use --token flag or set NOTION_TOKEN environment variable.');
				setLoading(false);
				return;
			}

			const service = new NotionService(notionToken);
			const result = await service.listUsers();

			if (!result.success) {
				setError(result.error || 'Failed to fetch users');
			} else {
				setUsers(result.users || []);
			}

			setLoading(false);
		};

		fetchUsers();
	}, [token]);

	if (loading) {
		return (
			<Box>
				<Text>Fetching users from Notion workspace...</Text>
			</Box>
		);
	}

	if (error) {
		return (
			<Box flexDirection="column">
				<Text color="red">✗ Failed to fetch users</Text>
				<Text color="red">Error: {error}</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column">
			<Text color="green">✓ Users in Notion workspace:</Text>
			<Box marginTop={1} flexDirection="column">
				{users.map((user) => (
					<Box key={user.id} flexDirection="column" marginBottom={1}>
						<Text color="cyan">ID: {user.id}</Text>
						<Text>Name: {user.name}</Text>
						{user.email && <Text>Email: {user.email}</Text>}
					</Box>
				))}
			</Box>
			{users.length === 0 && (
				<Text color="yellow">No users found in workspace</Text>
			)}
		</Box>
	);
}