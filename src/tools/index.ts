import type { Tool } from './types';
import type { ToolId } from '../core/editor';
import { brushTool, eraserTool, fillTool, eyedropperTool } from './paintTools';
import { selectTool } from './selectTool';
import { stampTool, textTool, shapeTool, pathTool, tokenTool } from './createTools';
import { wallTool, lightTool, noteTool, measureTool, panTool } from './vttTools';
import { gridAlignTool } from './gridAlignTool';

export const TOOLS: Tool[] = [
  selectTool, brushTool, eraserTool, fillTool, stampTool, textTool, shapeTool,
  pathTool, wallTool, lightTool, noteTool, tokenTool, measureTool, eyedropperTool, panTool,
  gridAlignTool,
];

const byId = new Map<ToolId, Tool>(TOOLS.map((t) => [t.id, t]));

export function getTool(id: ToolId): Tool {
  return byId.get(id) || selectTool;
}

export * from './types';
export { stampSettings, textSettings, shapeSettings, pathSettings, tokenSettings } from './createTools';
export { wallSettings, lightSettings, LIGHT_PRESETS, pickVttHandle } from './vttTools';
export { gridAlignSettings } from './gridAlignTool';
