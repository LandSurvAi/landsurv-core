/**
 * Fired after the agent sidebar collapses, expands, or is resized. The command
 * bar listens so its body-portaled agent socket can re-anchor after a layout
 * change that moves the bar without changing its size.
 */
export const AGENT_SIDEBAR_LAYOUT_EVENT = 'landsurv:agent-sidebar-layout';
