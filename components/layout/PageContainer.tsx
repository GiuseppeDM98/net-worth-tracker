import { cn } from '@/lib/utils';

interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
}

export function PageContainer({ children, className }: PageContainerProps) {
  return (
    <div className={cn('max-w-[1600px] mx-auto w-full space-y-4 desktop:space-y-6 max-desktop:portrait:pb-20', className)}>
      {children}
    </div>
  );
}
