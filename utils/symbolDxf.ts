import Drawing from 'dxf-writer';
import { type CustomSymbol } from '../types';

// Simple SVG path parser for M, L, H, V, Z (absolute coordinates)
function parseSvgPath(pathData: string) {
    const commands = pathData.match(/[a-zA-Z][^a-zA-Z]*/g) || [];
    const polylines: { vertices: { x: number, y: number }[], closed: boolean }[] = [];
    let currentPolyline: { vertices: { x: number, y: number }[], closed: boolean } | null = null;
    let currentPoint = { x: 0, y: 0 };

    commands.forEach((command: string) => {
        const type = command.charAt(0);
        const args = (command.substring(1).trim().match(/[-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?/g) || []).map(parseFloat);

        switch (type) {
            case 'M':
                currentPolyline = { vertices: [], closed: false };
                polylines.push(currentPolyline);
                for (let i = 0; i < args.length; i += 2) {
                    const p = { x: args[i], y: args[i + 1] };
                    if (i === 0) {
                        currentPolyline.vertices.push(p);
                    } else {
                        // Implicit L command
                        currentPolyline.vertices.push(p);
                    }
                    currentPoint = p;
                }
                break;
            case 'L':
                 for (let i = 0; i < args.length; i += 2) {
                    const p = { x: args[i], y: args[i + 1] };
                    if (currentPolyline) {
                        currentPolyline.vertices.push(p);
                    }
                    currentPoint = p;
                }
                break;
            case 'H':
                args.forEach(x => {
                    const p = { x: x, y: currentPoint.y };
                     if (currentPolyline) {
                        currentPolyline.vertices.push(p);
                    }
                    currentPoint = p;
                });
                break;
            case 'V':
                args.forEach(y => {
                    const p = { x: currentPoint.x, y: y };
                     if (currentPolyline) {
                        currentPolyline.vertices.push(p);
                    }
                    currentPoint = p;
                });
                break;
            case 'Z':
            case 'z':
                if (currentPolyline) {
                    currentPolyline.closed = true;
                }
                break;
        }
    });
    return polylines;
}

export function exportSymbolsToDxf(symbols: CustomSymbol[]): string {
    const d = new Drawing();

    symbols.forEach(symbol => {
        try {
            const vb = symbol.viewBox.split(' ').map(Number);
            if (vb.length !== 4) return;

            const [vbX, vbY, vbW, vbH] = vb;
            const centerX = vbX + vbW / 2;
            const centerY = vbY + vbH / 2;
            
            // Sanitize block name for DXF (alphanumeric, -, _, $)
            const blockName = symbol.name.replace(/[^a-zA-Z0-9_\-$]/g, '_');

            // FIX: The type definition for 'dxf-writer' appears to be missing the 'addBlock' method.
            // Casting to 'any' to bypass the TypeScript error and use the library's fluent API,
            // which returns a Block object with its own drawing methods.
            const block = (d as any).addBlock(blockName);
            
            const polylines = parseSvgPath(symbol.svgPath);

            polylines.forEach(polyline => {
                // Center the geometry around (0,0) and flip Y axis for DXF
                const vertices = polyline.vertices.map(p => [p.x - centerX, -(p.y - centerY)] as [number, number]);
                if (vertices.length > 1) {
                    // FIX: Geometry is now drawn on the returned block object, not the main drawing `d`.
                    block.drawPolyline(vertices, polyline.closed);
                }
            });

        } catch (e) {
            console.error(`Failed to process symbol "${symbol.name}" for DXF export:`, e);
        }
    });

    return d.toDxfString();
}