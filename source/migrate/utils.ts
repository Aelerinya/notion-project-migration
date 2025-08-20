import {Client} from '@notionhq/client';
import {getNotionToken} from '../notion-service.js';
import {ProjectSummary} from './types.js';

export function setupNotionClient(token?: string): {client: Client | null; error?: string} {
	const notionToken = getNotionToken(token);
	
	if (!notionToken) {
		return {
			client: null,
			error: 'No Notion API token provided. Use --token flag or set NOTION_TOKEN environment variable.',
		};
	}

	const client = new Client({
		auth: notionToken,
	});

	return {client};
}

export function formatProjectUrl(pageId: string): string {
	return `https://www.notion.so/${pageId.replace(/-/g, '')}`;
}

export function extractProjectSummary(page: any): ProjectSummary {
	const properties = page.properties;
	
	const title = properties.Name?.title?.[0]?.plain_text || 'Untitled';
	const status = properties.Status?.status?.name || 'Unknown';
	const inCharge = properties['In charge']?.people?.map((person: any) => person.name || 'Unknown') || [];
	const migrationStatus = properties['Migration status']?.select?.name || 'Unknown';
	
	return {
		id: page.id,
		title,
		url: formatProjectUrl(page.id),
		status,
		inCharge,
		migrationStatus,
	};
}

export function displayProjectSummary(project: ProjectSummary): string {
	return `${project.title} (Status: ${project.status}, In charge: ${project.inCharge.join(', ')})`;
}