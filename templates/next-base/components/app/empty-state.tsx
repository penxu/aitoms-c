import type { ComponentProps, ReactNode } from "react";

export interface EmptyStateProps extends Omit<ComponentProps<"div">, "title"> {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ title, description, icon, action, className, ...props }: EmptyStateProps) {
  return (
    <div className={["empty-state", className].filter(Boolean).join(" ")} role="status" aria-live="polite" {...props}>
      {icon && <div className="empty-state-icon" aria-hidden="true">{icon}</div>}
      <h2 className="empty-state-title">{title}</h2>
      {description && <p className="page-description">{description}</p>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}
