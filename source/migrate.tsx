import React from 'react';
import {Text, Box} from 'ink';

// Import all migrate subcommands
import CreateTestProject from './migrate/create-test-project.js';
import InitialValidation from './migrate/initial-validation.js';
import FixInCharge from './migrate/fix-in-charge.js';
import SaveParentProjectRelations from './migrate/save-parent-project-relations.js';
import SaveSubtasksRelations from './migrate/save-subtasks-relations.js';
import RemoveSubtasks from './migrate/remove-subtasks.js';
import VerifyMove from './migrate/verify-move.js';
import PostMoveUpdate from './migrate/post-move-update.js';
import RelinkParentProjects from './migrate/relink-parent-projects.js';
import RelinkSubtasks from './migrate/relink-subtasks.js';

type Props = {
	subcommand?: string;
	token?: string;
};

export default function Migrate({subcommand, token}: Props) {
	// Route to appropriate migrate subcommand
	switch (subcommand) {
		case 'initial-validation':
			return <InitialValidation token={token} />;
			
		case 'fix-in-charge':
			return <FixInCharge token={token} />;
			
		case 'save-parent-project-relations':
			return <SaveParentProjectRelations token={token} />;
			
		case 'save-subtasks-relations':
			return <SaveSubtasksRelations token={token} />;
			
		case 'remove-subtasks':
			return <RemoveSubtasks token={token} />;
			
		case 'verify-move':
			return <VerifyMove token={token} />;
			
		case 'post-move-update':
			return <PostMoveUpdate token={token} />;
			
		case 'relink-parent-projects':
			return <RelinkParentProjects token={token} />;
			
		case 'relink-subtasks':
			return <RelinkSubtasks token={token} />;

		default:
			return (
				<Box flexDirection="column">
					<Text color="red">Unknown migrate subcommand: {subcommand || '(none)'}</Text>
					<Text></Text>
					<Text>Available migrate subcommands:</Text>
					<Text color="blue">  initial-validation        - Validate projects ready for migration</Text>
					<Text color="blue">  fix-in-charge             - Fix multiple "In charge" assignments</Text>
					<Text color="blue">  save-parent-project-relations - Save parent project relations</Text>
					<Text color="blue">  save-subtasks-relations   - Save subtasks relations</Text>
					<Text color="blue">  remove-subtasks           - Remove subtask relations</Text>
					<Text color="gray">  (manual step: move projects in Notion UI)</Text>
					<Text color="blue">  verify-move               - Verify projects moved to Projects DB</Text>
					<Text color="blue">  post-move-update          - Update properties after move</Text>
					<Text color="blue">  relink-parent-projects    - Restore parent project links</Text>
					<Text color="blue">  relink-subtasks           - Restore subtask links</Text>
					<Text></Text>
					<Text>Example:</Text>
					<Text color="gray">  $ notion-project-migration migrate initial-validation --token=your_token</Text>
				</Box>
			);
	}
}

// Also export CreateTestProject for direct access
export {CreateTestProject};