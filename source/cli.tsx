#!/usr/bin/env node
import 'dotenv/config';
import React from 'react';
import {render} from 'ink';
import meow from 'meow';
import App from './app.js';

const cli = meow(
	`
	Usage
	  $ notion-project-migration <command>

	Commands
		test-connection  Test connection to Notion API and database access

	Options
		--token  Notion API token (or set NOTION_TOKEN env var)

	Examples
	  $ notion-project-migration test-connection
	  $ notion-project-migration test-connection --token=secret_...
`,
	{
		importMeta: import.meta,
		flags: {
			token: {
				type: 'string',
			},
		},
	},
);

render(<App command={cli.input[0]} token={cli.flags.token} />);
