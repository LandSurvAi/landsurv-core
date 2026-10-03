/**
 * API Interceptor - Handles token refresh on 401 responses
 * Automatically attempts to refresh access token when expired
 */

interface RequestOptions extends RequestInit {
  skipRefresh?: boolean;
}

interface RefreshTokenResponse {
  accessToken: string;
  refreshToken?: string;
}

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: string) => void;
  reject: (reason?: any) => void;
}> = [];

const processQueue = (error: Error | null, token: string | null = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token || '');
    }
  });
  
  isRefreshing = false;
  failedQueue = [];
};

export const apiInterceptor = async (
  url: string,
  options: RequestOptions = {}
): Promise<Response> => {
  const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3000';
  const skipRefresh = options.skipRefresh || false;
  
  // Remove skipRefresh from options before sending
  const finalOptions = { ...options };
  delete (finalOptions as any).skipRefresh;
  
  // Add auth token if available
  const accessToken = localStorage.getItem('accessToken');
  if (accessToken && !finalOptions.headers) {
    finalOptions.headers = {};
  }
  if (accessToken) {
    const headers = finalOptions.headers as Record<string, string>;
    headers['Authorization'] = `Bearer ${accessToken}`;
  }
  
  // Make request
  let response = await fetch(url, finalOptions);
  
  // Handle 401 - token expired
  if (response.status === 401 && !skipRefresh) {
    if (isRefreshing) {
      // Queue request while token is being refreshed
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then(token => {
        // Retry request with new token
        return fetch(url, {
          ...finalOptions,
          headers: {
            ...finalOptions.headers,
            'Authorization': `Bearer ${token}`
          }
        });
      }).catch(err => {
        throw new Error('Failed to refresh token');
      });
    }
    
    isRefreshing = true;
    
    try {
      const refreshToken = localStorage.getItem('refreshToken');
      
      if (!refreshToken) {
        throw new Error('No refresh token available');
      }
      
      // Attempt token refresh
      const refreshResponse = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
        skipRefresh: true
      } as RequestOptions);
      
      if (!refreshResponse.ok) {
        throw new Error('Token refresh failed');
      }
      
      const refreshData: RefreshTokenResponse = await refreshResponse.json();
      
      // Store new tokens
      localStorage.setItem('accessToken', refreshData.accessToken);
      if (refreshData.refreshToken) {
        localStorage.setItem('refreshToken', refreshData.refreshToken);
      }
      
      // Process queued requests
      processQueue(null, refreshData.accessToken);
      
      // Retry original request with new token
      response = await fetch(url, {
        ...finalOptions,
        headers: {
          ...finalOptions.headers,
          'Authorization': `Bearer ${refreshData.accessToken}`
        }
      });
      
    } catch (err) {
      // Refresh failed - clear auth and process queue
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      localStorage.removeItem('loginTime');
      
      processQueue(new Error('Token refresh failed'), null);
      
      // Redirect to login
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      
      throw err;
    }
  }
  
  return response;
};

/**
 * Wrapper for fetch that includes token refresh interceptor
 */
export const fetchWithAuth = (
  url: string,
  options?: RequestOptions
): Promise<Response> => {
  return apiInterceptor(url, options);
};

export default apiInterceptor;
