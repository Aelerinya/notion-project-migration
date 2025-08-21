import {Client} from '@notionhq/client';
import {getNotionToken} from '../notion-service.js';
import {ProjectSummary} from './types.js';
import type {
	PageObjectResponse,
	PartialPageObjectResponse,
	RelationPropertyItemObjectResponse
} from '@notionhq/client/build/src/api-endpoints.js';

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

export function extractProjectSummary(page: PageObjectResponse | PartialPageObjectResponse): ProjectSummary {
	if (!('properties' in page)) {
		return {
			id: page.id,
			title: 'Partial Page',
			url: formatProjectUrl(page.id),
			status: 'Unknown',
			inCharge: [],
			migrationStatus: 'Unknown',
		};
	}
	
	// Extract title
	let title = 'Untitled';
	const nameProperty = page.properties['Name'];
	if (nameProperty?.type === 'title') {
		const firstTitle = nameProperty.title[0];
		if (firstTitle?.plain_text) {
			title = firstTitle.plain_text;
		}
	}
	
	// Extract status
	let status = 'Unknown';
	const statusProperty = page.properties['Status'];
	if (statusProperty?.type === 'status' && statusProperty.status?.name) {
		status = statusProperty.status.name;
	}
	
	// Extract in charge people
	let inCharge: string[] = [];
	const inChargeProperty = page.properties['In charge'];
	if (inChargeProperty?.type === 'people') {
		inCharge = inChargeProperty.people.map(person => {
			if ('name' in person && person.name) {
				return person.name;
			}
			return 'Unknown';
		});
	}
	
	// Extract migration status
	let migrationStatus = 'Unknown';
	const migrationStatusProperty = page.properties['Migration status'];
	if (migrationStatusProperty?.type === 'select' && migrationStatusProperty.select?.name) {
		migrationStatus = migrationStatusProperty.select.name;
	}
	
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

/**
 * Retrieves all relation IDs from a page property, handling pagination automatically.
 * Uses the dedicated "Retrieve a page property" endpoint to get complete results
 * when has_more is true (more than 25 relations).
 */
export async function getAllRelationIds(
	client: Client, 
	pageId: string, 
	propertyName: string
): Promise<{success: boolean; relationIds: string[]; error?: string}> {
	try {
		// First, get the page to find the property ID
		const page = await client.pages.retrieve({page_id: pageId});
		
		if (!('properties' in page)) {
			return {success: false, relationIds: [], error: 'Invalid page response'};
		}
		
		const property = page.properties[propertyName];
		if (!property) {
			return {success: false, relationIds: [], error: `Property "${propertyName}" not found`};
		}
		
		if (property.type !== 'relation') {
			return {success: false, relationIds: [], error: `Property "${propertyName}" is not a relation`};
		}
		
		// Get the property ID for the dedicated endpoint
		const propertyId = property.id;
		
		// Use the dedicated page property endpoint to handle pagination
		let allRelationIds: string[] = [];
		let hasMore = true;
		let startCursor: string | null = null;
		
		while (hasMore) {
			const response = await client.pages.properties.retrieve({
				page_id: pageId,
				property_id: propertyId,
				start_cursor: startCursor || undefined,
			});
			
			// Check if this is a relation property response
			if (response.type !== 'property_item') {
				return {success: false, relationIds: [], error: 'Unexpected response type'};
			}
			
			// Check if the results are relation items
			if (!('results' in response)) {
				return {success: false, relationIds: [], error: 'No results in response'};
			}
			
			// Extract relation IDs from this page of results
			const pageRelationIds: string[] = [];
			for (const item of response.results) {
				if (item.type === 'relation' && 'relation' in item) {
					const relationItem = item as RelationPropertyItemObjectResponse;
					if (relationItem.relation?.id) {
						pageRelationIds.push(relationItem.relation.id);
					}
				}
			}
			
			allRelationIds = allRelationIds.concat(pageRelationIds);
			
			// Check pagination properties
			hasMore = response.has_more || false;
			startCursor = response.next_cursor || null;
			
			// Add small delay to respect rate limits
			if (hasMore) {
				await new Promise(resolve => setTimeout(resolve, 100));
			}
		}
		
		return {success: true, relationIds: allRelationIds};
		
	} catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		return {
			success: false, 
			relationIds: [], 
			error: `Failed to retrieve relation IDs: ${errorMessage}`
		};
	}
}