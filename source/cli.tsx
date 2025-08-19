#!/usr/bin/env node
import 'dotenv/config';
import React from 'react';
import {render} from 'ink';
import meow from 'meow';
import App from './app.js';

const cli = meow(
	`
	Usage
	  $ notion-project-migration <command> [subcommand]

	Commands
		test-connection    Test connection to Notion API and database access
		schema tasks       Display schema of the Task database
		schema projects    Display schema of the Project database
		migrate-test       Create a test project in Tasks DB and migrate it to Projects DB
		list-users         List all users in the Notion workspace with their IDs

	Options
		--token  Notion API token (or set NOTION_TOKEN env var)
		--json   Save raw JSON response to schema/ directory

	Examples
	  $ notion-project-migration test-connection
	  $ notion-project-migration schema tasks --token=secret_...
	  $ notion-project-migration schema projects --json --token=secret_...
	  $ notion-project-migration migrate-test --token=secret_...
	  $ notion-project-migration list-users --token=secret_...
`,
	{
		importMeta: import.meta,
		flags: {
			token: {
				type: 'string',
			},
			json: {
				type: 'boolean',
			},
		},
	},
);

render(<App command={cli.input[0]} subcommand={cli.input[1]} token={cli.flags.token} json={cli.flags.json} />);
