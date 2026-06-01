import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { getMcpUrl } from './encryptedCredentials';

/**
 * MCP Service - Connects to Supabase MCP server for direct database operations
 * Provides tools for the AI to access and manipulate database schema and data
 */

let mcpClient: Client | null = null;
let mcpConnecting = false;
let lastConnectionError: Error | null = null;

/**
 * Initialize MCP client connection to Supabase MCP server
 */
async function initializeMcpClient(): Promise<Client> {
  // If already connected, return existing client
  if (mcpClient) {
    return mcpClient;
  }

  // Prevent multiple simultaneous connection attempts
  if (mcpConnecting) {
    throw new Error('MCP connection already in progress');
  }

  try {
    mcpConnecting = true;

    const mcpUrl = await getMcpUrl();
    if (!mcpUrl) {
      throw new Error('MCP URL not configured');
    }

    const transport = new SSEClientTransport(new URL(mcpUrl));

    const client = new Client({
      name: 'PresensysAiCommandEngine',
      version: '1.0.0'
    });

    await client.connect(transport);
    mcpClient = client;
    lastConnectionError = null;

    console.log('✅ MCP client connected successfully to Supabase');
    return client;
  } catch (error) {
    lastConnectionError = error instanceof Error ? error : new Error(String(error));
    console.error('❌ Failed to connect MCP client:', lastConnectionError.message);
    throw lastConnectionError;
  } finally {
    mcpConnecting = false;
  }
}

/**
 * Disconnect MCP client
 */
export async function disconnectMcp(): Promise<void> {
  if (mcpClient) {
    try {
      // The SDK client doesn't expose a disconnect method directly,
      // but we can clear it to force reconnection
      mcpClient = null;
    } catch (error) {
      console.warn('Error during MCP disconnect:', error);
    }
  }
}

/**
 * Get or initialize MCP client
 */
export async function getMcpClient(): Promise<Client> {
  if (!mcpClient) {
    return initializeMcpClient();
  }
  return mcpClient;
}

/**
 * Check if MCP is available and configured
 */
export async function isMcpConfigured(): Promise<boolean> {
  try {
    const mcpUrl = await getMcpUrl();
    return !!mcpUrl;
  } catch {
    return false;
  }
}

/**
 * Get the last connection error
 */
export function getLastMcpError(): Error | null {
  return lastConnectionError;
}

/**
 * Fetch available tools from MCP server
 */
export async function listMcpTools(): Promise<Array<{
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}>> {
  try {
    const client = await getMcpClient();
    const toolsResponse = await client.listTools();

    return toolsResponse.tools.map(tool => ({
      name: tool.name,
      description: tool.description || '',
      inputSchema: tool.inputSchema as Record<string, unknown>
    }));
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('Failed to list MCP tools:', errorMsg);
    throw new Error(`Failed to list MCP tools: ${errorMsg}`);
  }
}

/**
 * Execute an MCP tool with given arguments
 */
export async function executeMcpTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  try {
    const client = await getMcpClient();
    const result = await client.callTool({
      name: toolName,
      arguments: args
    });

    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`Failed to execute MCP tool '${toolName}':`, errorMsg);
    throw new Error(`Failed to execute MCP tool '${toolName}': ${errorMsg}`);
  }
}

/**
 * Convert MCP tools into Vercel AI SDK tool format
 * This allows the AI model to use MCP tools through the Vercel SDK
 */
export async function getMcpToolsForAi(): Promise<Record<string, any>> {
  try {
    const tools = await listMcpTools();
    const aiTools: Record<string, any> = {};

    for (const tool of tools) {
      aiTools[tool.name] = {
        description: tool.description,
        parameters: tool.inputSchema || { type: 'object', properties: {} },
        execute: async (args: Record<string, unknown>) => {
          try {
            return await executeMcpTool(tool.name, args);
          } catch (error) {
            return {
              success: false,
              error: error instanceof Error ? error.message : String(error)
            };
          }
        }
      };
    }

    return aiTools;
  } catch (error) {
    console.error('Failed to prepare MCP tools for AI:', error);
    return {}; // Return empty tools map on failure
  }
}

/**
 * Check MCP server health
 */
export async function checkMcpHealth(): Promise<boolean> {
  try {
    const client = await getMcpClient();
    await client.listTools();
    return true;
  } catch (error) {
    console.warn('MCP health check failed:', error);
    mcpClient = null; // Reset client on failure
    return false;
  }
}
