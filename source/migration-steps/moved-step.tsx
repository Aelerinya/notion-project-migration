import React from 'react';
import {Text, Box} from 'ink';

// No business logic needed - this is just a display/confirmation step

interface Props {
	movedUrl: string | null;
	moveResponse: any | null;
}

// UI Component
export default function MovedStep({movedUrl, moveResponse}: Props) {
	return (
		<Box flexDirection="column">
			<Text color="green">✓ Step 2: Page successfully moved to Projects database!</Text>
			
			{movedUrl && (
				<Box marginTop={1}>
					<Text color="cyan">Page URL (now in Projects DB): {movedUrl}</Text>
				</Box>
			)}

			{moveResponse && (
				<Box marginTop={1} flexDirection="column">
					<Text color="yellow">Verification Response Info:</Text>
					<Text color="gray">Last edited: {moveResponse.last_edited_time}</Text>
					{moveResponse.parent && (
						<Text color="gray">Parent DB: {moveResponse.parent.database_id}</Text>
					)}
				</Box>
			)}

			<Box marginTop={1}>
				<Text>The page has been successfully moved to Projects database with history preserved!</Text>
			</Box>

			<Box marginTop={1}>
				<Text color="green">Do you want to proceed with updating properties for Projects schema? (y/n): </Text>
			</Box>
		</Box>
	);
}