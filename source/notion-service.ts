import {Client} from '@notionhq/client';

export interface NotionConnectionResult {
	success: boolean;
	error?: string;
	userInfo?: {
		name?: string;
		email?: string;
	};
}

export class NotionService {
	private client: Client | null = null;

	constructor(private token: string) {
		this.client = new Client({
			auth: token,
		});
	}

	async testConnection(): Promise<NotionConnectionResult> {
		if (!this.client) {
			return {
				success: false,
				error: 'No Notion client initialized',
			};
		}

		try {
			const response = await this.client.users.me();
			
			return {
				success: true,
				userInfo: {
					name: response.name || 'Unknown',
					email: 'person' in response ? response.person?.email : undefined,
				},
			};
		} catch (error: any) {
			let errorMessage = 'Unknown error occurred';
			
			if (error?.code === 'unauthorized') {
				errorMessage = 'Invalid API token';
			} else if (error?.message) {
				errorMessage = error.message;
			}

			return {
				success: false,
				error: errorMessage,
			};
		}
	}
}

export function getNotionToken(providedToken?: string): string | null {
	return providedToken || process.env.NOTION_TOKEN || null;
}