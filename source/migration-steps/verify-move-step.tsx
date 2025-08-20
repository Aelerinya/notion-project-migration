import React from 'react';
import {Text, Box} from 'ink';
import {Client} from '@notionhq/client';
import {DATABASE_IDS} from '../database-config.js';
import {StepResult} from './types.js';

// Notion API Function
async function verifyPageInProjectsDB(client: Client, pageId: string): Promise<{success: boolean; error?: string; response?: any; pageUrl?: string}> {
	try {
		// Check if the page is now in Projects database
		const page = await client.pages.retrieve({ page_id: pageId });
		
		const pageUrl = `https://www.notion.so/${pageId.replace(/-/g, '')}`;

		// Check if parent is Projects database - use type assertion for parent access
		const pageParent = (page as any).parent;
		if (pageParent && 'database_id' in pageParent) {
			// Normalize both IDs by removing hyphens for comparison
			const currentDbId = pageParent.database_id.replace(/-/g, '');
			const expectedDbId = DATABASE_IDS.PROJECTS.replace(/-/g, '');
			
			if (currentDbId === expectedDbId) {
				console.log(`✓ Page successfully moved to Projects database`);
				return {
					success: true,
					response: page,
					pageUrl,
				};
			} else {
				console.log(`✗ Page is still in wrong database`);
				return {
					success: false,
					error: `Page is in database ${pageParent.database_id}, expected ${DATABASE_IDS.PROJECTS}`,
				};
			}
		} else {
			console.log('✗ Page parent is not a database');
			return {
				success: false,
				error: 'Page parent is not a database - please ensure page is moved to Projects database',
			};
		}

	} catch (error: any) {
		console.error('Verification error:', error);
		
		let errorMessage = 'Failed to verify page location';
		
		if (error?.code === 'unauthorized') {
			errorMessage = 'Invalid API token or insufficient permissions';
		} else if (error?.code === 'object_not_found') {
			errorMessage = 'Page not found or not accessible';
		} else if (error?.message) {
			errorMessage = `${error.code || 'Error'}: ${error.message}`;
		}

		return {
			success: false,
			error: errorMessage,
		};
	}
}

// Business Logic
export async function executeVerifyMoveStep(client: Client, taskId: string): Promise<StepResult> {
	try {
		const result = await verifyPageInProjectsDB(client, taskId);
		
		if (!result.success) {
			return {
				success: false,
				error: result.error || 'Page not yet moved',
			};
		}

		return {
			success: true,
			data: {
				pageUrl: result.pageUrl,
				response: result.response,
			},
			nextStep: 'moved',
		};
	} catch (error: any) {
		return {
			success: false,
			error: `Failed to verify move: ${error.message || 'Unknown error'}`,
		};
	}
}

// UI Component
export default function VerifyMoveStep() {
	return (
		<Box>
			<Text>Verifying that page has been moved to Projects database...</Text>
		</Box>
	);
}