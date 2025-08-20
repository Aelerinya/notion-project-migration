import React from 'react';
import {Text, Box} from 'ink';

// No business logic needed - this is just a final display step

interface Props {
	movedUrl: string | null;
	updateResponse: any | null;
}

// UI Component
export default function CompleteStep({movedUrl, updateResponse}: Props) {
	return (
		<Box flexDirection="column">
			<Text color="green">✓ Migration test completed successfully!</Text>
			
			{movedUrl && (
				<Box marginTop={1}>
					<Text color="cyan">Final Page URL: {movedUrl}</Text>
				</Box>
			)}

			{updateResponse && (
				<Box marginTop={1} flexDirection="column">
					<Text color="yellow">Property Migration Summary:</Text>
					<Text color="gray">• Task/project/activity → Type</Text>
					<Text color="gray">• Importance → Impact</Text>
					<Text color="gray">• Comments & updates → Comments</Text>
					<Text color="gray">• In charge → Owner (if single person)</Text>
					<Text color="gray">• Deadline → Start and end dates</Text>
					<Text color="gray">• Status: Done → Completed</Text>
					<Text color="gray">• Parent projects restored from saved data</Text>
					<Text color="gray">• Subtask connections restored after move</Text>
				</Box>
			)}

			<Box marginTop={1}>
				<Text color="green">✓ Page moved to Projects DB with updated properties and preserved history!</Text>
			</Box>

			<Box marginTop={1} flexDirection="column">
				<Text>Visit the URL above to verify:</Text>
				<Text>• Page is now in Projects database</Text>
				<Text>• Properties updated (Task/project/activity → Type, Done → Completed, etc.)</Text>
				<Text>• All page content and history preserved</Text>
			</Box>

			<Box marginTop={2}>
				<Text color="gray">Press Enter or 'q' to exit</Text>
			</Box>
		</Box>
	);
}