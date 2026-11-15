import type { ComponentProps, ReactNode } from "react";

export interface AppShellProps extends ComponentProps<"div"> {
  variant?: "showcase" | "admin" | "form" | "game";
  brand?: ReactNode;
  navigation?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
}

/** 页面唯一主内容容器；导航在窄屏保持可见并自动换行。 */
export function AppShell({ variant = "showcase", brand = "应用", navigation, actions, footer, children, className, ...props }: AppShellProps) {
  return (
    <div className={["app-shell", className].filter(Boolean).join(" ")} data-variant={variant} {...props}>
      <a className="skip-link" href="#main-content">跳转到主要内容</a>
      <header className="app-shell-header">
        <div className="app-shell-brand">{brand}</div>
        {navigation && <nav className="app-shell-navigation" aria-label="主导航">{navigation}</nav>}
        {actions && <div className="app-shell-actions">{actions}</div>}
      </header>
      <main id="main-content" className="app-shell-main" tabIndex={-1}>{children}</main>
      {footer && <footer className="app-shell-footer">{footer}</footer>}
    </div>
  );
}
