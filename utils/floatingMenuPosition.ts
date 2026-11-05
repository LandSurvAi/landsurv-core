export interface FlippingMenuInput {
  x: number;
  y: number;
  containerWidth: number;
  containerHeight: number;
  menuWidth: number;
  menuHeight: number;
  margin?: number;
}

export interface FlippingMenuPlacement {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
}

/**
 * Position a floating menu at a pointer, flipping it left/up when the preferred
 * direction would leave the container. The menu is also clamped to the
 * container and given a max height so it can scroll rather than be cut off.
 */
export function placeFlippingMenu({
  x,
  y,
  containerWidth,
  containerHeight,
  menuWidth,
  menuHeight,
  margin = 8,
}: FlippingMenuInput): FlippingMenuPlacement {
  const safeWidth = Math.max(0, containerWidth);
  const safeHeight = Math.max(0, containerHeight);
  const width = Math.min(Math.max(0, menuWidth), Math.max(0, safeWidth - margin * 2));
  const maxHeight = Math.min(Math.max(0, menuHeight), Math.max(0, safeHeight - margin * 2));

  const overflowsRight = x + width + margin > safeWidth;
  const availableAbove = y - margin;
  const availableBelow = safeHeight - y - margin;
  const overflowsBottom = availableBelow < maxHeight && availableAbove > availableBelow;

  const maxLeft = Math.max(margin, safeWidth - width - margin);
  const maxTop = Math.max(margin, safeHeight - maxHeight - margin);

  return {
    left: Math.max(margin, Math.min(overflowsRight ? x - width : x, maxLeft)),
    top: Math.max(margin, Math.min(overflowsBottom ? y - maxHeight : y, maxTop)),
    width,
    maxHeight,
  };
}
