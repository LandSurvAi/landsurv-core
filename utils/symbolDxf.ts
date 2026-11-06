import Drawing from 'dxf-writer';
import { type CustomSymbol } from '../types';
import {
    extractSymbolCadPrimitives,
    drawPrimitivesToDxfWriter,
    primitivesToDxfEntities,
} from './symbolCadPrimitives';

export function exportSymbolsToDxf(symbols: CustomSymbol[]): string {
    const d = new Drawing();

    symbols.forEach(symbol => {
        try {
            // Sanitize block name for DXF (alphanumeric, -, _, $)
            const blockName = symbol.name.replace(/[^a-zA-Z0-9_\-$]/g, '_');

            const block = (d as any).addBlock(blockName);
            const primitives = extractSymbolCadPrimitives(symbol, {
                originX: 0,
                originY: 0,
                scale: symbol.scale || 1,
            });

            drawPrimitivesToDxfWriter(block, primitives);

            // If block didn't support drawCircle/drawArc/drawText on dxf-writer's Block prototype,
            // fall back to drawing polylines for circles/arcs on the block object.
            for (const prim of primitives) {
                if (prim.type === 'circle' && typeof block.drawCircle !== 'function' && typeof block.drawPolyline === 'function') {
                    const pts: Array<[number, number]> = [];
                    const segs = 24;
                    for (let i = 0; i < segs; i++) {
                        const a = (2 * Math.PI * i) / segs;
                        pts.push([prim.cx + prim.r * Math.cos(a), prim.cy + prim.r * Math.sin(a)]);
                    }
                    block.drawPolyline(pts, true);
                } else if (prim.type === 'arc' && typeof block.drawArc !== 'function' && typeof block.drawPolyline === 'function') {
                    const pts: Array<[number, number]> = [];
                    const segs = 16;
                    const sRad = (prim.startAngleDeg * Math.PI) / 180;
                    let eRad = (prim.endAngleDeg * Math.PI) / 180;
                    if (eRad < sRad) eRad += 2 * Math.PI;
                    for (let i = 0; i <= segs; i++) {
                        const a = sRad + ((eRad - sRad) * i) / segs;
                        pts.push([prim.cx + prim.r * Math.cos(a), prim.cy + prim.r * Math.sin(a)]);
                    }
                    block.drawPolyline(pts, false);
                }
            }
        } catch (e) {
            console.error(`Failed to process symbol "${symbol.name}" for DXF export:`, e);
        }
    });

    let dxfStr = d.toDxfString();

    // Inject native CIRCLE, ARC, and TEXT entities into each BLOCK record if dxf-writer's Block omitted them
    for (const symbol of symbols) {
        const blockName = symbol.name.replace(/[^a-zA-Z0-9_\-$]/g, '_');
        const primitives = extractSymbolCadPrimitives(symbol, {
            originX: 0,
            originY: 0,
            scale: symbol.scale || 1,
        });
        const textPrims = primitives.filter(p => p.type === 'text');
        if (textPrims.length > 0) {
            const textDxf = primitivesToDxfEntities(textPrims, '0');
            const blockHeaderPattern = new RegExp(`(0\\r?\\nBLOCK[\\s\\S]*?\\r?\\n2\\r?\\n${blockName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\r?\\n[\\s\\S]*?)(0\\r?\\nENDBLK)`);
            if (blockHeaderPattern.test(dxfStr)) {
                dxfStr = dxfStr.replace(blockHeaderPattern, `$1${textDxf}\n$2`);
            }
        }
    }

    return dxfStr;
}