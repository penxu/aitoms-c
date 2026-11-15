import fs from "node:fs";
import { execFileSync } from "node:child_process";

export interface ProcessIdentity {
  pid: number;
  startToken: string;
  startedAt: number;
  cwd: string;
}

export function sameProcess(expected: ProcessIdentity, actual: ProcessIdentity | null): boolean {
  return Boolean(actual && expected.pid === actual.pid && expected.startToken === actual.startToken && expected.cwd === actual.cwd);
}

/** 操作系统启动标识与真实 cwd 一起核对，拒绝 PID 复用。探测失败时不发送信号。 */
export function readProcessIdentity(pid: number): ProcessIdentity | null {
  if (!Number.isSafeInteger(pid) || pid <= 1) return null;
  try {
    if (process.platform === "linux") {
      const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
      const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
      if (fields[0] === "Z") return null;
      const ticks = Number(execFileSync("getconf", ["CLK_TCK"], { encoding: "utf8", timeout: 2000 }));
      const boot = Number(fs.readFileSync("/proc/stat", "utf8").match(/^btime (\d+)$/m)?.[1]);
      const startTicks = fields[19];
      const cwd = fs.realpathSync(`/proc/${pid}/cwd`);
      if (!Number.isFinite(boot) || !ticks || !startTicks) return null;
      const bootId = fs.readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim();
      return { pid, startToken: `${bootId}:${startTicks}`, cwd, startedAt: (boot + Number(startTicks) / ticks) * 1000 };
    }
    if (process.platform === "darwin") {
      const start = execFileSync("/bin/ps", ["-p", String(pid), "-o", "lstart="], { encoding: "utf8", timeout: 2000 }).trim();
      const output = execFileSync("/usr/sbin/lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"], { encoding: "utf8", timeout: 2000 });
      const cwd = output.split("\n").find(line => line.startsWith("n"))?.slice(1);
      const startedAt = Date.parse(start);
      if (!cwd || !Number.isFinite(startedAt)) return null;
      return { pid, startToken: start, cwd: fs.realpathSync(cwd), startedAt };
    }
  } catch { /* 已退出或无法核对身份 */ }
  return null;
}
