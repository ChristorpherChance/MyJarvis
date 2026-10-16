type ShellStatus = { ready: boolean; version?: string; waiting?: boolean };
const workerPath = '/offline-capture-sw.js';
const scopePath = '/offline-capture.html';

async function statusOf(registration: ServiceWorkerRegistration): Promise<ShellStatus> {
  const worker = registration.active;
  if (!worker || worker.state !== 'activated' || new URL(worker.scriptURL).pathname !== workerPath) return { ready: false };
  return new Promise(resolve => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); resolve({ ready: false }); }, 8000);
    channel.port1.onmessage = event => {
      clearTimeout(timer); channel.port1.close();
      resolve(event.data?.type === 'OFFLINE_SHELL_READY' && event.data.ready === true
        ? { ready: true, version: String(event.data.version || ''), waiting: !!registration.waiting }
        : { ready: false });
    };
    worker.postMessage({ type: 'OFFLINE_SHELL_STATUS' }, [channel.port2]);
  });
}

export async function currentOfflineShell(): Promise<ShellStatus> {
  if (!isSecureContext || !('serviceWorker' in navigator)) return { ready: false };
  const registration = await navigator.serviceWorker.getRegistration(scopePath);
  return registration && new URL(registration.scope).pathname === scopePath ? statusOf(registration) : { ready: false };
}

/** Called only after the person explicitly chooses to prepare this public shell. */
export async function prepareOfflineShell(): Promise<ShellStatus> {
  if (!isSecureContext || !('serviceWorker' in navigator)) throw new Error('此地址不支持离线准备，请使用 HTTPS 或本机 localhost。');
  if (!navigator.onLine) throw new Error('首次准备需要联网。已准备的页面可直接离线重开。');
  const registration = await navigator.serviceWorker.register(workerPath, { scope: scopePath, updateViaCache: 'none' });
  const deadline = Date.now() + 35000;
  while (Date.now() < deadline) {
    if (registration.active?.state === 'activated') {
      const result = await statusOf(registration);
      if (result.ready) return result;
    }
    if (registration.installing?.state === 'redundant') throw new Error('离线文件校验未完成，原有离线版本保持。请联网后重试。');
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error('尚未确认离线文件已完整保存，请保持联网后重试。原有离线版本保持。');
}
