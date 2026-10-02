import { AgentStateAdapter, LocalStateAdapter } from './localStateAdapter.js';
import { CaseState } from './caseState.js';
import { env } from '../../config/env.js';

export class OmegaNotConfiguredError extends Error {
  constructor(message = 'Omega API key is not configured.') {
    super(message);
    this.name = 'OmegaNotConfiguredError';
  }
}

export class OmegaAdapter implements AgentStateAdapter {
  name = 'omega' as const;
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    if (!env.OMEGA_API_KEY || env.OMEGA_API_KEY.trim().length === 0) {
      throw new OmegaNotConfiguredError('Cannot instantiate OmegaAdapter without OMEGA_API_KEY.');
    }
    this.apiKey = env.OMEGA_API_KEY;
    this.baseUrl = env.OMEGA_BASE_URL || 'https://api.omega.agent.dev/v1';
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async load(caseId: string): Promise<CaseState | null> {
    try {
      const response = await fetch(`${this.baseUrl}/sessions/${caseId}/state`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw new Error(`Omega API returned HTTP ${response.status}`);
      }

      const data = await response.json();
      return (data as any).state as CaseState;
    } catch (err) {
      console.warn(`[OmegaAdapter] State retrieval failed: ${(err as Error).message}. Falling back.`);
      throw err;
    }
  }

  async save(caseId: string, state: CaseState): Promise<{ ref?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/sessions/${caseId}/state`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ state })
      });

      if (!response.ok) {
        throw new Error(`Omega API returned HTTP ${response.status}`);
      }

      const result = (await response.json()) as any;
      return { ref: result.session_ref || `omega:session:${caseId}` };
    } catch (err) {
      console.warn(`[OmegaAdapter] State persistence failed: ${(err as Error).message}.`);
      throw err;
    }
  }

  async recordAgentEvent(caseId: string, event: any): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/sessions/${caseId}/events`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ event })
      });
    } catch (err) {
      console.warn(`[OmegaAdapter] Event recording error: ${(err as Error).message}`);
    }
  }
}

export function getActiveStateAdapter(): AgentStateAdapter {
  if (env.OMEGA_API_KEY && env.OMEGA_API_KEY.trim().length > 0) {
    try {
      return new OmegaAdapter();
    } catch (err) {
      console.warn('Omega configured but failed to instantiate, falling back to local adapter:', err);
    }
  }
  return new LocalStateAdapter();
}
