// Common types for migration commands

export interface MigrationResult {
	success: boolean;
	error?: string;
	data?: any;
}

export interface ProjectSummary {
	id: string;
	title: string;
	url: string;
	status: string;
	inCharge: string[];
	migrationStatus: string;
}

export interface SubtaskSummary {
	id: string;
	title: string;
	url: string;
	parentProject?: string;
}

export interface ValidationResult {
	valid: boolean;
	errors: string[];
	project: ProjectSummary;
}

export type MigrationStatus = 
	| 'Project to migrate'
	| 'Subtask to relink'
	| 'Migrated'
	| 'Error';