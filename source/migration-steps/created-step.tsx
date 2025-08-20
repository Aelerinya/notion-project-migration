import React from 'react';
import {Text, Box} from 'ink';

// No business logic needed - this is just a display step

interface Props {
	taskId: string | null;
	taskUrl: string | null;
	subtaskId?: string | null;
	subtaskUrl?: string | null;
}

// UI Component
export default function CreatedStep({taskId, taskUrl, subtaskId, subtaskUrl}: Props) {
	return (
		<Box flexDirection="column">
			<Text color="green">✓ Step 1: Test task created successfully!</Text>
			
			{taskId && (
				<Box marginTop={1}>
					<Text color="cyan">Task ID: {taskId}</Text>
				</Box>
			)}

			{taskUrl && (
				<Box marginTop={1}>
					<Text color="cyan">Task URL: {taskUrl}</Text>
				</Box>
			)}

			{subtaskId && (
				<Box marginTop={1}>
					<Text color="cyan">Subtask ID: {subtaskId}</Text>
				</Box>
			)}

			{subtaskUrl && (
				<Box marginTop={1}>
					<Text color="cyan">Subtask URL: {subtaskUrl}</Text>
				</Box>
			)}

			<Box marginTop={1}>
				<Text>Please visit the URLs above to verify the project and subtask were created correctly.</Text>
			</Box>

			<Box marginTop={1}>
				<Text color="green">Do you want to proceed with migration (parent relations + subtask handling)? (y/n): </Text>
			</Box>
		</Box>
	);
}