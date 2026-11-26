import React from 'react';
import type ReactMarkdown from 'react-markdown';
import { TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { cn } from '@/lib/utils';

type MarkdownComponents = NonNullable<React.ComponentProps<typeof ReactMarkdown>['components']>;

/**
 * True for the `code` of a fenced block, false for an inline span. react-markdown hands both to the
 * same renderer: a fence with a language carries `language-*`, and a fence's text always ends with
 * its newline, which an inline span never holds.
 */
function isBlockCode(className: string | undefined, children: React.ReactNode): boolean {
  if (className?.startsWith('language-')) return true;
  return React.Children.toArray(children).some((child) => typeof child === 'string' && child.includes('\n'));
}

/**
 * The renderers of generated Markdown (2026-11-25): the Assistente's answers and «Analizza con AI»
 * in Rendimenti. The app has no typography plugin, so a `prose` class styles nothing: every element
 * the model writes takes its classes here (DESIGN → generated Markdown). Headings keep the body's
 * colour, never the accent (The AI-Accent Rule). Module-level, as ReactMarkdown wants: a stable map
 * keeps the tree mounted across renders. A surface that intercepts `pre` (the chat's cards) spreads
 * this map and adds its own.
 */
export const MARKDOWN_PROSE_COMPONENTS: MarkdownComponents = {
  h1: ({ children }) => <h1 className="mt-5 mb-2 text-[15px] font-semibold leading-snug text-foreground first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-5 mb-2 text-[15px] font-semibold leading-snug text-foreground first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-4 mb-1.5 text-sm font-semibold text-foreground first:mt-0">{children}</h3>,
  h4: ({ children }) => <h4 className="mt-4 mb-1.5 text-sm font-semibold text-foreground first:mt-0">{children}</h4>,
  p: ({ children }) => <p className="my-2 text-sm leading-[1.6] text-foreground first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5 text-sm leading-[1.6] marker:text-muted-foreground">{children}</ul>,
  ol: ({ children, start }) => (
    <ol start={start} className="my-2 list-decimal space-y-1 pl-5 text-sm leading-[1.6] marker:font-mono marker:text-muted-foreground">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="pl-1 [&>p]:my-0">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer noopener" className="underline underline-offset-2 hover:text-foreground">
      {children}
    </a>
  ),
  blockquote: ({ children }) => <blockquote className="my-3 border-l-2 border-border pl-3 text-muted-foreground">{children}</blockquote>,
  hr: () => <hr className="my-4 border-border" />,
  code: ({ children, className }) =>
    isBlockCode(className, children) ? (
      <code className={className}>{children}</code>
    ) : (
      <code className="rounded bg-muted px-1 py-0.5 font-mono text-[12px]">{children}</code>
    ),
  table: ({ children }) => (
    <div className="my-3 w-full overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="border-b border-border">{children}</thead>,
  th: ({ children }) => (
    <th scope="col" className={cn(TILE_SUB_EYEBROW_CLASS, 'px-3 py-2 text-left')}>
      {children}
    </th>
  ),
  td: ({ children }) => <td className="px-3 py-2 text-[13px] text-foreground [&:has(>strong)]:font-mono">{children}</td>,
  tr: ({ children }) => <tr className="border-b border-border last:border-0">{children}</tr>,
};
