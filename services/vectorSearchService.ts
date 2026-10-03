/**
 * Phase 3: Vector Search / RAG Client Service
 * 
 * Frontend client for semantic search and RAG queries.
 * Handles vector embeddings, semantic search, and RAG pipeline calls.
 */

export interface VectorSearchResult {
  id: string;
  dataType: string;
  content: string;
  similarity: number;
  metadata?: Record<string, unknown>;
}

export interface RAGResponse {
  answer: string;
  sources: VectorSearchResult[];
  tokensUsed: {
    input: number;
    output: number;
  };
}

export interface RAGStreamEvent {
  type: 'sources' | 'text' | 'done' | 'error';
  sources?: VectorSearchResult[];
  content?: string;
  error?: string;
}

/**
 * Vector Search / RAG Service
 * Handles semantic search and retrieval-augmented generation
 */
class VectorSearchService {
  private serviceUrl: string;
  private cache: Map<string, { data: RAGResponse; timestamp: number }> = new Map();
  private cacheExpiration = 5 * 60 * 1000; // 5 minutes

  constructor(serviceUrl?: string) {
    this.serviceUrl = serviceUrl || (process.env.REACT_APP_VECTOR_SERVICE_URL || '');
  }

  /**
   * Get ID token for API authentication
   */
  private async getIdToken(): Promise<string> {
    const auth = getAuth(firebaseApp);
    const user = auth.currentUser;

    if (!user) {
      throw new Error('User not authenticated');
    }

    return await user.getIdToken();
  }

  /**
   * Set vector service URL (for runtime configuration)
   */
  setServiceUrl(url: string): void {
    this.serviceUrl = url;
  }

  /**
   * Prepare project data for vector embedding
   * Should be called once when project is loaded
   */
  async embedProjectData(projectId: string): Promise<void> {
    try {
      const idToken = await this.getIdToken();

      const response = await fetch(`${this.serviceUrl}/embedProjectData`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          projectId,
          userId: getAuth(firebaseApp).currentUser?.uid
        })
      });

      if (!response.ok) {
        throw new Error(`Embedding failed: ${response.statusText}`);
      }

      console.log(`Project ${projectId} data embedded successfully`);
    } catch (error) {
      console.error('Failed to embed project data:', error);
      throw error;
    }
  }

  /**
   * Perform semantic search on project data
   */
  async semanticSearch(
    projectId: string,
    query: string,
    topK: number = 5,
    filters?: {
      dataType?: 'points' | 'geometry' | 'chat' | 'files';
      pointType?: string;
    }
  ): Promise<VectorSearchResult[]> {
    try {
      const idToken = await this.getIdToken();

      const response = await fetch(`${this.serviceUrl}/semanticSearchProject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          projectId,
          userId: getAuth(firebaseApp).currentUser?.uid,
          query,
          topK,
          filters
        })
      });

      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`);
      }

      const data = await response.json();
      return data.results || [];
    } catch (error) {
      console.error('Semantic search failed:', error);
      throw error;
    }
  }

  /**
   * RAG query with semantic search + Gemini
   * Returns answer with source citations
   */
  async ragQuery(
    projectId: string,
    question: string,
    options?: {
      systemPrompt?: string;
      topK?: number;
      maxTokens?: number;
    }
  ): Promise<RAGResponse> {
    try {
      // Check cache
      const cacheKey = `${projectId}:${question}`;
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheExpiration) {
        console.log('RAG response from cache');
        return cached.data;
      }

      const idToken = await this.getIdToken();

      const response = await fetch(`${this.serviceUrl}/ragQueryProject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          projectId,
          userId: getAuth(firebaseApp).currentUser?.uid,
          question,
          systemPrompt: options?.systemPrompt,
          topK: options?.topK || 5,
          maxTokens: options?.maxTokens || 2000
        })
      });

      if (!response.ok) {
        throw new Error(`RAG query failed: ${response.statusText}`);
      }

      const data = await response.json() as RAGResponse;

      // Cache result
      this.cache.set(cacheKey, { data, timestamp: Date.now() });

      return data;
    } catch (error) {
      console.error('RAG query failed:', error);
      throw error;
    }
  }

  /**
   * Stream RAG query response
   * Returns async iterator for real-time updates
   */
  async *ragQueryStream(
    projectId: string,
    question: string,
    options?: {
      systemPrompt?: string;
      topK?: number;
    }
  ): AsyncGenerator<RAGStreamEvent> {
    try {
      const idToken = await this.getIdToken();

      const response = await fetch(`${this.serviceUrl}/ragQueryStreamProject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          projectId,
          userId: getAuth(firebaseApp).currentUser?.uid,
          question,
          systemPrompt: options?.systemPrompt,
          topK: options?.topK || 5
        })
      });

      if (!response.ok) {
        throw new Error(`Stream failed: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('Response body is empty');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          yield { type: 'done' };
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');

        // Keep last incomplete line in buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6)) as RAGStreamEvent;
              yield data;
            } catch (e) {
              console.error('Failed to parse stream event:', e);
            }
          }
        }
      }
    } catch (error) {
      console.error('RAG stream failed:', error);
      yield { 
        type: 'error', 
        error: (error as Error).message 
      };
    }
  }

  /**
   * Estimate tokens for a text
   */
  estimateTokens(text: string): number {
    // Rough estimate: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Check if vector service is available
   */
  async isServiceAvailable(): Promise<boolean> {
    try {
      if (!this.serviceUrl) {
        return false;
      }

      const response = await fetch(`${this.serviceUrl}/health`, {
        method: 'GET'
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Format RAG response for display
   */
  formatResponse(ragResponse: RAGResponse): {
    answer: string;
    citations: Array<{ content: string; dataType: string; similarity: number }>;
  } {
    const citations = ragResponse.sources.map(source => ({
      content: source.content.substring(0, 100) + (source.content.length > 100 ? '...' : ''),
      dataType: source.dataType,
      similarity: Math.round(source.similarity * 100) / 100
    }));

    return {
      answer: ragResponse.answer,
      citations
    };
  }
}

// Export singleton instance
export const vectorSearchService = new VectorSearchService();

export default vectorSearchService;
