import { CaseState, buildCaseStateFromDb } from './caseState.js';
import { getDb } from '../../db/client.js';

export interface AgentStateAdapter {
  name: 'omega' | 'local';
  load(caseId: string): Promise<CaseState | null>;
  save(caseId: string, state: CaseState): Promise<{ ref?: string }>;
  recordAgentEvent?(caseId: string, event: any): Promise<void>;
}

export class LocalStateAdapter implements AgentStateAdapter {
  name = 'local' as const;

  async load(caseId: string): Promise<CaseState | null> {
    const db = await getDb();
    const row = db.prepare<any>(`
      SELECT state_json, state_version, updated_at
      FROM case_state_store
      WHERE case_id = ?
    `).get(caseId);

    if (row && row.state_json) {
      try {
        return JSON.parse(row.state_json) as CaseState;
      } catch (err) {
        console.error('Failed to parse state_json from case_state_store, rebuilding from tables:', err);
      }
    }

    return await buildCaseStateFromDb(caseId);
  }

  async save(caseId: string, state: CaseState): Promise<{ ref?: string }> {
    const db = await getDb();
    const now = new Date().toISOString();
    const json = JSON.stringify(state);
    const newVersion = (state.stateVersion || 0) + 1;
    state.stateVersion = newVersion;

    db.prepare(`
      INSERT INTO case_state_store (case_id, state_json, state_version, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(case_id) DO UPDATE SET
        state_json = excluded.state_json,
        state_version = excluded.state_version,
        updated_at = excluded.updated_at
    `).run(caseId, json, newVersion, now);

    return { ref: `local:case:${caseId}:v${newVersion}` };
  }

  async recordAgentEvent(caseId: string, event: any): Promise<void> {
    // Local events are logged through audit_log and timeline_events
  }
}
