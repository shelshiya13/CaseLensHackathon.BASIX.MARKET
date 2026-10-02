export interface ApiError {
  code: string;
  message: string;
}

const TOKEN_STORAGE_KEY = 'caselens_token';

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null): void {
  try {
    if (token && token.trim().length > 0) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token.trim());
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Gracefully ignore storage quota / sandbox exceptions
  }
}

export function clearAuthToken(): void {
  setAuthToken(null);
}

export async function apiRequest<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  // Attach Bearer token fallback if present
  const token = getAuthToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(path, {
    ...options,
    headers,
    credentials: 'include'
  });

  const contentType = response.headers.get('content-type');
  let data: any = null;
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    // Clear invalid/expired token if an authenticated endpoint rejects with 401
    if (response.status === 401 && token) {
      clearAuthToken();
    }

    const errorData = data?.error || {
      code: `HTTP_${response.status}`,
      message: typeof data === 'string' && data ? data : response.statusText || 'An error occurred'
    };
    throw errorData;
  }

  return data as T;
}

export function apiUpload<T = any>(
  path: string,
  body: FormData,
  onProgress: (progress: number) => void
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', path);
    xhr.withCredentials = true;

    const token = getAuthToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.addEventListener('progress', event => {
      if (event.lengthComputable) {
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      }
    });

    xhr.addEventListener('load', () => {
      const contentType = xhr.getResponseHeader('content-type') || '';
      let data: any = xhr.responseText;
      if (contentType.includes('application/json')) {
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          reject(new Error('The server returned an invalid upload response.'));
          return;
        }
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data as T);
        return;
      }

      if (xhr.status === 401 && token) clearAuthToken();
      const errorData = data?.error || {
        code: `HTTP_${xhr.status}`,
        message: typeof data === 'string' && data ? data : xhr.statusText || 'Upload failed.'
      };
      reject(Object.assign(new Error(errorData.message), errorData));
    });

    xhr.addEventListener('error', () => reject(new Error('Network error while uploading documents.')));
    xhr.addEventListener('abort', () => reject(new Error('Document upload was cancelled.')));
    xhr.send(body);
  });
}
