const TOKEN_STORAGE_KEY = 'sherbas_session_token';

let unauthorizedHandler: (() => void) | null = null;

export function getAuthToken(): string | null {
  try {
    return window.sessionStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null): void {
  try {
    if (token) {
      window.sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage restriction errors inside constrained iframes
  }
}

export function clearAuthToken(): void {
  setAuthToken(null);
}

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

export async function apiFetch<T = unknown>(url: string, options: RequestInit = {}): Promise<T> {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };
  if (!isFormData && options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const token = getAuthToken();
  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  const text = await res.text();
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }

  if (!res.ok) {
    if (res.status === 401 && url !== '/api/auth/login' && url !== '/api/setup/super-admin') {
      clearAuthToken();
      if (unauthorizedHandler) {
        unauthorizedHandler();
      }
    }
    const errMsg =
      (typeof data.error === 'string' && data.error) ||
      (typeof data.message === 'string' && data.message) ||
      `خطأ في الاتصال بالخادم (${res.status})`;
    throw new Error(errMsg);
  }

  return data as T;
}

export async function fetchProtectedBlobUrl(url: string): Promise<{ blobUrl: string; mimeType: string }> {
  const headers: Record<string, string> = {};
  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    credentials: 'include',
    headers,
  });

  if (!res.ok) {
    if (res.status === 401) {
      clearAuthToken();
      if (unauthorizedHandler) {
        unauthorizedHandler();
      }
    }
    const text = await res.text().catch(() => '');
    let msg = `تعذر تحميل الملف (${res.status})`;
    if (text) {
      try {
        const parsed = JSON.parse(text) as { error?: string };
        if (parsed.error) msg = parsed.error;
      } catch {
        // Use fallback message
      }
    }
    throw new Error(msg);
  }

  const blob = await res.blob();
  const mimeType = res.headers.get('content-type') || blob.type || 'application/octet-stream';
  return {
    blobUrl: URL.createObjectURL(blob),
    mimeType,
  };
}

export async function downloadProtectedFile(url: string, fallbackFilename: string): Promise<void> {
  const { blobUrl } = await fetchProtectedBlobUrl(url);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = fallbackFilename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 2500);
}
