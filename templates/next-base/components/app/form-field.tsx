import { cloneElement, type ComponentProps, type ReactElement, type ReactNode } from "react";

type ControlProps = Pick<ComponentProps<"input">, "id" | "required" | "aria-describedby" | "aria-invalid">;
export interface FormFieldProps extends Omit<ComponentProps<"div">, "children"> {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: ReactElement<ControlProps>;
}

/** children传一个Input/input/select/textarea，自动连接标签、提示与错误。 */
export function FormField({ id, label, hint, error, required, children, className, ...props }: FormFieldProps) {
  const isRequired = required ?? children.props.required;
  const describedBy = [children.props["aria-describedby"], hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={["form-field", className].filter(Boolean).join(" ")} {...props}>
      <label className="form-label" htmlFor={id}>{label}{isRequired && <span aria-hidden="true"> *</span>}</label>
      {hint && <p id={`${id}-hint`} className="form-hint">{hint}</p>}
      {cloneElement(children, { id, required: isRequired, "aria-describedby": describedBy, "aria-invalid": error ? true : children.props["aria-invalid"] })}
      {error && <p id={`${id}-error`} className="form-error" role="alert">{error}</p>}
    </div>
  );
}
