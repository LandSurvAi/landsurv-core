// notionService.ts
// Service for handling Notion API integration

import { NotionIntegration } from '../types';

const NOTION_AUTH_URL = 'https://api.notion.com/v1/oauth/authorize';
const NOTION_TOKEN_URL = 'https://api.notion.com/v1/oauth/token';
const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_API_VERSION = '2022-06-28';

// These would need to be configured in your environment
// For now, we'll handle client-side OAuth flow
const CLIENT_ID = process.env.VITE_NOTION_CLIENT_ID || '';
const REDIRECT_URI = process.env.VITE_NOTION_REDIRECT_URI || `${window.location.origin}/notion-callback`;

export interface NotionWorkspace {
  id: string;
  name: string;
  icon?: string;
}

export interface NotionDatabase {
  id: string;
  title: string;
  description?: string;
}

export interface NotionPage {
  id: string;
  title: string;
  url: string;
  createdTime: string;
  lastEditedTime: string;
}

/**
 * Initiates the Notion OAuth flow by redirecting to Notion's authorization page
 */
export const initiateNotionAuth = (): void => {
  if (!CLIENT_ID) {
    throw new Error('Notion Client ID is not configured. Please set VITE_NOTION_CLIENT_ID in your environment variables.');
  }

  const state = Math.random().toString(36).substring(7);
  sessionStorage.setItem('notion_oauth_state', state);

  const authUrl = new URL(NOTION_AUTH_URL);
  authUrl.searchParams.set('client_id', CLIENT_ID);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('owner', 'user');
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('state', state);

  window.location.href = authUrl.toString();
};

/**
 * Exchanges authorization code for access token
 * Note: This should ideally be done on the backend to keep client secret secure
 */
export const exchangeCodeForToken = async (code: string): Promise<{ accessToken: string; workspaceId: string; workspaceName: string }> => {
  // In production, this should be a call to your backend
  // which handles the token exchange securely
  throw new Error('Token exchange must be implemented on the backend for security. Please set up a backend endpoint.');
  
  // Example of what the backend would do:
  // const response = await fetch(NOTION_TOKEN_URL, {
  //   method: 'POST',
  //   headers: {
  //     'Content-Type': 'application/json',
  //     'Authorization': `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`,
  //   },
  //   body: JSON.stringify({
  //     grant_type: 'authorization_code',
  //     code,
  //     redirect_uri: REDIRECT_URI,
  //   }),
  // });
  // const data = await response.json();
  // return {
  //   accessToken: data.access_token,
  //   workspaceId: data.workspace_id,
  //   workspaceName: data.workspace_name,
  // };
};

/**
 * Test the Notion connection with the provided access token
 */
export const testNotionConnection = async (accessToken: string): Promise<boolean> => {
  try {
    const response = await fetch(`${NOTION_API_BASE}/users/me`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Notion-Version': NOTION_API_VERSION,
      },
    });
    return response.ok;
  } catch (error) {
    console.error('Failed to test Notion connection:', error);
    return false;
  }
};

/**
 * Get user's Notion workspace information
 */
export const getNotionWorkspace = async (accessToken: string): Promise<NotionWorkspace | null> => {
  try {
    const response = await fetch(`${NOTION_API_BASE}/users/me`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Notion-Version': NOTION_API_VERSION,
      },
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch workspace info');
    }
    
    const data = await response.json();
    return {
      id: data.id,
      name: data.name || 'My Workspace',
      icon: data.avatar_url,
    };
  } catch (error) {
    console.error('Failed to get Notion workspace:', error);
    return null;
  }
};

/**
 * Search for databases in the user's Notion workspace
 */
export const searchNotionDatabases = async (accessToken: string): Promise<NotionDatabase[]> => {
  try {
    const response = await fetch(`${NOTION_API_BASE}/search`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Notion-Version': NOTION_API_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filter: {
          property: 'object',
          value: 'database',
        },
        sort: {
          direction: 'descending',
          timestamp: 'last_edited_time',
        },
      }),
    });
    
    if (!response.ok) {
      throw new Error('Failed to search databases');
    }
    
    const data = await response.json();
    return data.results.map((db: any) => ({
      id: db.id,
      title: db.title?.[0]?.plain_text || 'Untitled',
      description: db.description?.[0]?.plain_text,
    }));
  } catch (error) {
    console.error('Failed to search Notion databases:', error);
    return [];
  }
};

/**
 * Create a new page in Notion with fieldbook data
 */
export const createNotionPage = async (
  accessToken: string,
  databaseId: string,
  title: string,
  content: string
): Promise<NotionPage | null> => {
  try {
    const response = await fetch(`${NOTION_API_BASE}/pages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Notion-Version': NOTION_API_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        parent: {
          database_id: databaseId,
        },
        properties: {
          title: {
            title: [
              {
                text: {
                  content: title,
                },
              },
            ],
          },
        },
        children: [
          {
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [
                {
                  type: 'text',
                  text: {
                    content: content,
                  },
                },
              ],
            },
          },
        ],
      }),
    });
    
    if (!response.ok) {
      throw new Error('Failed to create page');
    }
    
    const data = await response.json();
    return {
      id: data.id,
      title: title,
      url: data.url,
      createdTime: data.created_time,
      lastEditedTime: data.last_edited_time,
    };
  } catch (error) {
    console.error('Failed to create Notion page:', error);
    return null;
  }
};

/**
 * Disconnect Notion integration
 */
export const disconnectNotion = (): NotionIntegration => {
  return {
    enabled: false,
    accessToken: undefined,
    workspaceId: undefined,
    workspaceName: undefined,
    databaseId: undefined,
    lastSync: undefined,
  };
};

/**
 * Export fieldbook to Notion
 */
export const exportFieldbookToNotion = async (
  accessToken: string,
  databaseId: string,
  jobName: string,
  fieldbookEntries: string[]
): Promise<NotionPage | null> => {
  const title = `${jobName} - Fieldbook ${new Date().toLocaleDateString()}`;
  const content = fieldbookEntries.join('\n\n');
  
  return createNotionPage(accessToken, databaseId, title, content);
};
