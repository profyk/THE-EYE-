import { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  /** Legacy: plain text children for backwards-compat with existing callers */
  children?: ReactNode;
}

export default function EmptyState({
  icon,
  title,
  description,
  action,
  className = "",
  children,
}: EmptyStateProps) {
  if (!icon && !title && !description && !action) {
    return <p className={`text-sm text-muted py-6 text-center ${className}`}>{children}</p>;
  }

  return (
    <div className={`flex flex-col items-center justify-center text-center py-12 px-4 ${className}`}>
      {icon && (
        <div className="mb-4 text-muted/40">
          {icon}
        </div>
      )}
      {title && <p className="text-sm font-semibold text-text mb-1">{title}</p>}
      {description && <p className="text-sm text-muted max-w-xs">{description}</p>}
      {children && !title && !description && (
        <p className="text-sm text-muted">{children}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
