/**
 * Fired after the agent sidebar collapses, expands, or is resized. The command
 * bar listens so its body-portaled agent socket can re-anchor after a layout
 * change that moves the bar without changing its size.
 */
export const AGENT_SIDEBAR_LAYOUT_EVENT = 'landsurv:agent-sidebar-layout';

/** Fired when the Quick Thought card opens or closes. */
export const QUICK_THOUGHT_LAYOUT_EVENT = 'landsurv:quick-thought-layout';

/** Fired when the bottom command drawer expands or collapses. */
export const COMMAND_DOCK_LAYOUT_EVENT = 'landsurv:command-dock-layout';
