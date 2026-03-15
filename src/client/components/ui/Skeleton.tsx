import './Skeleton.css';

type SkeletonVariant = 'text' | 'block' | 'circle';

interface SkeletonProps {
  variant?: SkeletonVariant;
  width?: string | number;
  height?: string | number;
  class?: string;
}

export function Skeleton({
  variant = 'block',
  width,
  height,
  class: className = '',
}: SkeletonProps) {
  const style: Record<string, string> = {};
  if (width !== undefined) style.width = typeof width === 'number' ? `${width}px` : width;
  if (height !== undefined) style.height = typeof height === 'number' ? `${height}px` : height;

  return (
    <div
      class={`skeleton skeleton--${variant} ${className}`.trim()}
      style={style}
      role="status"
      aria-label="Loading"
    />
  );
}
