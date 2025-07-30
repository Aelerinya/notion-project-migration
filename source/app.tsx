import React from 'react';
import {Text, Box} from 'ink';
import TestConnection from './test-connection.js';

type Props = {
	command?: string;
	token?: string;
};

export default function App({command, token}: Props) {
	if (command === 'test-connection') {
		return <TestConnection token={token} />;
	}

	if (!command) {
		return (
			<Box flexDirection="column">
				<Text color="red">No command specified.</Text>
				<Text>Run with --help to see available commands.</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column">
			<Text color="red">Unknown command: {command}</Text>
			<Text>Run with --help to see available commands.</Text>
		</Box>
	);
}
