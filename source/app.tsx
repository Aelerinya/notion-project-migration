import React from 'react';
import {Text, Box} from 'ink';
import TestConnection from './test-connection.js';
import Schema from './schema.js';
import MigrateTest from './migrate-test.js';
import ListUsers from './list-users.js';
import Migrate, {CreateTestProject} from './migrate.js';

type Props = {
	command?: string;
	subcommand?: string;
	token?: string;
	json?: boolean;
	subtasksN?: number;
};

export default function App({command, subcommand, token, json, subtasksN}: Props) {
	if (command === 'test-connection') {
		return <TestConnection token={token} />;
	}

	if (command === 'schema') {
		return <Schema subcommand={subcommand} token={token} json={json} />;
	}

	if (command === 'migrate-test') {
		return <MigrateTest token={token} />;
	}

	if (command === 'list-users') {
		return <ListUsers token={token} />;
	}

	if (command === 'create-test-project') {
		return <CreateTestProject token={token} subtasksN={subtasksN} />;
	}

	if (command === 'migrate') {
		return <Migrate subcommand={subcommand} token={token} />;
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
