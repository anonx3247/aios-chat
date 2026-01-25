import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

interface MarkdownProps {
  content: string;
  className?: string;
}

const components: Components = {
  // Headings
  h1: ({ children }) => (
    <h1 className="mb-4 mt-6 text-2xl font-bold first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-3 mt-5 text-xl font-bold first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-2 mt-4 text-lg font-semibold first:mt-0">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="mb-2 mt-3 text-base font-semibold first:mt-0">{children}</h4>
  ),

  // Paragraphs
  p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,

  // Lists
  ul: ({ children }) => (
    <ul className="mb-3 ml-4 list-disc space-y-1 last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-3 ml-4 list-decimal space-y-1 last:mb-0">{children}</ol>
  ),
  li: ({ children }) => <li className="pl-1">{children}</li>,

  // Code
  code: ({ className, children }) => {
    const isInline = className === undefined || className === "";
    if (isInline) {
      return (
        <code
          className="rounded px-1.5 py-0.5 font-mono text-sm"
          style={{ background: "var(--bg-hover)", color: "var(--fg-accent)" }}
        >
          {children}
        </code>
      );
    }
    const language = className.replace("language-", "");
    return (
      <code className={`language-${language}`}>{children}</code>
    );
  },
  pre: ({ children }) => (
    <pre
      className="mb-3 overflow-x-auto rounded-lg p-4 font-mono text-sm last:mb-0"
      style={{ background: "var(--bg-secondary)" }}
    >
      {children}
    </pre>
  ),

  // Blockquotes
  blockquote: ({ children }) => (
    <blockquote
      className="mb-3 border-l-4 pl-4 italic last:mb-0"
      style={{ borderColor: "var(--border-secondary)", color: "var(--fg-secondary)" }}
    >
      {children}
    </blockquote>
  ),

  // Links
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-2"
      style={{ color: "var(--fg-accent)" }}
    >
      {children}
    </a>
  ),

  // Tables
  table: ({ children }) => (
    <div className="mb-3 overflow-x-auto last:mb-0">
      <table className="min-w-full border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="border-b" style={{ borderColor: "var(--border-secondary)", background: "var(--bg-tertiary)" }}>{children}</thead>
  ),
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => (
    <tr className="border-b last:border-0" style={{ borderColor: "var(--border-primary)" }}>{children}</tr>
  ),
  th: ({ children }) => (
    <th className="px-3 py-2 text-left text-sm font-semibold">{children}</th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2 text-sm">{children}</td>
  ),

  // Horizontal rule
  hr: () => <hr className="my-4" style={{ borderColor: "var(--border-secondary)" }} />,

  // Strong and emphasis
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,

  // Strikethrough
  del: ({ children }) => <del className="line-through opacity-70">{children}</del>,
};

export function Markdown({ content, className = "" }: MarkdownProps) {
  return (
    <div className={`leading-relaxed ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
