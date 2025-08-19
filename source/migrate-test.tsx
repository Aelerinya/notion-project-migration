import React, {useState, useEffect} from 'react';
import {Text, Box, useInput} from 'ink';
import {NotionService, getNotionToken} from './notion-service.js';

type Props = {
	token?: string;
};

type Step = 'init' | 'created' | 'await-manual-move' | 'verifying' | 'moved' | 'confirm-update' | 'updating' | 'complete' | 'error';

export default function MigrateTest({token}: Props) {
	const [step, setStep] = useState<Step>('init');
	const [error, setError] = useState<string | null>(null);
	const [taskId, setTaskId] = useState<string | null>(null);
	const [taskUrl, setTaskUrl] = useState<string | null>(null);
	const [movedUrl, setMovedUrl] = useState<string | null>(null);
	const [service, setService] = useState<NotionService | null>(null);
	const [moveResponse, setMoveResponse] = useState<any>(null);
	const [updateResponse, setUpdateResponse] = useState<any>(null);

	useEffect(() => {
		const notionToken = getNotionToken(token);
		
		if (!notionToken) {
			setError('No Notion API token provided. Use --token flag or set NOTION_TOKEN environment variable.');
			setStep('error');
			return;
		}

		const notionService = new NotionService(notionToken);
		setService(notionService);
		
		// Start by creating the test task
		createTestTask(notionService);
	}, [token]);

	const createTestTask = async (notionService: NotionService) => {
		try {
			const result = await notionService.createTestTask();
			
			if (!result.success) {
				setError(result.error || 'Failed to create test task');
				setStep('error');
				return;
			}

			setTaskId(result.taskId || null);
			setTaskUrl(result.taskUrl || null);
			// Store the create response if available (we need to modify the service to return it)
			setStep('created');
		} catch (error: any) {
			setError(`Failed to create test task: ${error.message || 'Unknown error'}`);
			setStep('error');
		}
	};

	const verifyManualMove = async () => {
		if (!service || !taskId) return;

		setStep('verifying');

		try {
			const result = await service.verifyPageInProjectsDB(taskId);
			
			if (!result.success) {
				console.log('Verification failed:', result.error);
				setError(result.error || 'Page not yet moved');
				setStep('await-manual-move'); // Go back to waiting
				return;
			}

			setMovedUrl(result.pageUrl || null);
			setMoveResponse(result.response);
			setStep('moved');
		} catch (error: any) {
			setError(`Failed to verify move: ${error.message || 'Unknown error'}`);
			setStep('error');
		}
	};

	const updateProperties = async () => {
		if (!service || !taskId) return;

		setStep('updating');

		try {
			const result = await service.updatePropertiesForProjectsDB(taskId);
			
			if (!result.success) {
				setError(result.error || 'Failed to update properties');
				setStep('error');
				return;
			}

			setUpdateResponse(result.response);
			setStep('complete');
		} catch (error: any) {
			setError(`Failed to update properties: ${error.message || 'Unknown error'}`);
			setStep('error');
		}
	};

	useInput((input, key) => {
		if (step === 'created' && (input === 'y' || input === 'Y')) {
			setStep('await-manual-move');
		} else if (step === 'created' && (input === 'n' || input === 'N')) {
			setStep('complete');
		} else if (step === 'await-manual-move' && (input === 'c' || input === 'C')) {
			verifyManualMove();
		} else if (step === 'moved' && (input === 'y' || input === 'Y')) {
			updateProperties();
		} else if (step === 'moved' && (input === 'n' || input === 'N')) {
			setStep('complete');
		} else if ((step === 'complete' || step === 'error') && (key.return || input === 'q')) {
			process.exit(0);
		}
	});

	if (step === 'init') {
		return (
			<Box>
				<Text>Creating test task in Tasks database...</Text>
			</Box>
		);
	}

	if (step === 'error') {
		return (
			<Box flexDirection="column">
				<Text color="red">✗ Migration test failed</Text>
				<Text color="red">Error: {error}</Text>
				<Box marginTop={1}>
					<Text color="gray">Press Enter or 'q' to exit</Text>
				</Box>
			</Box>
		);
	}

	if (step === 'created') {
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

				<Box marginTop={1}>
					<Text>Please visit the URL above to verify the task was created correctly in the Tasks database.</Text>
				</Box>

				<Box marginTop={1}>
					<Text color="green">Do you want to proceed with the manual move step? (y/n): </Text>
				</Box>
			</Box>
		);
	}

	if (step === 'await-manual-move') {
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

	if (step === 'verifying') {
		return (
			<Box>
				<Text>Verifying that page has been moved to Projects database...</Text>
			</Box>
		);
	}

	if (step === 'moved') {
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

	if (step === 'updating') {
		return (
			<Box>
				<Text>Updating properties for Projects database schema...</Text>
			</Box>
		);
	}

	if (step === 'complete') {
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

	return null;
}