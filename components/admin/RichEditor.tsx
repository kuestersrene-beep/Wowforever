"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";

// Kleiner Text-Editor (Tiptap) für die bearbeitbaren Seitentexte: fett,
// kursiv, Links, Aufzählungen, Absätze. Mehr erlaubt der HTML-Filter
// beim Speichern ohnehin nicht (lib/sanitize.ts).
export default function RichEditor({
  initialHtml,
  onChange,
}: {
  initialHtml: string;
  onChange: (html: string) => void;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        code: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        strike: false,
      }),
      Link.configure({ openOnClick: false, autolink: true }),
    ],
    content: initialHtml,
    // Kein Rendern auf dem Server - sonst passt das HTML beim Laden im
    // Browser nicht zusammen (Next.js).
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "rich-text min-h-[5rem] rounded-b-lg border border-t-0 border-gold/30 bg-panel px-3 py-2 text-sm text-parchment focus:outline-none",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  if (!editor) {
    return <div className="h-28 rounded-lg border border-gold/30 bg-panel" />;
  }

  return (
    <div>
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const button = (active: boolean) =>
    `min-w-[2.25rem] rounded px-2 py-1 text-sm transition ${
      active ? "bg-gold/30 text-gold-light" : "text-slate-300 hover:bg-gold/10"
    }`;

  const setLink = () => {
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link-Adresse (https://…)", previous ?? "https://");
    if (url === null) return;
    if (url.trim() === "" || url.trim() === "https://") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  };

  return (
    <div className="flex flex-wrap gap-1 rounded-t-lg border border-gold/30 bg-ink/40 p-1">
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={`${button(editor.isActive("bold"))} font-bold`}
        title="Fett"
      >
        B
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={`${button(editor.isActive("italic"))} italic`}
        title="Kursiv"
      >
        I
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={button(editor.isActive("bulletList"))}
        title="Aufzählung"
      >
        • Liste
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={button(editor.isActive("orderedList"))}
        title="Nummerierte Liste"
      >
        1. Liste
      </button>
      <button
        type="button"
        onClick={setLink}
        className={button(editor.isActive("link"))}
        title="Link einfügen oder ändern"
      >
        🔗 Link
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        className={`${button(false)} disabled:opacity-40`}
        title="Rückgängig"
      >
        ↶
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        className={`${button(false)} disabled:opacity-40`}
        title="Wiederholen"
      >
        ↷
      </button>
    </div>
  );
}
