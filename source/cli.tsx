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
		test-connection              Test connection to Notion API and database access
		schema tasks                 Display schema of the Task database
		schema projects              Display schema of the Project database
		migrate-test                 Create a test project in Tasks DB and migrate it to Projects DB
		list-users                   List all users in the Notion workspace with their IDs
		create-test-project          Create test project with subtasks for testing migration
		migrate <subcommand>         Run individual migration steps

	Migrate subcommands (run in order)
		initial-validation           Step 1: Validate projects ready for migration
		fix-in-charge                Step 2: Fix multiple "In charge" assignments
		save-parent-project-relations Step 3: Save parent project relations
		save-subtasks-relations      Step 4: Save subtasks relations
		remove-subtasks              Step 5: Remove subtask relations
		                             (Manual step: move projects in Notion UI)
		verify-move                  Step 6: Verify projects moved to Projects DB
		post-move-update             Step 7: Update properties after move
		relink-parent-projects       Step 8: Restore parent project links
		relink-subtasks              Step 9: Restore subtask links

	Options
		--token  Notion API token (or set NOTION_TOKEN env var)
		--json   Save raw JSON response to schema/ directory

	Examples
	  $ notion-project-migration test-connection
	  $ notion-project-migration schema tasks --token=secret_...
	  $ notion-project-migration schema projects --json --token=secret_...
	  $ notion-project-migration migrate-test --token=secret_...
	  $ notion-project-migration list-users --token=secret_...
	  $ notion-project-migration create-test-project --token=secret_...
	  $ notion-project-migration migrate initial-validation --token=secret_...
	  $ notion-project-migration migrate fix-in-charge --token=secret_...
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
