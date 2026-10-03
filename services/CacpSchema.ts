/**
 * CACP (Cross Agent Communications Protocol) Schema
 * 
 * Formal JSON Schema definitions and TypeScript types for all CACP message structures.
 * This is the single source of truth for CACP message validation across:
 *   - Web app agents (AR, CAD Manager, Boundary, etc.)
 *   - DGX Spark Interceptor (VLM pipeline)
 *   - Google Cloud Orchestrator (Gemini routing)
 *   - Civil 3D plugin (CAD execution)
 * 
 * Reference: landsurv-xr-system-spec.md §4
 */

/**
 * CACP command categories — what type of request is this?
 */
export type CacpCommandCategory =
  | 'DRAW_FEATURE'     // Add geometry (point, line, boundary, etc.)
  | 'QUERY_DATA'       // Request information (coordinates, descriptions, etc.)
  | 'SAVE_MEM'         // Persist data to world state
  | 'DEVICE_CONTROL';  // Control smart glasses (audio, display, etc.)

/**
 * Feature types recognized by VLM + CAD system
 */
export type CacpFeatureType =
  | 'tree'             // Vegetation
  | 'monument'         // Survey monument / mark
  | 'boundary'         // Property boundary
  | 'utility'          // Utility infrastructure (power, water, gas, etc.)
  | 'structure';       // Building / structure

/**
 * Feature attributes — what properties describe this feature?
 */
export interface CacpFeatureAttributes {
  /** Scientific genus/species for trees. */
  genus?: string;
  /** Caliper diameter in inches. */
  caliper_inches?: number;
  /** Condition code: 'healthy' | 'dead' | 'dying' | 'damaged' | 'removed'. */
  condition?: string;
  /** Description key mapping to Civil 3D layer code (e.g., 'VEG_TREE'). */
  description_key?: string;
  /** Monument type: 'cap' | 'nail' | 'pin' | 'cross' | 'found' | 'not_found'. */
  monument_type?: string;
  /** Monument condition code. */
  monument_condition?: string;
  /** Utility type: 'electric' | 'water' | 'gas' | 'sewer' | 'telecom' | 'fiber'. */
  utility_type?: string;
  /** Structure type: 'building' | 'shed' | 'deck' | 'fence' | 'pool' | 'other'. */
  structure_type?: string;
  /** Any user-added custom field. */
  [key: string]: unknown;
}

/**
 * Raw geographic/projected coordinates: [X, Y, Z] in the survey coordinate system.
 * Z (elevation) is optional but recommended for 3D visualization.
 */
export type CacpCoordinates = [number, number] | [number, number, number];

/**
 * A single feature extracted from the egocentric keyframe.
 * Sent by DGX Spark Interceptor in CACP Event Notification.
 */
export interface CacpFeature {
  /** Feature type (tree, monument, boundary, utility, structure). */
  type: CacpFeatureType;
  /** Raw [X, Y] or [X, Y, Z] coordinates from survey projection. */
  raw_coordinates: CacpCoordinates;
  /** Feature-specific attributes (species, caliper, condition, etc.). */
  attributes?: CacpFeatureAttributes;
}

/**
 * CACP Event Notification — sent FROM field (DGX Interceptor) TO cloud (Gemini router).
 * Represents a structured surveyor intent extracted from voice + keyframe on-site.
 */
export interface CacpEventNotification {
  /** CACP version (semver). */
  version: string; // e.g., "1.0.0"
  /** Unique event identifier (UUID). */
  event_id: string;
  /** ISO timestamp when the keyframe was captured. */
  timestamp: string; // ISO 8601
  /** Session context: project, surveyor, location. */
  session_context: {
    /** Project identifier (matches .lsvz jobInfo.jobNumber or similar). */
    project_id: string;
    /** Surveyor identifier (name or employee ID). */
    surveyor_id: string;
    /** Geographic location of the capture (for audit + zoning queries). */
    location?: {
      latitude: number;
      longitude: number;
      elevation?: number;
    };
  };
  /** Parsed user intent from voice command. */
  intent: {
    /** Raw voice transcription. */
    raw_text: string;
    /** Classified command category. */
    command_category: CacpCommandCategory;
    /** VLM confidence score [0.0, 1.0]. */
    confidence: number;
  };
  /** Extracted payload — features detected in the keyframe. */
  payload: {
    features: CacpFeature[];
  };
}

/**
 * CACP Action Notification — sent FROM cloud (Gemini router) TO workstation (CAD drawing).
 * Instructs the CAD system to draw specific geometry with a validated action plan.
 */
export interface CacpActionNotification {
  /** CACP version (semver). */
  version: string; // e.g., "1.0.0"
  /** Unique action identifier (UUID). */
  action_id: string;
  /** ISO timestamp when the action was approved by Gemini. */
  timestamp: string; // ISO 8601
  /** Reference to the originating CACP Event ID (for audit trail). */
  event_id: string;
  /** Session context (echoed from originating event). */
  session_context: {
    project_id: string;
    surveyor_id: string;
  };
  /** Gemini's decision and instructions. */
  instruction: {
    /** Approval status: 'approved' | 'modified' | 'rejected'. */
    status: 'approved' | 'modified' | 'rejected';
    /** Human-readable summary of Gemini's decision. */
    summary: string;
    /** Speculative audio confirmation to play on smart glasses. */
    audio_confirmation?: string;
  };
  /** Refined features to be drawn (may differ from original intent). */
  payload: {
    features: CacpFeature[];
  };
  /** Optional: cached keyframe PNG (base64) for visual verification in CAD. */
  keyframe_cache?: {
    data_url: string; // data:image/png;base64,...
    timestamp: string;
  };
}

/**
 * CACP Acknowledgment — sent FROM workstation (CAD drawing complete) TO cloud (audit log).
 * Confirms that a drawing action completed successfully in Civil 3D.
 */
export interface CacpAcknowledgment {
  /** CACP version (semver). */
  version: string; // e.g., "1.0.0"
  /** Unique acknowledgment identifier (UUID). */
  ack_id: string;
  /** ISO timestamp when drawing completed. */
  timestamp: string; // ISO 8601
  /** Reference to the originating Action ID. */
  action_id: string;
  /** Result of the drawing execution. */
  result: {
    /** Outcome: 'success' | 'partial' | 'error'. */
    status: 'success' | 'partial' | 'error';
    /** Count of features successfully drawn. */
    features_drawn: number;
    /** Error message if status === 'error'. */
    error_message?: string;
    /** Point IDs created in Civil 3D (for future reference). */
    created_point_ids?: string[];
  };
}

/**
 * Description Key mapping — translates VLM predictions to Civil 3D layer codes.
 * Registered in .lsvz / Description Keys JSON, pulled on CAD startup.
 * 
 * Example:
 *   {
 *     "id": "DK-VEG-001",
 *     "name": "Tree, Oak, 12in Caliper",
 *     "feature_type": "tree",
 *     "cad_layer": "V-VEG-TREE",
 *     "match_criteria": {
 *       "genus": "Quercus",
 *       "caliper_min": 10,
 *       "caliper_max": 14,
 *       "condition": ["healthy", "damaged"]
 *     }
 *   }
 */
export interface DescriptionKey {
  /** Unique key ID (convention: 'DK-' + category + sequence). */
  id: string;
  /** Human-readable description (shown in CAD drafting UI). */
  name: string;
  /** Feature type this key applies to. */
  feature_type: CacpFeatureType;
  /** Target Civil 3D layer code (e.g., 'V-VEG-TREE', 'S-MONUMENT'). */
  cad_layer: string;
  /** Optional: matching criteria to auto-select this key from VLM attributes. */
  match_criteria?: {
    genus?: string | string[];
    caliper_min?: number;
    caliper_max?: number;
    condition?: string | string[];
    monument_type?: string | string[];
    utility_type?: string | string[];
    [key: string]: unknown;
  };
}

/**
 * Registry of all Description Keys for a project.
 * Stored in .lsvz under `descriptionKeys` field.
 */
export interface DescriptionKeysRegistry {
  /** ISO timestamp when registry was last updated. */
  last_updated: string;
  /** Version of the registry schema. */
  version: string;
  /** All description keys, keyed by ID. */
  keys: Record<string, DescriptionKey>;
}

/**
 * Full JSON Schema definition for CACP Event Notification (for validators).
 * Used by DGX Interceptor to validate outbound CACP Events before posting to cloud.
 */
export const CACP_EVENT_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'CacpEventNotification',
  type: 'object',
  properties: {
    version: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+$' },
    event_id: { type: 'string', format: 'uuid' },
    timestamp: { type: 'string', format: 'date-time' },
    session_context: {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        surveyor_id: { type: 'string' },
        location: {
          type: 'object',
          properties: {
            latitude: { type: 'number', minimum: -90, maximum: 90 },
            longitude: { type: 'number', minimum: -180, maximum: 180 },
            elevation: { type: 'number' },
          },
          required: ['latitude', 'longitude'],
        },
      },
      required: ['project_id', 'surveyor_id'],
    },
    intent: {
      type: 'object',
      properties: {
        raw_text: { type: 'string' },
        command_category: {
          type: 'string',
          enum: ['DRAW_FEATURE', 'QUERY_DATA', 'SAVE_MEM', 'DEVICE_CONTROL'],
        },
        confidence: { type: 'number', minimum: 0.0, maximum: 1.0 },
      },
      required: ['raw_text', 'command_category', 'confidence'],
    },
    payload: {
      type: 'object',
      properties: {
        features: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['tree', 'monument', 'boundary', 'utility', 'structure'],
              },
              raw_coordinates: {
                type: 'array',
                items: { type: 'number' },
                minItems: 2,
                maxItems: 3,
              },
              attributes: {
                type: 'object',
                additionalProperties: true,
              },
            },
            required: ['type', 'raw_coordinates'],
          },
        },
      },
      required: ['features'],
    },
  },
  required: ['version', 'event_id', 'timestamp', 'session_context', 'intent', 'payload'],
};

/**
 * JSON Schema for CACP Action Notification (for validators).
 */
export const CACP_ACTION_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'CacpActionNotification',
  type: 'object',
  properties: {
    version: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+$' },
    action_id: { type: 'string', format: 'uuid' },
    event_id: { type: 'string', format: 'uuid' },
    timestamp: { type: 'string', format: 'date-time' },
    session_context: {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        surveyor_id: { type: 'string' },
      },
      required: ['project_id', 'surveyor_id'],
    },
    instruction: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['approved', 'modified', 'rejected'] },
        summary: { type: 'string' },
        audio_confirmation: { type: 'string' },
      },
      required: ['status', 'summary'],
    },
    payload: {
      type: 'object',
      properties: {
        features: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['tree', 'monument', 'boundary', 'utility', 'structure'],
              },
              raw_coordinates: {
                type: 'array',
                items: { type: 'number' },
                minItems: 2,
                maxItems: 3,
              },
              attributes: { type: 'object' },
            },
            required: ['type', 'raw_coordinates'],
          },
        },
      },
      required: ['features'],
    },
    keyframe_cache: {
      type: 'object',
      properties: {
        data_url: { type: 'string' },
        timestamp: { type: 'string' },
      },
    },
  },
  required: ['version', 'action_id', 'event_id', 'timestamp', 'session_context', 'instruction', 'payload'],
};

/**
 * Helper: Validate a CACP Event Notification against the formal JSON Schema.
 * Used by DGX Interceptor before posting, and by cloud router on receipt.
 */
export function validateCacpEvent(data: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!data || typeof data !== 'object') {
    errors.push('Payload must be a JSON object');
    return { valid: false, errors };
  }

  const obj = data as Record<string, unknown>;

  // Check required top-level fields
  const requiredFields = ['version', 'event_id', 'timestamp', 'session_context', 'intent', 'payload'];
  for (const field of requiredFields) {
    if (!(field in obj)) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Validate version format (simple semver check)
  if (obj.version && typeof obj.version === 'string') {
    if (!/^\d+\.\d+\.\d+$/.test(obj.version)) {
      errors.push(`Invalid version format: ${obj.version} (expected X.Y.Z)`);
    }
  }

  // Validate intent.command_category enum
  if (obj.intent && typeof obj.intent === 'object') {
    const intent = obj.intent as Record<string, unknown>;
    const validCategories = ['DRAW_FEATURE', 'QUERY_DATA', 'SAVE_MEM', 'DEVICE_CONTROL'];
    if (intent.command_category && !validCategories.includes(String(intent.command_category))) {
      errors.push(`Invalid command_category: ${intent.command_category}`);
    }
  }

  // Validate features array
  if (obj.payload && typeof obj.payload === 'object') {
    const payload = obj.payload as Record<string, unknown>;
    if (Array.isArray(payload.features)) {
      const validFeatureTypes = ['tree', 'monument', 'boundary', 'utility', 'structure'];
      for (let i = 0; i < payload.features.length; i++) {
        const feature = payload.features[i];
        if (typeof feature === 'object' && feature !== null) {
          const f = feature as Record<string, unknown>;
          if (!validFeatureTypes.includes(String(f.type))) {
            errors.push(`Feature ${i}: invalid type "${f.type}"`);
          }
          if (!Array.isArray(f.raw_coordinates) || f.raw_coordinates.length < 2 || f.raw_coordinates.length > 3) {
            errors.push(`Feature ${i}: raw_coordinates must be [X, Y] or [X, Y, Z]`);
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Helper: Create a valid CACP Event Notification from extracted feature data.
 * Used by DGX Interceptor after VLM processing.
 */
export function createCacpEvent(
  projectId: string,
  surveyorId: string,
  rawText: string,
  commandCategory: CacpCommandCategory,
  features: CacpFeature[],
  location?: { latitude: number; longitude: number; elevation?: number },
  confidence: number = 0.95
): CacpEventNotification {
  return {
    version: '1.0.0',
    event_id: generateUuid(),
    timestamp: new Date().toISOString(),
    session_context: {
      project_id: projectId,
      surveyor_id: surveyorId,
      location,
    },
    intent: {
      raw_text: rawText,
      command_category: commandCategory,
      confidence,
    },
    payload: {
      features,
    },
  };
}

/**
 * Helper: Generate a UUIDv4 string.
 */
function generateUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
