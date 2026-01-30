/**
 * MCP Server Lifecycle
 *
 * Manages connections to MCP servers (filesystem, fetch, time, email).
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import * as os from "os";
import type { MCPServerConfig, MCPConnection, EmailConfig } from "../types.js";

// Active MCP connections
const mcpConnections = new Map<string, MCPConnection>();

// Email MCP state
let emailMCPConnected = false;
let lastEmailConfig: EmailConfig | null = null;

export function getMCPConnections(): Map<string, MCPConnection> {
  return mcpConnections;
}

export async function connectMCPServer(config: MCPServerConfig): Promise<MCPConnection | null> {
  try {
    console.log(`Connecting to MCP server: ${config.name}`);

    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: { ...process.env, ...config.env } as Record<string, string>,
    });

    const client = new Client(
      { name: "aios-chat", version: "0.1.0" },
      { capabilities: {} }
    );

    await client.connect(transport);

    const toolsResult = await client.listTools();
    const tools = new Map<string, { description: string; inputSchema: Record<string, unknown> }>();

    for (const mcpTool of toolsResult.tools) {
      tools.set(mcpTool.name, {
        description: mcpTool.description ?? "",
        inputSchema: mcpTool.inputSchema as Record<string, unknown>,
      });
    }

    console.log(`Connected to ${config.name}, tools: ${Array.from(tools.keys()).join(", ")}`);
    return { client, transport, tools };
  } catch (error) {
    console.error(`Failed to connect to MCP server ${config.name}:`, error);
    return null;
  }
}

export async function initializeMCPServers(): Promise<void> {
  const homeDir = os.homedir();

  const servers: MCPServerConfig[] = [
    {
      name: "filesystem",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", homeDir],
    },
    {
      name: "fetch",
      command: "uvx",
      args: ["mcp-server-fetch"],
    },
    {
      name: "time",
      command: "uvx",
      args: ["mcp-server-time"],
    },
  ];

  const results = await Promise.allSettled(
    servers.map(async (config) => {
      const connection = await connectMCPServer(config);
      if (connection) {
        mcpConnections.set(config.name, connection);
      }
      return { name: config.name, connected: !!connection };
    })
  );

  for (const result of results) {
    if (result.status === "rejected") {
      console.error("MCP server initialization failed:", result.reason);
    }
  }
}

export async function connectEmailMCPIfNeeded(emailConfig: EmailConfig | undefined): Promise<void> {
  if (!emailConfig?.address || !emailConfig?.password) {
    return;
  }

  const configChanged =
    !lastEmailConfig ||
    lastEmailConfig.address !== emailConfig.address ||
    lastEmailConfig.username !== emailConfig.username ||
    lastEmailConfig.password !== emailConfig.password ||
    lastEmailConfig.imapHost !== emailConfig.imapHost ||
    lastEmailConfig.imapPort !== emailConfig.imapPort ||
    lastEmailConfig.imapSecurity !== emailConfig.imapSecurity ||
    lastEmailConfig.smtpHost !== emailConfig.smtpHost ||
    lastEmailConfig.smtpPort !== emailConfig.smtpPort ||
    lastEmailConfig.smtpSecurity !== emailConfig.smtpSecurity ||
    lastEmailConfig.sslVerify !== emailConfig.sslVerify;

  if (emailMCPConnected && !configChanged) {
    return;
  }

  if (emailMCPConnected && mcpConnections.has("email")) {
    try {
      const connection = mcpConnections.get("email");
      if (connection) {
        await connection.transport.close();
        mcpConnections.delete("email");
      }
    } catch (error) {
      console.error("Error disconnecting email MCP server:", error);
    }
    emailMCPConnected = false;
  }

  const env: Record<string, string> = {
    EMAIL_ADDRESS: emailConfig.address,
    EMAIL_USERNAME: emailConfig.username || emailConfig.address,
    EMAIL_PASSWORD: emailConfig.password,
  };

  if (emailConfig.imapHost) env.IMAP_HOST = emailConfig.imapHost;
  if (emailConfig.imapPort) env.IMAP_PORT = emailConfig.imapPort;
  if (emailConfig.imapSecurity) env.IMAP_SECURITY = emailConfig.imapSecurity;
  if (emailConfig.smtpHost) env.SMTP_HOST = emailConfig.smtpHost;
  if (emailConfig.smtpPort) env.SMTP_PORT = emailConfig.smtpPort;
  if (emailConfig.smtpSecurity) env.SMTP_SECURITY = emailConfig.smtpSecurity;
  if (emailConfig.sslVerify === "false") env.SSL_VERIFY = "false";

  const emailServerConfig: MCPServerConfig = {
    name: "email",
    command: "npx",
    args: ["email-mcp"],
    env,
  };

  console.log(`Connecting to email MCP server for ${emailConfig.address}...`);
  console.log(
    "Email MCP env:",
    JSON.stringify(
      Object.fromEntries(
        Object.entries(env).map(([k, v]) => [k, k.includes("PASSWORD") ? "***" : v])
      )
    )
  );
  const connection = await connectMCPServer(emailServerConfig);
  if (connection) {
    mcpConnections.set("email", connection);
    emailMCPConnected = true;
    lastEmailConfig = { ...emailConfig };
    console.log(`Email MCP server connected with ${connection.tools.size} tools`);
  } else {
    console.error("Failed to connect email MCP server");
  }
}

export function resetEmailMCPState(): void {
  lastEmailConfig = null;
  emailMCPConnected = false;
}

export async function cleanupMCPServers(): Promise<void> {
  for (const [name, connection] of mcpConnections) {
    try {
      await connection.transport.close();
      console.log(`Disconnected from MCP server: ${name}`);
    } catch (error) {
      console.error(`Error disconnecting from ${name}:`, error);
    }
  }
  mcpConnections.clear();
}
