import * as webSearchTool from "./webSearchTool.js";
import * as mapsTool from "./mapsTool.js";
import * as llmTool from "./llmTool.js";
import * as emailTool from "./emailTool.js";
import * as calendarTool from "./calendarTool.js";
import * as bookingTool from "./bookingTool.js";

export const toolRegistry = {
  web_search: webSearchTool,
  maps: mapsTool,
  llm: llmTool,
  email: emailTool,
  calendar: calendarTool,
  booking: bookingTool,
};

export const getTool = (name) => toolRegistry[name];

export const getToolSchemas = () =>
  Object.entries(toolRegistry).map(([name, tool]) => ({
    name,
    ...tool.schema,
  }));

export const executeTool = async (name, params) => {
  const tool = toolRegistry[name];
  if (!tool) {
    return { success: false, error: "Unknown tool: " + name };
  }
  try {
    return await tool.execute(params || {});
  } catch (error) {
    return { success: false, error: error.message, tool: name };
  }
};
