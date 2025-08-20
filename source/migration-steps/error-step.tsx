import React from 'react';
import {Text, Box} from 'ink';

// No business logic needed - this is just an error display step

interface Props {
	error: string | null;
}

// UI Component
export default function ErrorStep({error}: Props) {
	return (
		<Box flexDirection="column">
			<Text color="red">✗ Migration test failed</Text>
			<Text color="red">Error: {error}</Text>
			<Box marginTop={1}>
				<Text color="gray">Press Enter or 'q' to exit</Text>
			</Box>
		</Box>
	);
}