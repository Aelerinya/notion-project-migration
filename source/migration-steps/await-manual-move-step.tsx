import React from 'react';
import {Text, Box} from 'ink';

// No business logic needed - this is just an instruction step

interface Props {
	taskUrl: string | null;
}

// UI Component
export default function AwaitManualMoveStep({taskUrl}: Props) {
	return (
		<Box flexDirection="column">
			<Text color="yellow">⚠️  Step 2: Manual Move Required</Text>
			
			{taskUrl && (
				<Box marginTop={1}>
					<Text color="cyan">Task URL: {taskUrl}</Text>
				</Box>
			)}

			<Box marginTop={2}>
				<Text color="red">IMPORTANT: You must manually move the page to preserve history!</Text>
			</Box>

			<Box marginTop={1} flexDirection="column">
				<Text>Please follow these steps:</Text>
				<Text>1. Open the task page in your browser (URL above)</Text>
				<Text>2. Click the "•••" menu in the top right</Text>
				<Text>3. Select "Move to" and choose the Projects database</Text>
				<Text>4. Confirm the move</Text>
			</Box>

			<Box marginTop={2}>
				<Text color="green">After moving the page, press 'c' to continue verification: </Text>
			</Box>
		</Box>
	);
}