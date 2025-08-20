// Shared types for migration steps
export type MigrationStep = 
	| 'init' 
	| 'created' 
	| 'saving-relations' 
	| 'handling-subtasks' 
	| 'await-manual-move' 
	| 'verifying' 
	| 'moved' 
	| 'confirm-update' 
	| 'updating' 
	| 'complete' 
	| 'error';

export interface MigrationState {
	step: MigrationStep;
	error: string | null;
	taskId: string | null;
	taskUrl: string | null;
	subtaskId: string | null;
	subtaskUrl: string | null;
	subtasksProcessed: number | null;
	movedUrl: string | null;
	moveResponse: any | null;
	updateResponse: any | null;
}

export interface StepResult {
	success: boolean;
	error?: string;
	data?: any;
	nextStep?: MigrationStep;
}