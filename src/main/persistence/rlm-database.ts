/**
 * RLM Persistence Layer
 * SQLite database for RLM metadata, indices, and learning data
 */

import Database from 'better-sqlite3';
import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { EventEmitter } from 'events';
import {
  ContextStoreRow,
  ContextSectionRow,
  SearchIndexEntry,
  SearchResultRow,
  SearchResult,
  RLMSessionRow,
  OutcomeRow,
  PatternRow,
  ExperienceRow,
  InsightRow,
  VectorRow,
} from './rlm-database.types';

export interface RLMDatabaseConfig {
  dbPath?: string;
  contentDir?: string;
  enableWAL?: boolean;
  cacheSize?: number; // MB
}

export class RLMDatabase extends EventEmitter {
  private static instance: RLMDatabase;
  private db: Database.Database;
  private contentDir: string;
  private config: RLMDatabaseConfig;
  private initialized = false;

  // Threshold for inline vs file storage (in bytes)
  private readonly INLINE_THRESHOLD = 4096; // 4KB

  private constructor(config: RLMDatabaseConfig = {}) {
    super();
    const userDataPath = app?.getPath?.('userData') || path.join(process.cwd(), '.rlm-data');

    this.config = {
      dbPath: config.dbPath || path.join(userDataPath, 'rlm', 'rlm.db'),
      contentDir: config.contentDir || path.join(userDataPath, 'rlm', 'content'),
      enableWAL: config.enableWAL ?? true,
      cacheSize: config.cacheSize ?? 64,
    };

    this.contentDir = this.config.contentDir!;
    this.ensureDirectories();
    this.db = this.initializeDatabase();
    this.initialized = true;
  }

  static getInstance(config?: RLMDatabaseConfig): RLMDatabase {
    if (!this.instance) {
      this.instance = new RLMDatabase(config);
    }
    return this.instance;
  }

  static resetInstance(): void {
    if (this.instance) {
      this.instance.close();
      this.instance = undefined as unknown as RLMDatabase;
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  private ensureDirectories(): void {
    const dbDir = path.dirname(this.config.dbPath!);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    if (!fs.existsSync(this.config.contentDir!)) {
      fs.mkdirSync(this.config.contentDir!, { recursive: true });
    }
  }

  private initializeDatabase(): Database.Database {
    const db = new Database(this.config.dbPath!);

    if (this.config.enableWAL) {
      db.pragma('journal_mode = WAL');
    }
    db.pragma(`cache_size = -${this.config.cacheSize! * 1024}`); // Negative = KB
    db.pragma('foreign_keys = ON');

    this.createTables(db);
    this.emit('database:initialized', { path: this.config.dbPath });
    return db;
  }

  private createTables(db: Database.Database): void {
    // Context Stores table
    db.exec(`
      CREATE TABLE IF NOT EXISTS context_stores (
        id TEXT PRIMARY KEY,
        instance_id TEXT NOT NULL,
        total_tokens INTEGER DEFAULT 0,
        total_size INTEGER DEFAULT 0,
        access_count INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        last_accessed INTEGER NOT NULL,
        config_json TEXT,
        UNIQUE(instance_id)
      );

      CREATE INDEX IF NOT EXISTS idx_stores_instance
        ON context_stores(instance_id);
      CREATE INDEX IF NOT EXISTS idx_stores_accessed
        ON context_stores(last_accessed);
    `);

    // Context Sections table
    db.exec(`
      CREATE TABLE IF NOT EXISTS context_sections (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        source TEXT,
        start_offset INTEGER NOT NULL,
        end_offset INTEGER NOT NULL,
        tokens INTEGER NOT NULL,
        checksum TEXT,
        depth INTEGER DEFAULT 0,
        summarizes_json TEXT,
        parent_summary_id TEXT,
        file_path TEXT,
        language TEXT,
        source_url TEXT,
        created_at INTEGER NOT NULL,
        content_file TEXT,
        content_inline TEXT,
        FOREIGN KEY (store_id) REFERENCES context_stores(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_sections_store
        ON context_sections(store_id);
      CREATE INDEX IF NOT EXISTS idx_sections_type
        ON context_sections(type);
      CREATE INDEX IF NOT EXISTS idx_sections_offset
        ON context_sections(store_id, start_offset);
      CREATE INDEX IF NOT EXISTS idx_sections_depth
        ON context_sections(store_id, depth);
    `);

    // Search Index table (inverted index)
    db.exec(`
      CREATE TABLE IF NOT EXISTS search_index (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_id TEXT NOT NULL,
        term TEXT NOT NULL,
        section_id TEXT NOT NULL,
        line_number INTEGER,
        position INTEGER,
        snippet TEXT,
        FOREIGN KEY (store_id) REFERENCES context_stores(id) ON DELETE CASCADE,
        FOREIGN KEY (section_id) REFERENCES context_sections(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_search_store_term
        ON search_index(store_id, term);
      CREATE INDEX IF NOT EXISTS idx_search_section
        ON search_index(section_id);
    `);

    // RLM Sessions table
    db.exec(`
      CREATE TABLE IF NOT EXISTS rlm_sessions (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        instance_id TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        last_activity_at INTEGER NOT NULL,
        total_queries INTEGER DEFAULT 0,
        total_root_tokens INTEGER DEFAULT 0,
        total_sub_query_tokens INTEGER DEFAULT 0,
        estimated_direct_tokens INTEGER DEFAULT 0,
        token_savings_percent REAL DEFAULT 0,
        queries_json TEXT,
        recursive_calls_json TEXT,
        FOREIGN KEY (store_id) REFERENCES context_stores(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_store
        ON rlm_sessions(store_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_instance
        ON rlm_sessions(instance_id);
    `);

    // Outcomes table
    db.exec(`
      CREATE TABLE IF NOT EXISTS outcomes (
        id TEXT PRIMARY KEY,
        task_type TEXT NOT NULL,
        success INTEGER NOT NULL,
        timestamp INTEGER NOT NULL,
        duration_ms INTEGER,
        token_usage INTEGER,
        agent_id TEXT,
        model TEXT,
        error_type TEXT,
        prompt_hash TEXT,
        tools_json TEXT,
        metadata_json TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_outcomes_task
        ON outcomes(task_type);
      CREATE INDEX IF NOT EXISTS idx_outcomes_timestamp
        ON outcomes(timestamp);
      CREATE INDEX IF NOT EXISTS idx_outcomes_agent
        ON outcomes(agent_id);
    `);

    // Patterns table
    db.exec(`
      CREATE TABLE IF NOT EXISTS patterns (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        key TEXT NOT NULL,
        effectiveness REAL NOT NULL,
        sample_size INTEGER NOT NULL,
        last_updated INTEGER NOT NULL,
        metadata_json TEXT,
        UNIQUE(type, key)
      );

      CREATE INDEX IF NOT EXISTS idx_patterns_type
        ON patterns(type);
      CREATE INDEX IF NOT EXISTS idx_patterns_effectiveness
        ON patterns(effectiveness);
    `);

    // Experiences table
    db.exec(`
      CREATE TABLE IF NOT EXISTS experiences (
        id TEXT PRIMARY KEY,
        task_type TEXT NOT NULL UNIQUE,
        success_count INTEGER DEFAULT 0,
        failure_count INTEGER DEFAULT 0,
        success_patterns_json TEXT,
        failure_patterns_json TEXT,
        example_prompts_json TEXT,
        last_updated INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_experiences_task
        ON experiences(task_type);
    `);

    // Insights table
    db.exec(`
      CREATE TABLE IF NOT EXISTS insights (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        confidence REAL NOT NULL,
        supporting_patterns_json TEXT,
        created_at INTEGER NOT NULL,
        expires_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_insights_type
        ON insights(type);
      CREATE INDEX IF NOT EXISTS idx_insights_confidence
        ON insights(confidence);
    `);

    // Vectors table (for semantic search)
    db.exec(`
      CREATE TABLE IF NOT EXISTS vectors (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL,
        section_id TEXT NOT NULL,
        embedding BLOB NOT NULL,
        dimensions INTEGER NOT NULL,
        content_preview TEXT,
        metadata_json TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (store_id) REFERENCES context_stores(id) ON DELETE CASCADE,
        FOREIGN KEY (section_id) REFERENCES context_sections(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_vectors_store
        ON vectors(store_id);
      CREATE INDEX IF NOT EXISTS idx_vectors_section
        ON vectors(section_id);
    `);
  }

  // ============================================
  // Content File Management
  // ============================================

  private getContentPath(sectionId: string): string {
    // Distribute files across subdirectories to avoid filesystem limits
    const prefix = sectionId.substring(0, 2);
    const dir = path.join(this.contentDir, prefix);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return path.join(dir, `${sectionId}.txt`);
  }

  saveContent(sectionId: string, content: string): string {
    const filePath = this.getContentPath(sectionId);
    fs.writeFileSync(filePath, content, 'utf-8');
    return filePath;
  }

  loadContent(sectionId: string): string | null {
    const filePath = this.getContentPath(sectionId);
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8');
    }
    return null;
  }

  deleteContent(sectionId: string): void {
    const filePath = this.getContentPath(sectionId);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  shouldStoreInline(content: string): boolean {
    return Buffer.byteLength(content, 'utf-8') <= this.INLINE_THRESHOLD;
  }

  // ============================================
  // Context Store CRUD
  // ============================================

  createStore(store: {
    id: string;
    instanceId: string;
    config?: Record<string, unknown>;
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO context_stores
        (id, instance_id, created_at, last_accessed, config_json)
      VALUES (?, ?, ?, ?, ?)
    `);

    const now = Date.now();
    stmt.run(
      store.id,
      store.instanceId,
      now,
      now,
      store.config ? JSON.stringify(store.config) : null
    );
    this.emit('store:created', { id: store.id, instanceId: store.instanceId });
  }

  getStore(storeId: string): ContextStoreRow | null {
    const stmt = this.db.prepare(`
      SELECT * FROM context_stores WHERE id = ?
    `);
    return stmt.get(storeId) as ContextStoreRow | null;
  }

  getStoreByInstance(instanceId: string): ContextStoreRow | null {
    const stmt = this.db.prepare(`
      SELECT * FROM context_stores WHERE instance_id = ?
    `);
    return stmt.get(instanceId) as ContextStoreRow | null;
  }

  listStores(): ContextStoreRow[] {
    const stmt = this.db.prepare(`
      SELECT * FROM context_stores ORDER BY last_accessed DESC
    `);
    return stmt.all() as ContextStoreRow[];
  }

  updateStoreStats(storeId: string, stats: {
    totalTokens?: number;
    totalSize?: number;
    accessCount?: number;
  }): void {
    const updates: string[] = ['last_accessed = ?'];
    const params: (string | number)[] = [Date.now()];

    if (stats.totalTokens !== undefined) {
      updates.push('total_tokens = ?');
      params.push(stats.totalTokens);
    }
    if (stats.totalSize !== undefined) {
      updates.push('total_size = ?');
      params.push(stats.totalSize);
    }
    if (stats.accessCount !== undefined) {
      updates.push('access_count = ?');
      params.push(stats.accessCount);
    }

    params.push(storeId);

    const stmt = this.db.prepare(`
      UPDATE context_stores SET ${updates.join(', ')} WHERE id = ?
    `);
    stmt.run(...params);
  }

  deleteStore(storeId: string): void {
    // Get all sections to delete content files
    const sections = this.getSections(storeId);
    for (const section of sections) {
      if (section.content_file) {
        this.deleteContent(section.id);
      }
    }

    // CASCADE will delete sections, search_index, sessions
    const stmt = this.db.prepare(`DELETE FROM context_stores WHERE id = ?`);
    stmt.run(storeId);
    this.emit('store:deleted', { id: storeId });
  }

  // ============================================
  // Section CRUD
  // ============================================

  addSection(section: {
    id: string;
    storeId: string;
    type: string;
    name: string;
    source?: string;
    startOffset: number;
    endOffset: number;
    tokens: number;
    checksum?: string;
    depth?: number;
    summarizes?: string[];
    parentSummaryId?: string;
    filePath?: string;
    language?: string;
    sourceUrl?: string;
    content: string;
  }): void {
    const isInline = this.shouldStoreInline(section.content);
    let contentFile: string | null = null;
    let contentInline: string | null = null;

    if (isInline) {
      contentInline = section.content;
    } else {
      contentFile = this.saveContent(section.id, section.content);
    }

    const stmt = this.db.prepare(`
      INSERT INTO context_sections
        (id, store_id, type, name, source, start_offset, end_offset, tokens,
         checksum, depth, summarizes_json, parent_summary_id, file_path, language,
         source_url, created_at, content_file, content_inline)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      section.id,
      section.storeId,
      section.type,
      section.name,
      section.source || null,
      section.startOffset,
      section.endOffset,
      section.tokens,
      section.checksum || null,
      section.depth || 0,
      section.summarizes ? JSON.stringify(section.summarizes) : null,
      section.parentSummaryId || null,
      section.filePath || null,
      section.language || null,
      section.sourceUrl || null,
      Date.now(),
      contentFile,
      contentInline
    );

    // Update store stats
    this.updateStoreStatsForSection(section.storeId, section.tokens, section.content.length, 'add');
    this.emit('section:added', { id: section.id, storeId: section.storeId });
  }

  getSection(sectionId: string): ContextSectionRow | null {
    const stmt = this.db.prepare(`
      SELECT * FROM context_sections WHERE id = ?
    `);
    return stmt.get(sectionId) as ContextSectionRow | null;
  }

  getSectionContent(section: ContextSectionRow): string {
    if (section.content_inline) {
      return section.content_inline;
    }
    if (section.content_file) {
      return this.loadContent(section.id) || '';
    }
    return '';
  }

  getSections(storeId: string, options?: {
    type?: string;
    minDepth?: number;
    maxDepth?: number;
    limit?: number;
    offset?: number;
  }): ContextSectionRow[] {
    let query = `SELECT * FROM context_sections WHERE store_id = ?`;
    const params: (string | number)[] = [storeId];

    if (options?.type) {
      query += ` AND type = ?`;
      params.push(options.type);
    }
    if (options?.minDepth !== undefined) {
      query += ` AND depth >= ?`;
      params.push(options.minDepth);
    }
    if (options?.maxDepth !== undefined) {
      query += ` AND depth <= ?`;
      params.push(options.maxDepth);
    }

    query += ` ORDER BY start_offset ASC`;

    if (options?.limit) {
      query += ` LIMIT ?`;
      params.push(options.limit);
      if (options?.offset) {
        query += ` OFFSET ?`;
        params.push(options.offset);
      }
    }

    const stmt = this.db.prepare(query);
    return stmt.all(...params) as ContextSectionRow[];
  }

  removeSection(sectionId: string): void {
    const section = this.getSection(sectionId);
    if (!section) return;

    // Delete content file if exists
    if (section.content_file) {
      this.deleteContent(sectionId);
    }

    // Update store stats
    const content = this.getSectionContent(section);
    this.updateStoreStatsForSection(
      section.store_id,
      section.tokens,
      content.length,
      'remove'
    );

    // Delete section (CASCADE deletes search_index entries)
    const stmt = this.db.prepare(`DELETE FROM context_sections WHERE id = ?`);
    stmt.run(sectionId);
    this.emit('section:removed', { id: sectionId, storeId: section.store_id });
  }

  private updateStoreStatsForSection(
    storeId: string,
    tokens: number,
    size: number,
    operation: 'add' | 'remove'
  ): void {
    const multiplier = operation === 'add' ? 1 : -1;
    const stmt = this.db.prepare(`
      UPDATE context_stores
      SET total_tokens = total_tokens + ?,
          total_size = total_size + ?,
          last_accessed = ?
      WHERE id = ?
    `);
    stmt.run(tokens * multiplier, size * multiplier, Date.now(), storeId);
  }

  // ============================================
  // Search Index Operations
  // ============================================

  indexSection(storeId: string, sectionId: string, content: string): void {
    // Clear existing index entries for this section
    const clearStmt = this.db.prepare(`
      DELETE FROM search_index WHERE section_id = ?
    `);
    clearStmt.run(sectionId);

    // Tokenize and index
    const lines = content.split('\n');
    const insertStmt = this.db.prepare(`
      INSERT INTO search_index (store_id, term, section_id, line_number, position, snippet)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction((entries: SearchIndexEntry[]) => {
      for (const entry of entries) {
        insertStmt.run(
          entry.storeId,
          entry.term,
          entry.sectionId,
          entry.lineNumber,
          entry.position,
          entry.snippet
        );
      }
    });

    const entries: SearchIndexEntry[] = [];
    let position = 0;
    const seenTermsInLine = new Set<string>();

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      const words = line.toLowerCase().match(/\b\w{3,}\b/g) || [];
      seenTermsInLine.clear();

      for (const word of words) {
        // Dedupe within same line to avoid index bloat
        if (seenTermsInLine.has(word)) continue;
        seenTermsInLine.add(word);

        entries.push({
          storeId,
          term: word,
          sectionId,
          lineNumber: lineNum + 1,
          position,
          snippet: line.substring(0, 200),
        });
      }
      position += line.length + 1;
    }

    // Batch insert for performance
    insertMany(entries);
  }

  searchIndex(storeId: string, pattern: string, options?: {
    limit?: number;
    caseSensitive?: boolean;
  }): SearchResult[] {
    const limit = options?.limit || 100;
    const terms = pattern.toLowerCase().match(/\b\w{3,}\b/g) || [pattern.toLowerCase()];

    // Find sections containing all terms
    const placeholders = terms.map(() => '?').join(',');
    const stmt = this.db.prepare(`
      SELECT
        si.section_id,
        si.line_number,
        si.position,
        si.snippet,
        cs.type as section_type,
        cs.name as section_name,
        cs.source as section_source,
        COUNT(DISTINCT si.term) as term_matches
      FROM search_index si
      JOIN context_sections cs ON si.section_id = cs.id
      WHERE si.store_id = ?
        AND si.term IN (${placeholders})
      GROUP BY si.section_id, si.line_number
      HAVING term_matches >= ?
      ORDER BY term_matches DESC, si.line_number ASC
      LIMIT ?
    `);

    const minMatches = Math.max(1, Math.ceil(terms.length * 0.5)); // At least 50% of terms
    const results = stmt.all(storeId, ...terms, minMatches, limit) as SearchResultRow[];

    return results.map(r => ({
      sectionId: r.section_id,
      lineNumber: r.line_number,
      position: r.position,
      snippet: r.snippet,
      sectionType: r.section_type,
      sectionName: r.section_name,
      sectionSource: r.section_source,
      relevance: r.term_matches / terms.length,
    }));
  }

  rebuildIndex(storeId: string): void {
    const sections = this.getSections(storeId, { maxDepth: 0 }); // Only original content

    for (const section of sections) {
      const content = this.getSectionContent(section);
      this.indexSection(storeId, section.id, content);
    }
    this.emit('index:rebuilt', { storeId, sectionCount: sections.length });
  }

  // ============================================
  // Session Operations
  // ============================================

  createSession(session: {
    id: string;
    storeId: string;
    instanceId: string;
    estimatedDirectTokens: number;
  }): void {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO rlm_sessions
        (id, store_id, instance_id, started_at, last_activity_at, estimated_direct_tokens)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      session.id,
      session.storeId,
      session.instanceId,
      now,
      now,
      session.estimatedDirectTokens
    );
  }

  getSession(sessionId: string): RLMSessionRow | null {
    const stmt = this.db.prepare(`SELECT * FROM rlm_sessions WHERE id = ?`);
    return stmt.get(sessionId) as RLMSessionRow | null;
  }

  listSessions(storeId?: string): RLMSessionRow[] {
    if (storeId) {
      const stmt = this.db.prepare(`
        SELECT * FROM rlm_sessions WHERE store_id = ? ORDER BY started_at DESC
      `);
      return stmt.all(storeId) as RLMSessionRow[];
    }
    const stmt = this.db.prepare(`SELECT * FROM rlm_sessions ORDER BY started_at DESC`);
    return stmt.all() as RLMSessionRow[];
  }

  updateSession(sessionId: string, updates: {
    totalQueries?: number;
    totalRootTokens?: number;
    totalSubQueryTokens?: number;
    tokenSavingsPercent?: number;
    queriesJson?: string;
    recursiveCallsJson?: string;
  }): void {
    const setClause: string[] = ['last_activity_at = ?'];
    const params: (string | number)[] = [Date.now()];

    if (updates.totalQueries !== undefined) {
      setClause.push('total_queries = ?');
      params.push(updates.totalQueries);
    }
    if (updates.totalRootTokens !== undefined) {
      setClause.push('total_root_tokens = ?');
      params.push(updates.totalRootTokens);
    }
    if (updates.totalSubQueryTokens !== undefined) {
      setClause.push('total_sub_query_tokens = ?');
      params.push(updates.totalSubQueryTokens);
    }
    if (updates.tokenSavingsPercent !== undefined) {
      setClause.push('token_savings_percent = ?');
      params.push(updates.tokenSavingsPercent);
    }
    if (updates.queriesJson !== undefined) {
      setClause.push('queries_json = ?');
      params.push(updates.queriesJson);
    }
    if (updates.recursiveCallsJson !== undefined) {
      setClause.push('recursive_calls_json = ?');
      params.push(updates.recursiveCallsJson);
    }

    params.push(sessionId);

    const stmt = this.db.prepare(`
      UPDATE rlm_sessions SET ${setClause.join(', ')} WHERE id = ?
    `);
    stmt.run(...params);
  }

  endSession(sessionId: string): void {
    const stmt = this.db.prepare(`
      UPDATE rlm_sessions SET ended_at = ?, last_activity_at = ? WHERE id = ?
    `);
    const now = Date.now();
    stmt.run(now, now, sessionId);
  }

  // ============================================
  // Outcome Operations
  // ============================================

  addOutcome(outcome: {
    id: string;
    taskType: string;
    success: boolean;
    timestamp: number;
    durationMs?: number;
    tokenUsage?: number;
    agentId?: string;
    model?: string;
    errorType?: string;
    promptHash?: string;
    tools?: string[];
    metadata?: Record<string, unknown>;
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO outcomes
        (id, task_type, success, timestamp, duration_ms, token_usage, agent_id,
         model, error_type, prompt_hash, tools_json, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      outcome.id,
      outcome.taskType,
      outcome.success ? 1 : 0,
      outcome.timestamp,
      outcome.durationMs || null,
      outcome.tokenUsage || null,
      outcome.agentId || null,
      outcome.model || null,
      outcome.errorType || null,
      outcome.promptHash || null,
      outcome.tools ? JSON.stringify(outcome.tools) : null,
      outcome.metadata ? JSON.stringify(outcome.metadata) : null
    );
  }

  getOutcomes(options?: {
    taskType?: string;
    agentId?: string;
    since?: number;
    limit?: number;
  }): OutcomeRow[] {
    let query = `SELECT * FROM outcomes WHERE 1=1`;
    const params: (string | number)[] = [];

    if (options?.taskType) {
      query += ` AND task_type = ?`;
      params.push(options.taskType);
    }
    if (options?.agentId) {
      query += ` AND agent_id = ?`;
      params.push(options.agentId);
    }
    if (options?.since) {
      query += ` AND timestamp >= ?`;
      params.push(options.since);
    }

    query += ` ORDER BY timestamp DESC`;

    if (options?.limit) {
      query += ` LIMIT ?`;
      params.push(options.limit);
    }

    const stmt = this.db.prepare(query);
    return stmt.all(...params) as OutcomeRow[];
  }

  // ============================================
  // Pattern Operations
  // ============================================

  upsertPattern(pattern: {
    id: string;
    type: string;
    key: string;
    effectiveness: number;
    sampleSize: number;
    metadata?: Record<string, unknown>;
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO patterns (id, type, key, effectiveness, sample_size, last_updated, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(type, key) DO UPDATE SET
        effectiveness = excluded.effectiveness,
        sample_size = excluded.sample_size,
        last_updated = excluded.last_updated,
        metadata_json = excluded.metadata_json
    `);
    stmt.run(
      pattern.id,
      pattern.type,
      pattern.key,
      pattern.effectiveness,
      pattern.sampleSize,
      Date.now(),
      pattern.metadata ? JSON.stringify(pattern.metadata) : null
    );
  }

  getPatterns(type?: string): PatternRow[] {
    if (type) {
      const stmt = this.db.prepare(`
        SELECT * FROM patterns WHERE type = ? ORDER BY effectiveness DESC
      `);
      return stmt.all(type) as PatternRow[];
    }
    const stmt = this.db.prepare(`SELECT * FROM patterns ORDER BY effectiveness DESC`);
    return stmt.all() as PatternRow[];
  }

  // ============================================
  // Experience Operations
  // ============================================

  upsertExperience(experience: {
    id: string;
    taskType: string;
    successCount: number;
    failureCount: number;
    successPatterns?: string[];
    failurePatterns?: string[];
    examplePrompts?: string[];
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO experiences
        (id, task_type, success_count, failure_count, success_patterns_json,
         failure_patterns_json, example_prompts_json, last_updated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(task_type) DO UPDATE SET
        success_count = excluded.success_count,
        failure_count = excluded.failure_count,
        success_patterns_json = excluded.success_patterns_json,
        failure_patterns_json = excluded.failure_patterns_json,
        example_prompts_json = excluded.example_prompts_json,
        last_updated = excluded.last_updated
    `);
    stmt.run(
      experience.id,
      experience.taskType,
      experience.successCount,
      experience.failureCount,
      experience.successPatterns ? JSON.stringify(experience.successPatterns) : null,
      experience.failurePatterns ? JSON.stringify(experience.failurePatterns) : null,
      experience.examplePrompts ? JSON.stringify(experience.examplePrompts) : null,
      Date.now()
    );
  }

  getExperience(taskType: string): ExperienceRow | null {
    const stmt = this.db.prepare(`SELECT * FROM experiences WHERE task_type = ?`);
    return stmt.get(taskType) as ExperienceRow | null;
  }

  getAllExperiences(): ExperienceRow[] {
    const stmt = this.db.prepare(`SELECT * FROM experiences ORDER BY last_updated DESC`);
    return stmt.all() as ExperienceRow[];
  }

  // ============================================
  // Insight Operations
  // ============================================

  addInsight(insight: {
    id: string;
    type: string;
    title: string;
    description?: string;
    confidence: number;
    supportingPatterns?: string[];
    expiresAt?: number;
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO insights
        (id, type, title, description, confidence, supporting_patterns_json, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      insight.id,
      insight.type,
      insight.title,
      insight.description || null,
      insight.confidence,
      insight.supportingPatterns ? JSON.stringify(insight.supportingPatterns) : null,
      Date.now(),
      insight.expiresAt || null
    );
  }

  getInsights(type?: string): InsightRow[] {
    const now = Date.now();
    if (type) {
      const stmt = this.db.prepare(`
        SELECT * FROM insights
        WHERE type = ? AND (expires_at IS NULL OR expires_at > ?)
        ORDER BY confidence DESC
      `);
      return stmt.all(type, now) as InsightRow[];
    }
    const stmt = this.db.prepare(`
      SELECT * FROM insights
      WHERE expires_at IS NULL OR expires_at > ?
      ORDER BY confidence DESC
    `);
    return stmt.all(now) as InsightRow[];
  }

  // ============================================
  // Vector Operations (for semantic search)
  // ============================================

  addVector(vector: {
    id: string;
    storeId: string;
    sectionId: string;
    embedding: number[];
    contentPreview?: string;
    metadata?: Record<string, unknown>;
  }): void {
    const embeddingBuffer = Buffer.from(new Float32Array(vector.embedding).buffer);
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO vectors
        (id, store_id, section_id, embedding, dimensions, content_preview, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      vector.id,
      vector.storeId,
      vector.sectionId,
      embeddingBuffer,
      vector.embedding.length,
      vector.contentPreview || null,
      vector.metadata ? JSON.stringify(vector.metadata) : null,
      Date.now()
    );
  }

  getVectors(storeId: string): VectorRow[] {
    const stmt = this.db.prepare(`SELECT * FROM vectors WHERE store_id = ?`);
    return stmt.all(storeId) as VectorRow[];
  }

  getVectorBySectionId(sectionId: string): VectorRow | null {
    const stmt = this.db.prepare(`SELECT * FROM vectors WHERE section_id = ?`);
    return stmt.get(sectionId) as VectorRow | null;
  }

  deleteVector(sectionId: string): void {
    const stmt = this.db.prepare(`DELETE FROM vectors WHERE section_id = ?`);
    stmt.run(sectionId);
  }

  // Helper to convert buffer back to embedding array
  bufferToEmbedding(buffer: Buffer): number[] {
    return Array.from(new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4));
  }

  // ============================================
  // Utility Methods
  // ============================================

  getStats(): {
    stores: number;
    sections: number;
    sessions: number;
    outcomes: number;
    patterns: number;
    experiences: number;
    insights: number;
    vectors: number;
    dbSizeBytes: number;
  } {
    const counts = this.db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM context_stores) as stores,
        (SELECT COUNT(*) FROM context_sections) as sections,
        (SELECT COUNT(*) FROM rlm_sessions) as sessions,
        (SELECT COUNT(*) FROM outcomes) as outcomes,
        (SELECT COUNT(*) FROM patterns) as patterns,
        (SELECT COUNT(*) FROM experiences) as experiences,
        (SELECT COUNT(*) FROM insights) as insights,
        (SELECT COUNT(*) FROM vectors) as vectors
    `).get() as {
      stores: number;
      sections: number;
      sessions: number;
      outcomes: number;
      patterns: number;
      experiences: number;
      insights: number;
      vectors: number;
    };

    const dbStats = fs.statSync(this.config.dbPath!);

    return {
      stores: counts.stores,
      sections: counts.sections,
      sessions: counts.sessions,
      outcomes: counts.outcomes,
      patterns: counts.patterns,
      experiences: counts.experiences,
      insights: counts.insights,
      vectors: counts.vectors,
      dbSizeBytes: dbStats.size,
    };
  }

  vacuum(): void {
    this.db.exec('VACUUM');
    this.emit('database:vacuumed');
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.emit('database:closed');
    }
  }

  // Get database path for debugging
  getDatabasePath(): string {
    return this.config.dbPath!;
  }

  getContentDir(): string {
    return this.contentDir;
  }
}

// Export singleton getter
export function getRLMDatabase(config?: RLMDatabaseConfig): RLMDatabase {
  return RLMDatabase.getInstance(config);
}
