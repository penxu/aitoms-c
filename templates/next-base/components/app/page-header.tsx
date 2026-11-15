import type { ComponentProps, ReactNode } from "react";

export interface PageHeaderProps extends Omit<ComponentProps<"header">, "title"> {
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ title, eyebrow, description, actions, className, ...props }: PageHeaderProps) {
  return (
    <header className={["page-header", className].filter(Boolean).join(" ")} {...props}>
      <div className="page-header-copy">
        {eyebrow && <p className="page-eyebrow">{eyebrow}</p>}
        <h1 className="page-title">{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </header>
  );
}
