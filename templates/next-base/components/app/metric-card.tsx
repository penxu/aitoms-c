import type { ComponentProps, ReactNode } from "react";

export interface MetricCardProps extends ComponentProps<"div"> {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
}

/** 数字与解释使用语义化定义列表，不伪造趋势或业务数据。 */
export function MetricCard({ label, value, detail, className, ...props }: MetricCardProps) {
  return (
    <div className={["metric-card", className].filter(Boolean).join(" ")} {...props}>
      <dl>
        <dt className="metric-label">{label}</dt>
        <dd className="metric-value">{value}</dd>
      </dl>
      {detail && <p className="metric-detail">{detail}</p>}
    </div>
  );
}
