import { EmailDoc, EmailBlock, Problem, EmailVariable, BlockType, Theme } from '@lukeflow/email-core';
import * as react from 'react';
import { ReactNode } from 'react';

/** A fresh default block of `type`. */
declare function createBlock(type: BlockType): EmailBlock;
interface UseEmailBuilderResult {
    /** The current document. */
    doc: EmailDoc;
    /** Selected block index, or null. */
    selectedIndex: number | null;
    /** The selected block, or null. */
    selectedBlock: EmailBlock | null;
    /** Structural + variable-contract problems. */
    problems: readonly Problem[];
    /** True when any error-severity problem exists (gates check-in). */
    hasErrors: boolean;
    /** The reconciled typed variable contract. */
    variables: EmailVariable[];
    /** Select a block by index (or clear). */
    select: (index: number | null) => void;
    /** Insert a new default block of `type` at `at` (default: end); selects it. */
    addBlock: (type: BlockType, at?: number) => void;
    /** Remove the block at `index`. */
    removeBlock: (index: number) => void;
    /** Move a block from → to. */
    moveBlock: (from: number, to: number) => void;
    /** Duplicate the block at `index` (inserted just after; selects the copy). */
    duplicateBlock: (index: number) => void;
    /** Merge `patch` into the block at `index` (type is preserved). */
    updateBlock: (index: number, patch: Record<string, unknown>) => void;
    /** Patch the theme. */
    setTheme: (patch: Partial<Theme>) => void;
    /** Set the subject line. */
    setSubject: (subject: string) => void;
    /** Set the inbox preview text. */
    setPreheader: (preheader: string) => void;
    /** Replace the declared variable contract. */
    setVariables: (variables: EmailVariable[]) => void;
    /** Replace the whole doc (e.g. an AI-applied draft). */
    setDoc: (doc: EmailDoc) => void;
    undo: () => void;
    redo: () => void;
    canUndo: boolean;
    canRedo: boolean;
}
declare function useEmailBuilder(initialDoc?: EmailDoc): UseEmailBuilderResult;

interface EmailBuilderHandle {
    /** The current document. */
    getDoc: () => EmailDoc;
    /** Replace the whole document (e.g. an AI-applied draft). */
    setDoc: (doc: EmailDoc) => void;
    undo: () => void;
    redo: () => void;
    /** Current problems (errors gate check-in). */
    getProblems: () => readonly Problem[];
}
interface EmailBuilderProps {
    /** The document to start from (uncontrolled — the builder owns edits after mount). */
    initialDoc?: EmailDoc;
    /** Notified after every edit with the new doc. */
    onChange?: (doc: EmailDoc) => void;
    /** Read-only mode. */
    disabled?: boolean;
    /** Extra class on the root. */
    className?: string;
    /** Where settings live: inline third column ("panel", default) or a modal ("modal"). */
    settings?: "panel" | "modal";
    /** An aside column (e.g. AI-assist), shown as the third column in "modal" mode. */
    aside?: ReactNode;
    /** Renders the live preview for the current doc (host-provided so the builder stays
     *  decoupled from react-email — the host can lazy-load it). Receives an optional
     *  `values` map: when present, the renderer should merge {{vars}} with these values
     *  (the actual recipient email); when absent, {{vars}} stay literal. Omit the whole
     *  prop to hide the Preview button. */
    renderPreview?: (doc: EmailDoc, values?: Record<string, string>) => ReactNode;
    /** Optional test-data generator (e.g. an AI sampler). When provided, the preview
     *  shows a "Generate sample values" button that fills the variable inputs. Returns a
     *  name→value map; the builder stays backend-agnostic. */
    onGenerateTestData?: (doc: EmailDoc) => Promise<Record<string, string>>;
    /** Optional compiler for the preview's HTML source view. When provided, the preview
     *  gains a "HTML" tab showing the compiled email HTML (with `values` merged when the
     *  operator is merging sample data). Host-provided so the builder stays decoupled
     *  from the renderer. Omit to hide the HTML tab. */
    getPreviewHtml?: (doc: EmailDoc, values?: Record<string, string>) => Promise<string>;
}
declare const EmailBuilder: react.ForwardRefExoticComponent<EmailBuilderProps & react.RefAttributes<EmailBuilderHandle>>;

declare function Problems({ problems, onSelectBlock }: {
    problems: readonly Problem[];
    onSelectBlock: (index: number) => void;
}): react.JSX.Element;

declare function PreviewModal({ doc, renderPreview, onGenerateTestData, getPreviewHtml, onClose, }: {
    doc: EmailDoc;
    renderPreview: (doc: EmailDoc, values?: Record<string, string>) => ReactNode;
    onGenerateTestData?: (doc: EmailDoc) => Promise<Record<string, string>>;
    getPreviewHtml?: (doc: EmailDoc, values?: Record<string, string>) => Promise<string>;
    onClose: () => void;
}): react.JSX.Element;

declare function Modal({ title, onClose, children, wide }: {
    title: string;
    onClose: () => void;
    children: ReactNode;
    wide?: boolean;
}): react.JSX.Element;

interface SettingsPanelProps {
    selectedBlock: EmailBlock | null;
    selectedIndex: number | null;
    theme: Theme;
    contract: EmailVariable[];
    usedNames: Set<string>;
    onUpdateBlock: (patch: Record<string, unknown>) => void;
    onUpdateTheme: (patch: Partial<Theme>) => void;
    onUpdateVariables: (next: EmailVariable[]) => void;
    disabled?: boolean;
}
declare function SettingsPanel({ selectedBlock, selectedIndex, theme, contract, usedNames, onUpdateBlock, onUpdateTheme, onUpdateVariables, disabled, }: SettingsPanelProps): react.JSX.Element;

declare function BlockEditor({ block, onUpdate, disabled }: {
    block: EmailBlock;
    onUpdate: (patch: Record<string, unknown>) => void;
    disabled?: boolean;
}): react.JSX.Element;

declare function ThemeEditor({ theme, onChange, disabled }: {
    theme: Theme;
    onChange: (patch: Partial<Theme>) => void;
    disabled?: boolean;
}): react.JSX.Element;

declare function VariablesEditor({ contract, usedNames, onChange, disabled }: {
    contract: EmailVariable[];
    usedNames: Set<string>;
    onChange: (next: EmailVariable[]) => void;
    disabled?: boolean;
}): react.JSX.Element;

declare const BLOCK_ICONS: Record<BlockType, ReactNode>;
type BlockMeta = {
    type: BlockType;
    label: string;
    hint: string;
};
declare const BLOCK_META: readonly BlockMeta[];
/** A one-line summary of a block's content for the canvas row. */
declare function blockSummary(block: EmailBlock): string;

/**
 * @lukeflow/email-builder — the reference React email-template builder for
 * @lukeflow/email-core.
 *
 * {@link useEmailBuilder} is the headless controller (doc state + selection +
 * undo/redo + block/theme/variable edit actions). The full UI (palette · canvas ·
 * settings · Problems · live preview) is built on it in later stages.
 */
declare const VERSION = "0.1.0-alpha.0";

export { BLOCK_ICONS, BLOCK_META, BlockEditor, type BlockMeta, EmailBuilder, type EmailBuilderHandle, type EmailBuilderProps, Modal, PreviewModal, Problems, SettingsPanel, type SettingsPanelProps, ThemeEditor, type UseEmailBuilderResult, VERSION, VariablesEditor, blockSummary, createBlock, useEmailBuilder };
