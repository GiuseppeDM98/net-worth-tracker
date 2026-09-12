'use client';

import Link from 'next/link';
import type { ComponentProps, MouseEvent } from 'react';
import { useSceneNavigation } from '@/lib/hooks/useSceneNavigation';

type SceneLinkProps = ComponentProps<typeof Link> & { href: string };

/**
 * A `next/link` whose plain left click runs the navigation as a page scene
 * (`useSceneNavigation`). Everything else stays the link's: prefetching, the right-click menu,
 * a modifier click opening a new tab, a `target`, and the caller's own `onClick` (a drawer
 * closing itself), which runs first.
 */
export function SceneLink({ href, onClick, ...rest }: SceneLinkProps) {
  const navigate = useSceneNavigation();

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    const isPlainLeftClick = event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
    if (!isPlainLeftClick || rest.target === '_blank') return;
    event.preventDefault();
    navigate(href);
  };

  return <Link href={href} onClick={handleClick} {...rest} />;
}
