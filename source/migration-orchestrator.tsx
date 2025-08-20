import React, {useState, useEffect} from 'react';
import {useInput} from 'ink';
import {Client} from '@notionhq/client';
import {getNotionToken} from './notion-service.js';
import {MigrationState, MigrationStep} from './migration-steps/types.js';

// Self-contained step imports (each contains both logic and UI)
import InitStep, {executeInitStep} from './migration-steps/init-step.js';
import CreatedStep from './migration-steps/created-step.js';
import SaveRelationsStep, {executeSaveRelationsStep} from './migration-steps/save-relations-step.js';
import HandleSubtasksStep, {executeHandleSubtasksStep} from './migration-steps/handle-subtasks-step.js';
import AwaitManualMoveStep from './migration-steps/await-manual-move-step.js';
import VerifyMoveStep, {executeVerifyMoveStep} from './migration-steps/verify-move-step.js';
import MovedStep from './migration-steps/moved-step.js';
import UpdatePropertiesStep, {executeUpdatePropertiesStep} from './migration-steps/update-properties-step.js';
import CompleteStep from './migration-steps/complete-step.js';
import ErrorStep from './migration-steps/error-step.js';

interface Props {
	token?: string;
}

export default function MigrationOrchestrator({token}: Props) {
	const [state, setState] = useState<MigrationState>({
		step: 'init',
		error: null,
		taskId: null,
		taskUrl: null,
		subtaskId: null,
		subtaskUrl: null,
		subtasksProcessed: null,
		movedUrl: null,
		moveResponse: null,
		updateResponse: null,
	});

	const [client, setClient] = useState<Client | null>(null);

	useEffect(() => {
		const notionToken = getNotionToken(token);
		
		if (!notionToken) {
			setState(prev => ({
				...prev,
				error: 'No Notion API token provided. Use --token flag or set NOTION_TOKEN environment variable.',
				step: 'error',
			}));
			return;
		}

		const notionClient = new Client({
			auth: notionToken,
		});
		setClient(notionClient);
		
		// Start the migration process
		startMigration(notionClient);
	}, [token]);

	const startMigration = async (notionClient: Client) => {
		const result = await executeInitStep(notionClient);
		
		if (!result.success) {
			setState(prev => ({
				...prev,
				error: result.error || 'Failed to create test task',
				step: 'error',
			}));
			return;
		}

		setState(prev => ({
			...prev,
			taskId: result.data?.taskId || null,
			taskUrl: result.data?.taskUrl || null,
			subtaskId: result.data?.subtaskId || null,
			subtaskUrl: result.data?.subtaskUrl || null,
			step: result.nextStep || 'created',
		}));
	};

	// Auto-execute steps that don't require user input
	useEffect(() => {
		if (!client || !state.taskId) return;

		const autoSteps: MigrationStep[] = ['handling-subtasks'];
		
		if (autoSteps.includes(state.step)) {
			console.log(`🤖 Auto-executing step: ${state.step}`);
			executeStep(state.step);
		}
	}, [state.step, client, state.taskId]);

	const executeStep = async (step: MigrationStep) => {
		if (!client || !state.taskId) {
			return;
		}

		switch (step) {
			case 'saving-relations':
				console.log('🔄 Orchestrator: About to set step to saving-relations');
				setState(prev => ({...prev, step: 'saving-relations'}));
				console.log('📞 Orchestrator: About to call executeSaveRelationsStep');
				
				const saveResult = await executeSaveRelationsStep(client, state.taskId);
				console.log('📋 Orchestrator: executeSaveRelationsStep returned:', saveResult);
				
				if (!saveResult.success) {
					console.log('❌ Orchestrator: Save relations failed');
					setState(prev => ({
						...prev,
						error: saveResult.error || 'Failed to save relations',
						step: 'error',
					}));
					return;
				}

				console.log('✅ Orchestrator: Save relations successful, transitioning to next step');
				setState(prev => ({
					...prev,
					step: saveResult.nextStep || 'handling-subtasks',
				}));
				break;

			case 'handling-subtasks':
				console.log('🔄 Orchestrator: About to set step to handling-subtasks');
				setState(prev => ({...prev, step: 'handling-subtasks'}));
				console.log('📞 Orchestrator: About to call executeHandleSubtasksStep');
				
				const subtaskResult = await executeHandleSubtasksStep(client, state.taskId);
				console.log('📋 Orchestrator: executeHandleSubtasksStep returned:', subtaskResult);
				
				if (!subtaskResult.success) {
					setState(prev => ({
						...prev,
						error: subtaskResult.error || 'Failed to handle subtasks',
						step: 'error',
					}));
					return;
				}

				setState(prev => ({
					...prev,
					subtasksProcessed: subtaskResult.data?.subtasksProcessed || 0,
					step: subtaskResult.nextStep || 'await-manual-move',
				}));
				break;

			case 'verifying':
				setState(prev => ({...prev, step: 'verifying'}));
				const verifyResult = await executeVerifyMoveStep(client, state.taskId);
				
				if (!verifyResult.success) {
					setState(prev => ({
						...prev,
						error: verifyResult.error || 'Page not yet moved',
						step: 'await-manual-move', // Go back to waiting
					}));
					return;
				}

				setState(prev => ({
					...prev,
					movedUrl: verifyResult.data?.pageUrl || null,
					moveResponse: verifyResult.data?.response || null,
					step: verifyResult.nextStep || 'moved',
				}));
				break;

			case 'updating':
				setState(prev => ({...prev, step: 'updating'}));
				const updateResult = await executeUpdatePropertiesStep(client, state.taskId);
				
				if (!updateResult.success) {
					setState(prev => ({
						...prev,
						error: updateResult.error || 'Failed to update properties',
						step: 'error',
					}));
					return;
				}

				setState(prev => ({
					...prev,
					updateResponse: updateResult.data?.response || null,
					step: updateResult.nextStep || 'complete',
				}));
				break;
		}
	};

	// Handle keyboard input
	useInput((input, key) => {
		if (state.step === 'created' && (input === 'y' || input === 'Y')) {
			executeStep('saving-relations');
		} else if (state.step === 'created' && (input === 'n' || input === 'N')) {
			setState(prev => ({...prev, step: 'complete'}));
		} else if (state.step === 'await-manual-move' && (input === 'c' || input === 'C')) {
			executeStep('verifying');
		} else if (state.step === 'moved' && (input === 'y' || input === 'Y')) {
			executeStep('updating');
		} else if (state.step === 'moved' && (input === 'n' || input === 'N')) {
			setState(prev => ({...prev, step: 'complete'}));
		} else if ((state.step === 'complete' || state.step === 'error') && (key.return || input === 'q')) {
			process.exit(0);
		}
	});

	// Render the appropriate step component
	switch (state.step) {
		case 'init':
			return <InitStep />;
		case 'created':
			return <CreatedStep taskId={state.taskId} taskUrl={state.taskUrl} subtaskId={state.subtaskId} subtaskUrl={state.subtaskUrl} />;
		case 'saving-relations':
			return <SaveRelationsStep />;
		case 'handling-subtasks':
			return <HandleSubtasksStep subtasksProcessed={state.subtasksProcessed || undefined} />;
		case 'await-manual-move':
			return <AwaitManualMoveStep taskUrl={state.taskUrl} />;
		case 'verifying':
			return <VerifyMoveStep />;
		case 'moved':
			return <MovedStep movedUrl={state.movedUrl} moveResponse={state.moveResponse} />;
		case 'updating':
			return <UpdatePropertiesStep />;
		case 'complete':
			return <CompleteStep movedUrl={state.movedUrl} updateResponse={state.updateResponse} />;
		case 'error':
			return <ErrorStep error={state.error} />;
		default:
			return <ErrorStep error="Unknown step" />;
	}
}