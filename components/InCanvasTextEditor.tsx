import React, { useEffect, useRef } from 'react';

export interface InCanvasTextEditorProps {
    value: string;
    /** Screen position of the text insertion point, relative to the canvas container. */
    left: number;
    top: number;
    fontSize: number;
    fontFamily: string;
    bold: boolean;
    italic: boolean;
    color: string;
    /** Line-height multiplier used by the canvas renderer. */
    lineHeight: number;
    /** True when creating a new entity. */
    isNew: boolean;
    onCommit: (value: string) => void;
    onCancel: () => void;
}

/**
 * In-place text editor that renders the text itself over the canvas instead of
 * a form field. The overlay uses the resolved annotation style and a
 * contentEditable surface with no border or background, so editing looks like
 * AutoCAD's in-canvas TEXT/MTEXT editing.
 *
 * Enter inserts a line; Ctrl/⌘+Enter or blur commits; Esc cancels.
 */
export const InCanvasTextEditor: React.FC<InCanvasTextEditorProps> = ({
    value,
    left,
    top,
    fontSize,
    fontFamily,
    bold,
    italic,
    color,
    lineHeight,
    isNew,
    onCommit,
    onCancel,
}) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const finishedRef = useRef(false);

    useEffect(() => {
        const editor = editorRef.current;
        if (!editor) return;

        // Keep the surface uncontrolled so React never moves the caret while
        // the user is typing. The parent only supplies the initial value.
        if (editor.textContent !== value) editor.textContent = value;
        editor.focus({ preventScroll: true });

        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
    }, [value]);

    const readValue = () => editorRef.current?.textContent ?? '';

    const insertPlainText = (text: string) => {
        const editor = editorRef.current;
        if (!editor) return;
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || !selection.anchorNode || !editor.contains(selection.anchorNode)) {
            editor.textContent = `${editor.textContent ?? ''}${text}`;
            return;
        }

        const range = selection.getRangeAt(0);
        range.deleteContents();
        const node = document.createTextNode(text);
        range.insertNode(node);
        range.setStartAfter(node);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
    };

    const commit = (allowEmpty = false) => {
        if (finishedRef.current) return;
        const text = readValue();
        // A canvas click can briefly blur a newly-created empty editor while
        // focus settles. Keep the TEXT tool alive rather than discarding it.
        if (!allowEmpty && isNew && !text.trim()) return;
        finishedRef.current = true;
        onCommit(text);
    };

    const cancel = () => {
        if (finishedRef.current) return;
        finishedRef.current = true;
        onCancel();
    };

    const lineHeightPx = Math.max(fontSize + 2, fontSize * lineHeight);
    // Approximate the CSS line-box offset from its top to the canvas baseline.
    const baselineOffset = (lineHeightPx - fontSize) / 2 + fontSize * 0.9;

    return (
        <div
            data-testid="in-canvas-text-editor"
            className="absolute z-40 select-text"
            style={{ left, top: Math.max(4, top - baselineOffset) }}
            onMouseDown={event => event.stopPropagation()}
            onDoubleClick={event => event.stopPropagation()}
            onWheel={event => event.stopPropagation()}
        >
            <div
                ref={editorRef}
                role="textbox"
                aria-multiline="true"
                aria-label={isNew ? 'New canvas text' : 'Edit canvas text'}
                data-testid="in-canvas-text-input"
                contentEditable
                suppressContentEditableWarning
                spellCheck={false}
                onInput={() => {
                    // Content is read directly from the DOM on commit.
                }}
                onPaste={event => {
                    event.preventDefault();
                    event.stopPropagation();
                    insertPlainText(event.clipboardData.getData('text/plain'));
                }}
                onKeyDown={event => {
                    if (event.key === 'Escape') {
                        event.preventDefault();
                        event.stopPropagation();
                        cancel();
                        return;
                    }
                    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                        event.preventDefault();
                        event.stopPropagation();
                        commit(true);
                        return;
                    }
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        event.stopPropagation();
                        insertPlainText('\n');
                        return;
                    }
                    // Let typing reach the editor without the canvas command
                    // shortcuts stealing letters.
                    event.stopPropagation();
                }}
                onBlur={() => commit()}
                style={{
                    display: 'inline-block',
                    minWidth: Math.max(2, fontSize * 0.55),
                    minHeight: `${lineHeightPx}px`,
                    margin: 0,
                    padding: 0,
                    border: 'none',
                    outline: 'none',
                    background: 'transparent',
                    boxShadow: 'none',
                    whiteSpace: 'pre',
                    overflow: 'visible',
                    verticalAlign: 'top',
                    fontFamily,
                    fontWeight: bold ? 700 : 400,
                    fontStyle: italic ? 'italic' : 'normal',
                    fontSize: `${fontSize}px`,
                    lineHeight: `${lineHeightPx}px`,
                    color,
                    caretColor: '#22d3ee',
                }}
            />
        </div>
    );
};

export default InCanvasTextEditor;
