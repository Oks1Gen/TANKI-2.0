// Диагностика WebGL: помогает понять, почему не создаётся renderer,
// вместо глухого «белый экран» / «предпросмотр недоступен».
export interface WebGLStatus {
  ok: boolean;
  webgl2: boolean;
  webgl1: boolean;
  error?: string;
  hint?: string;
}

export function getWebGLStatus(): WebGLStatus {
  try {
    // ВАЖНО: для каждого типа — отдельный canvas.
    // Один canvas может отдать контекст только одного типа.
    const c2 = document.createElement('canvas');
    const g2 = c2.getContext('webgl2');
    if (g2) {
      const c1 = document.createElement('canvas');
      const g1 = c1.getContext('webgl') || c1.getContext('experimental-webgl');
      return { ok: true, webgl2: true, webgl1: !!g1 };
    }
    const c1 = document.createElement('canvas');
    const g1 = c1.getContext('webgl') || c1.getContext('experimental-webgl');
    if (g1) {
      return {
        ok: false,
        webgl2: false,
        webgl1: true,
        error: 'Браузер дал только WebGL1, а игре нужен WebGL2 (three.js r150+).',
        hint: 'Обновите Chrome/Edge/Firefox до последней версии и включите аппаратное ускорение.',
      };
    }
    return {
      ok: false,
      webgl2: false,
      webgl1: false,
      error: 'Браузер не дал WebGL-контекст (canvas.getContext вернул null).',
      hint: 'Включите аппаратное ускорение, проверьте chrome://gpu и https://get.webgl.org/. На ПК без GPU запустите Chrome с флагом --enable-unsafe-swiftshader.',
    };
  } catch (e) {
    return {
      ok: false,
      webgl2: false,
      webgl1: false,
      error: e instanceof Error ? e.message : String(e),
      hint: 'Браузер заблокировал WebGL. Проверьте настройки приватности/расширения.',
    };
  }
}

export function describeRendererError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  // Типичные сообщения three.js при отсутствии WebGL
  if (/webgl/i.test(msg) && /not supported|unavailable|failed|context/i.test(msg)) {
    return msg;
  }
  return msg;
}
