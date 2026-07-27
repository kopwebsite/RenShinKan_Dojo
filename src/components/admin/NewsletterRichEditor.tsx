import { type ReactNode, useEffect, useState } from "react";
import Link from "@tiptap/extension-link";
import Paragraph from "@tiptap/extension-paragraph";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Type,
  Undo2,
} from "lucide-react";
import type { NewsletterDocument } from "../../../shared/newsletter";

const NewsletterParagraph = Paragraph.extend({
  addAttributes() {
    return {
      variant: {
        default: "default",
        parseHTML: (element) => element.getAttribute("data-variant") === "cta" ? "cta" : "default",
        renderHTML: (attributes) => attributes.variant === "cta" ? { "data-variant": "cta" } : {},
      },
    };
  },
});

export function plainTextNewsletterDocument(body: string): NewsletterDocument {
  return {
    type: "doc",
    content: (body || "").split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean).map((text) => ({
      type: "paragraph",
      attrs: { variant: "default" },
      content: [{ type: "text", text }],
    })),
  };
}

function ToolbarButton({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className="newsletter-editor-tool"
    >
      {children}
    </button>
  );
}

export function NewsletterRichEditor({
  value,
  fallbackBody,
  onChange,
}: {
  value?: NewsletterDocument;
  fallbackBody: string;
  onChange: (document: NewsletterDocument) => void;
}) {
  const [linkEditorOpen, setLinkEditorOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ paragraph: false, heading: { levels: [2, 3] } }),
      NewsletterParagraph,
      Link.configure({ openOnClick: false, autolink: true, defaultProtocol: "https" }),
      Placeholder.configure({ placeholder: "Begin with the most important update…" }),
    ],
    content: value ?? plainTextNewsletterDocument(fallbackBody),
    editorProps: {
      attributes: {
        class: "newsletter-editor-writing",
        "aria-label": "Newsletter body",
      },
    },
    onUpdate({ editor: currentEditor }) {
      onChange(currentEditor.getJSON() as NewsletterDocument);
    },
  });

  useEffect(() => {
    if (!editor || editor.isFocused || !value) return;
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(value)) editor.commands.setContent(value, false);
  }, [editor, value]);

  if (!editor) return <div className="newsletter-editor-loading" role="status">Loading the writing editor…</div>;

  const applyLink = () => {
    const href = linkUrl.trim();
    if (!href) {
      editor.chain().focus().unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    setLinkEditorOpen(false);
  };

  const toggleCta = () => {
    const next = editor.getAttributes("paragraph").variant === "cta" ? "default" : "cta";
    editor.chain().focus().updateAttributes("paragraph", { variant: next }).run();
  };

  return (
    <div className="newsletter-editor-shell">
      <div className="newsletter-editor-toolbar" role="toolbar" aria-label="Writing tools">
        <ToolbarButton label="Undo" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}><Undo2 size={17} /></ToolbarButton>
        <ToolbarButton label="Redo" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}><Redo2 size={17} /></ToolbarButton>
        <span aria-hidden="true" className="newsletter-editor-toolbar__divider" />
        <ToolbarButton label="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={17} /></ToolbarButton>
        <ToolbarButton label="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={17} /></ToolbarButton>
        <ToolbarButton label="Heading" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Type size={17} /></ToolbarButton>
        <ToolbarButton label="Bulleted list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}><List size={17} /></ToolbarButton>
        <ToolbarButton label="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={17} /></ToolbarButton>
        <ToolbarButton label="Quotation" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote size={17} /></ToolbarButton>
        <ToolbarButton label="Divider" onClick={() => editor.chain().focus().setHorizontalRule().run()}><Minus size={17} /></ToolbarButton>
        <ToolbarButton label="Link" active={editor.isActive("link")} onClick={() => {
          setLinkUrl(editor.getAttributes("link").href || "");
          setLinkEditorOpen((open) => !open);
        }}><LinkIcon size={17} /></ToolbarButton>
        <button
          type="button"
          aria-pressed={editor.getAttributes("paragraph").variant === "cta"}
          className="newsletter-editor-tool newsletter-editor-tool--text"
          onClick={toggleCta}
        >
          Button style
        </button>
      </div>
      {linkEditorOpen ? (
        <div className="newsletter-link-editor">
          <label htmlFor="newsletter-editor-link">Link address</label>
          <input
            id="newsletter-editor-link"
            value={linkUrl}
            onChange={(event) => setLinkUrl(event.target.value)}
            placeholder="https://… or /contact"
          />
          <button type="button" onClick={applyLink}>Apply link</button>
          <button type="button" onClick={() => { editor.chain().focus().unsetLink().run(); setLinkEditorOpen(false); }}>Remove</button>
        </div>
      ) : null}
      <EditorContent editor={editor} />
    </div>
  );
}
