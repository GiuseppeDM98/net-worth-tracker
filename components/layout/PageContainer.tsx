import { cn } from '@/lib/utils';

interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * The root of every page, 1920px wide: a Tile Grid is a bento, and a bento uses width — at
 * 1600px a 27" monitor left a third of the main area empty on both sides (DESIGN.md → The
 * Tile Grid Rule). There is ONE width because every page is a tile page; the 1600px width of
 * the pages not yet redesigned went with the last of them.
 */
export function PageContainer({ children, className }: PageContainerProps) {
  return (
    <div
      className={cn(
        'mx-auto w-full max-w-[1920px] space-y-4 desktop:space-y-4 max-desktop:portrait:pb-20',
        className,
      )}
    >
      {children}
    </div>
  );
}
