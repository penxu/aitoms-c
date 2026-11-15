/** Next 自动路由边界；不引入重型客户端依赖。 */
export default function Loading() {
  return <div role="status" aria-live="polite" className="mx-auto grid max-w-5xl gap-4 p-6">
    <p className="text-sm text-muted-foreground">正在打开页面…</p>
    <div aria-hidden="true" className="h-8 w-48 rounded-lg bg-muted" />
    <div aria-hidden="true" className="h-40 rounded-xl bg-muted" />
  </div>;
}
