/**
 * Context Service - Client-side service for fetching project context from BigQuery
 * 
 * This service handles:
 * 1. Large context fetching from Cloud Run
 * 2. Adaptive context loading based on project size
 * 3. Chunked data retrieval for memory efficiency
 * 4. Token estimation and management
 */

interface ContextRequestOptions {
  projectId: string;
  userId: string;
  includePoints?: boolean;
  includeGeometry?: boolean;
  includeChatHistory?: boolean;
  pointsFilter?: { type?: string; limit?: number };
  geometryFilter?: { type?: string; limit?: number };
}

interface ContextResponse {
  project: any;
  points: any[];
  geometry: any[];
  pointsTotal: number;
  geometryTotal: number;
  totalTokensEstimate: number;
}

interface ProjectSummary {
  projectId: string;
  userId: string;
  pointCount: number;
  fileCount: number;
  projectName: string;
  lastUpdated: string;
}

class ContextService {
  private contextServiceUrl: string;
  private cache: Map<string, { data: ContextResponse; timestamp: number }>;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(contextServiceUrl: string) {
    this.contextServiceUrl = contextServiceUrl || 
      process.env.REACT_APP_CONTEXT_SERVICE_URL ||
      'https://context-service-xxxxx.cloudfunctions.net/contextService';
    this.cache = new Map();
  }

  /**
   * Determine if project is large enough to warrant cloud context service
   */
  isLargeProject(pointCount: number, fileCount: number): boolean {
    return pointCount > 500 || fileCount > 5;
  }

  /**
   * Fetch context from BigQuery via Cloud Run
   */
  async fetchContext(options: ContextRequestOptions): Promise<ContextResponse> {
    const cacheKey = this.getCacheKey(options);

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      console.log('Returning cached context');
      return cached.data;
    }

    try {
      const response = await fetch(this.contextServiceUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await this.getIdToken()}`,
        },
        body: JSON.stringify(options),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || `HTTP ${response.status}`);
      }

      const data = (await response.json()) as ContextResponse;

      // Cache the result
      this.cache.set(cacheKey, { data, timestamp: Date.now() });

      return data;
    } catch (error) {
      console.error('Failed to fetch context:', error);
      throw error;
    }
  }

  /**
   * Fetch adaptive context based on project size
   * Returns summary if small project, detailed data if large
   */
  async fetchAdaptiveContext(
    projectId: string,
    userId: string,
    projectSummary: ProjectSummary
  ): Promise<ContextResponse | null> {
    if (!this.isLargeProject(projectSummary.pointCount, projectSummary.fileCount)) {
      console.log('Project is small, using local context');
      return null; // Use client-side context
    }

    console.log('Project is large, fetching cloud context');

    return this.fetchContext({
      projectId,
      userId,
      includePoints: true,
      includeGeometry: true,
      includeChatHistory: true,
      pointsFilter: { limit: 1000 },
      geometryFilter: { limit: 200 },
    });
  }

  /**
   * Stream points from BigQuery in chunks (for very large projects)
   */
  async *streamPoints(
    projectId: string,
    userId: string,
    chunkSize: number = 500
  ): AsyncGenerator<any[]> {
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      try {
        const response = await this.fetchContext({
          projectId,
          userId,
          includePoints: true,
          pointsFilter: { limit: chunkSize },
        });

        if (response.points.length === 0) {
          hasMore = false;
        } else {
          yield response.points;
          offset += response.points.length;
        }
      } catch (error) {
        console.error('Stream error:', error);
        hasMore = false;
      }
    }
  }

  /**
   * Fetch geometry features efficiently
   */
  async fetchGeometry(
    projectId: string,
    userId: string,
    limit: number = 100
  ): Promise<any[]> {
    try {
      const response = await this.fetchContext({
        projectId,
        userId,
        includeGeometry: true,
        geometryFilter: { limit },
      });

      return response.geometry;
    } catch (error) {
      console.error('Failed to fetch geometry:', error);
      return [];
    }
  }

  /**
   * Fetch chat history for context awareness
   */
  async fetchChatHistory(projectId: string, userId: string): Promise<any[]> {
    try {
      const response = await this.fetchContext({
        projectId,
        userId,
        includeChatHistory: true,
      });

      return response.geometry;
    } catch (error) {
      console.error('Failed to fetch chat history:', error);
      return [];
    }
  }

  /**
   * Format context response for Gemini
   */
  formatContextForAI(data: ContextResponse): string {
    const parts: string[] = [];

    // Project summary
    parts.push('=== PROJECT SUMMARY ===');
    parts.push(`Name: ${data.project.project_name}`);
    parts.push(`Total Points: ${data.pointsTotal}`);
    parts.push(`Total Features: ${data.geometryTotal}`);
    parts.push(`Last Updated: ${data.project.last_updated}`);
    parts.push('');

    // Points data
    if (data.points.length > 0) {
      parts.push('=== SURVEY POINTS ===');
      parts.push(`Count: ${data.points.length} (showing first ${data.points.length})`);
      parts.push('');
      
      // Group by type for summary
      const byType = new Map<string, any[]>();
      data.points.forEach(p => {
        const type = p.point_type || 'standard';
        if (!byType.has(type)) byType.set(type, []);
        byType.get(type)!.push(p);
      });

      for (const [type, points] of byType) {
        parts.push(`${type.toUpperCase()}: ${points.length} points`);
        // Show first 3 points of each type as examples
        points.slice(0, 3).forEach(p => {
          parts.push(`  • ${p.point_number}: (${p.easting.toFixed(2)}, ${p.northing.toFixed(2)}) ${p.description || ''}`);
        });
        if (points.length > 3) {
          parts.push(`  ... and ${points.length - 3} more`);
        }
      }
      parts.push('');
    }

    // Geometry data
    if (data.geometry.length > 0) {
      parts.push('=== GEOMETRY FEATURES ===');
      parts.push(`Count: ${data.geometry.length}`);
      data.geometry.forEach(g => {
        parts.push(`• ${g.feature_id} (${g.feature_type})`);
      });
      parts.push('');
    }

    // Token estimate
    parts.push(`=== CONTEXT SIZE ===`);
    parts.push(`Estimated tokens: ${data.totalTokensEstimate.toLocaleString()}`);

    return parts.join('\n');
  }

  /**
   * Get Firebase ID token for authentication
   */
  private async getIdToken(): Promise<string> {
    try {
      // This assumes Firebase is initialized in your app
      const user = (window as any).currentUser;
      if (user && user.getIdToken) {
        return await user.getIdToken();
      }
    } catch (error) {
      console.warn('Could not get ID token:', error);
    }
    return '';
  }

  /**
   * Generate cache key
   */
  private getCacheKey(options: ContextRequestOptions): string {
    return `${options.projectId}-${options.userId}-${JSON.stringify(options).hashCode()}`;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Clear specific cache entry
   */
  clearCacheEntry(projectId: string, userId: string): void {
    const keys = Array.from(this.cache.keys());
    keys.forEach(key => {
      if (key.includes(projectId) && key.includes(userId)) {
        this.cache.delete(key);
      }
    });
  }
}

// Export singleton instance
export const contextService = new ContextService(
  process.env.REACT_APP_CONTEXT_SERVICE_URL!
);

export default ContextService;
