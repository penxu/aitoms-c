/** 同项目共享启动任务；停止同步取消，包括仍在等待端口的任务。 */
export class RuntimeGate {
  private pending = new Map<string, { promise: Promise<unknown>; controller: AbortController; key?: string }>();

  start<T>(id: string, task: (signal: AbortSignal) => Promise<T>, key?: string): Promise<T> {
    const existing = this.pending.get(id);
    if (existing && !existing.controller.signal.aborted && (key === undefined || existing.key === key)) return existing.promise as Promise<T>;
    if (existing) this.cancel(id);
    return this.launch(id, task, existing?.promise, key);
  }

  cancel(id: string): void {
    this.pending.get(id)?.controller.abort(new Error("服务启动已停止"));
  }

  restart<T>(id: string, stop: () => void, task: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const previous = this.pending.get(id)?.promise;
    this.cancel(id);
    return this.launch(id, async signal => { signal.throwIfAborted(); stop(); return task(signal); }, previous);
  }

  private launch<T>(id: string, task: (signal: AbortSignal) => Promise<T>, previous?: Promise<unknown>, key?: string): Promise<T> {
    const controller = new AbortController();
    const run = async () => {
      if (previous) await previous.catch(() => undefined);
      controller.signal.throwIfAborted();
      return task(controller.signal);
    };
    const promise = run();
    const entry = { promise, controller, key };
    this.pending.set(id, entry);
    void promise.finally(() => { if (this.pending.get(id) === entry) this.pending.delete(id); }).catch(() => undefined);
    return promise;
  }
}
