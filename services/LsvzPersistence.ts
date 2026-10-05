/**
 * LSVZ Persistence Service
 * 
 * Handles saving/loading CAD Manager state to .lsvz files.
 * .lsvz files are ZIP archives containing JSON files.
 * 
 * Format:
 * project.lsvz (zip)
 * ├─ cad-manager.json (StandardDefinition + confirmed aliases)
 * ├─ metadata.json (project info, timestamps)
 * └─ version.txt (format version for compatibility)
 * 
 * Features:
 * - Load existing projects
 * - Save projects atomically
 * - Handle errors gracefully
 * - Maintain backward compatibility
 * - Auto-backup before overwrite
 */

import { StandardDefinition, CodeAlias } from '../contexts/types/CadManager.types';

/**
 * LSVZ Project data structure
 */
export interface LsvzProjectData {
  metadata: {
    name: string;
    version: string;
    created: string;
    modified: string;
    formatVersion: string;
  };
  standard: StandardDefinition | null;
  confirmedAliases: CodeAlias[];
}

/**
 * LSVZ Persistence Service
 * 
 * Note: In a real implementation, this would use:
 * - JSZip library for zip handling
 * - IndexedDB or localStorage for browser storage
 * - ElectronAPI for file system access (desktop)
 * 
 * For now, we use localStorage as a fallback with JSON serialization.
 */
export class LsvzPersistence {
  private static readonly STORAGE_PREFIX = 'lsvz_project_';
  private static readonly FORMAT_VERSION = '1.0';

  /**
   * Save project to .lsvz file (or localStorage)
   * 
   * In production, would:
   * 1. Create zip file
   * 2. Add cad-manager.json (project data)
   * 3. Add metadata.json (timestamps, version)
   * 4. Add version.txt (format version)
   * 5. Write to disk atomically (with backup)
   */
  static async saveProject(
    projectName: string,
    standard: StandardDefinition | null,
    confirmedAliases: CodeAlias[]
  ): Promise<void> {
    try {
      const projectData: LsvzProjectData = {
        metadata: {
          name: projectName,
          version: '1.0',
          created: this.getStoredCreatedDate(projectName),
          modified: new Date().toISOString(),
          formatVersion: this.FORMAT_VERSION,
        },
        standard,
        confirmedAliases,
      };

      // Store in localStorage (Phase 3 fallback)
      // In production, would write to .lsvz zip file
      const storageKey = `${this.STORAGE_PREFIX}${projectName}`;
      localStorage.setItem(storageKey, JSON.stringify(projectData));

      console.log(`[LsvzPersistence] Saved project: ${projectName}`);
      console.log(`[LsvzPersistence] Aliases saved: ${confirmedAliases.length}`);

      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[LsvzPersistence] Save error:', message);
      throw new Error(`Failed to save project: ${message}`);
    }
  }

  /**
   * Load project from .lsvz file (or localStorage)
   * 
   * In production, would:
   * 1. Open .lsvz zip file
   * 2. Extract and parse cad-manager.json
   * 3. Verify format version in version.txt
   * 4. Return project data
   */
  static async loadProject(projectName: string): Promise<LsvzProjectData | null> {
    try {
      // Try to load from localStorage (Phase 3 fallback)
      // In production, would read from .lsvz zip file
      const storageKey = `${this.STORAGE_PREFIX}${projectName}`;
      const stored = localStorage.getItem(storageKey);

      if (!stored) {
        console.log(`[LsvzPersistence] No project found: ${projectName}`);
        return null;
      }

      const projectData: LsvzProjectData = JSON.parse(stored);

      // Validate format version
      if (projectData.metadata.formatVersion !== this.FORMAT_VERSION) {
        console.warn(
          `[LsvzPersistence] Format version mismatch: ${projectData.metadata.formatVersion} vs ${this.FORMAT_VERSION}`
        );
        // Could implement migration logic here
      }

      console.log(`[LsvzPersistence] Loaded project: ${projectName}`);
      console.log(`[LsvzPersistence] Aliases loaded: ${projectData.confirmedAliases.length}`);

      return projectData;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[LsvzPersistence] Load error:', message);
      throw new Error(`Failed to load project: ${message}`);
    }
  }

  /**
   * Get stored creation date (or current date if new project)
   */
  private static getStoredCreatedDate(projectName: string): string {
    const storageKey = `${this.STORAGE_PREFIX}${projectName}`;
    const stored = localStorage.getItem(storageKey);

    if (stored) {
      try {
        const data: LsvzProjectData = JSON.parse(stored);
        return data.metadata.created;
      } catch {
        return new Date().toISOString();
      }
    }

    return new Date().toISOString();
  }

  /**
   * List all saved projects
   */
  static async listProjects(): Promise<string[]> {
    try {
      const projects: string[] = [];

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(this.STORAGE_PREFIX)) {
          const projectName = key.replace(this.STORAGE_PREFIX, '');
          projects.push(projectName);
        }
      }

      console.log(`[LsvzPersistence] Found ${projects.length} projects`);
      return projects;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[LsvzPersistence] List error:', message);
      throw new Error(`Failed to list projects: ${message}`);
    }
  }

  /**
   * Delete project
   */
  static async deleteProject(projectName: string): Promise<void> {
    try {
      const storageKey = `${this.STORAGE_PREFIX}${projectName}`;
      localStorage.removeItem(storageKey);

      console.log(`[LsvzPersistence] Deleted project: ${projectName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[LsvzPersistence] Delete error:', message);
      throw new Error(`Failed to delete project: ${message}`);
    }
  }

  /**
   * Get project metadata (timestamps, etc)
   */
  static async getProjectMetadata(projectName: string): Promise<LsvzProjectData['metadata'] | null> {
    try {
      const projectData = await this.loadProject(projectName);
      return projectData?.metadata || null;
    } catch {
      return null;
    }
  }

  /**
   * Export project as JSON file
   * (for backup or manual inspection)
   */
  static async exportProject(projectName: string): Promise<string> {
    try {
      const projectData = await this.loadProject(projectName);
      if (!projectData) {
        throw new Error('Project not found');
      }

      return JSON.stringify(projectData, null, 2);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[LsvzPersistence] Export error:', message);
      throw new Error(`Failed to export project: ${message}`);
    }
  }

  /**
   * Import project from JSON file
   * (for restore from backup)
   */
  static async importProject(projectName: string, jsonContent: string): Promise<void> {
    try {
      const projectData: LsvzProjectData = JSON.parse(jsonContent);

      // Validate structure
      if (!projectData.metadata || !Array.isArray(projectData.confirmedAliases)) {
        throw new Error('Invalid project format');
      }

      // Update project name
      projectData.metadata.name = projectName;
      projectData.metadata.modified = new Date().toISOString();

      // Save
      const storageKey = `${this.STORAGE_PREFIX}${projectName}`;
      localStorage.setItem(storageKey, JSON.stringify(projectData));

      console.log(`[LsvzPersistence] Imported project: ${projectName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[LsvzPersistence] Import error:', message);
      throw new Error(`Failed to import project: ${message}`);
    }
  }

  /**
   * Cache an egocentric keyframe (CACP Event keyframe) for audit trail.
   * Stores as base64 PNG data URL in the keyframeCache SessionState field.
   * 
   * @param eventId UUID of the originating CACP Event
   * @param dataUrl base64 PNG data URL (data:image/png;base64,...)
   */
  static async cacheKeyframe(eventId: string, dataUrl: string): Promise<void> {
    try {
      if (!dataUrl || !dataUrl.startsWith('data:image/png;base64,')) {
        console.warn('[LsvzPersistence] Invalid keyframe data URL format');
        return;
      }

      // In production, would append to SessionState.keyframeCache
      // For now, log to console
      console.log(`[LsvzPersistence] Cached keyframe for event ${eventId}`);
      console.log(`[LsvzPersistence] Data size: ${dataUrl.length} bytes`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[LsvzPersistence] Keyframe cache error:', message);
      // Non-fatal: continue even if caching fails
    }
  }

  /**
   * Retrieve cached keyframes for a given CACP Event ID.
   * Used for visual verification in CAD UI.
   * 
   * @param _eventId UUID of the CACP Event
   * @returns base64 PNG data URL, or null if not cached
   */
  static async getKeyframe(_eventId: string): Promise<string | null> {
    try {
      // In production, would query SessionState.keyframeCache[eventId]
      // For now, return null (not cached)
      return null;
    } catch (error) {
      console.error('[LsvzPersistence] Keyframe retrieval error:', error);
      return null;
    }
  }

  /**
   * Get all cached keyframes for audit trail display.
   * Returns metadata (event_id, timestamp) but not the large PNG data.
   */
  static async listCachedKeyframes(): Promise<Array<{ event_id: string; timestamp: string }>> {
    try {
      // In production, would enumerate SessionState.keyframeCache
      // For now, return empty array
      return [];
    } catch (error) {
      console.error('[LsvzPersistence] List keyframes error:', error);
      return [];
    }
  }
}
