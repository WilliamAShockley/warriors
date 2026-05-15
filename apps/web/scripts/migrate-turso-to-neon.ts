/**
 * Turso (SQLite) -> Neon (Postgres) data migration script.
 *
 * Usage:
 *   # Install the temporary Turso client dependency first:
 *   pnpm add -D @libsql/client@0.8
 *
 *   # Then run from apps/web/:
 *   npx tsx scripts/migrate-turso-to-neon.ts
 *
 *   # Afterwards you can remove it:
 *   pnpm remove @libsql/client
 *
 * Env vars required (should already be in .env.local):
 *   TURSO_DATABASE_URL  — libsql://warriors-...turso.io
 *   TURSO_AUTH_TOKEN    — Turso auth token
 *   DATABASE_URL        — Neon Postgres connection string
 */

import { createClient, type Client as LibsqlClient } from "@libsql/client";
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Bootstrap env — manual .env parser (no dotenv dependency needed)
// ---------------------------------------------------------------------------
function loadEnvFile(filePath: string): void {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx < 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let value = trimmed.slice(eqIdx + 1).trim();
      // Strip surrounding quotes
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      // Only set if not already defined (first file wins)
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    // File doesn't exist — that's fine
  }
}

// Resolve to apps/web/ root from apps/web/scripts/
const webRoot = path.resolve(__dirname, "..");
loadEnvFile(path.join(webRoot, ".env.local"));
loadEnvFile(path.join(webRoot, ".env"));

// ---------------------------------------------------------------------------
// Connections
// ---------------------------------------------------------------------------
function getTursoClient(): LibsqlClient {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url) throw new Error("TURSO_DATABASE_URL is not set");
  if (!authToken) throw new Error("TURSO_AUTH_TOKEN is not set");
  return createClient({ url, authToken: authToken.trim() });
}

function getPrismaClient(): PrismaClient {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  return new PrismaClient();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse an ISO-8601 (or SQLite-style) date string into a JS Date, or null. */
function toDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return value;
  const d = new Date(String(value));
  return isNaN(d.getTime()) ? null : d;
}

/** Force a value to a Date (throw-safe — defaults to now()). */
function toDateRequired(value: unknown): Date {
  const d = toDate(value);
  return d ?? new Date();
}

/** Safely cast a value to a boolean. SQLite stores booleans as 0/1. */
function toBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value === "1" || value.toLowerCase() === "true";
  return false;
}

/** Safely cast to int (or null). */
function toInt(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return isNaN(n) ? null : Math.round(n);
}

/** Safely cast to float (or null). */
function toFloat(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return isNaN(n) ? null : n;
}

/** Safely cast to string (or null). */
function toStr(value: unknown): string | null {
  if (value == null || value === "") return null;
  return String(value);
}

/** Safely cast to string (required — default to ""). */
function toStrReq(value: unknown): string {
  if (value == null) return "";
  return String(value);
}

// ---------------------------------------------------------------------------
// Read all rows from a Turso table via plain SQL
// ---------------------------------------------------------------------------
async function readTursoTable(turso: LibsqlClient, table: string): Promise<Record<string, unknown>[]> {
  try {
    const result = await turso.execute(`SELECT * FROM "${table}"`);
    // Convert libsql Row objects to plain objects
    return result.rows.map((row) => {
      const obj: Record<string, unknown> = {};
      for (const col of result.columns) {
        obj[col] = (row as any)[col];
      }
      return obj;
    });
  } catch (err: any) {
    // Table might not exist in older Turso schema
    if (
      err.message?.includes("no such table") ||
      err.message?.includes("does not exist")
    ) {
      return [];
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Per-table migration functions
// ---------------------------------------------------------------------------

async function migrateSettings(turso: LibsqlClient, prisma: PrismaClient): Promise<number> {
  const rows = await readTursoTable(turso, "Setting");
  let count = 0;
  for (const r of rows) {
    try {
      await prisma.setting.upsert({
        where: { key: String(r.key) },
        update: {
          value: toStrReq(r.value),
          updatedAt: toDateRequired(r.updatedAt),
        },
        create: {
          key: String(r.key),
          value: toStrReq(r.value),
          updatedAt: toDateRequired(r.updatedAt),
        },
      });
      count++;
    } catch (err: any) {
      console.error(`  [Setting] Failed row key=${r.key}: ${err.message}`);
    }
  }
  return count;
}

async function migrateGmailToken(turso: LibsqlClient, prisma: PrismaClient): Promise<number> {
  const rows = await readTursoTable(turso, "GmailToken");
  let count = 0;
  for (const r of rows) {
    try {
      await prisma.gmailToken.upsert({
        where: { id: toStrReq(r.id) || "singleton" },
        update: {
          accessToken: toStrReq(r.accessToken),
          refreshToken: toStrReq(r.refreshToken),
          expiryDate: toFloat(r.expiryDate) ?? 0,
          email: toStrReq(r.email),
          updatedAt: toDateRequired(r.updatedAt),
        },
        create: {
          id: toStrReq(r.id) || "singleton",
          accessToken: toStrReq(r.accessToken),
          refreshToken: toStrReq(r.refreshToken),
          expiryDate: toFloat(r.expiryDate) ?? 0,
          email: toStrReq(r.email),
          createdAt: toDateRequired(r.createdAt),
          updatedAt: toDateRequired(r.updatedAt),
        },
      });
      count++;
    } catch (err: any) {
      console.error(`  [GmailToken] Failed row id=${r.id}: ${err.message}`);
    }
  }
  return count;
}

async function migrateSkills(turso: LibsqlClient, prisma: PrismaClient): Promise<number> {
  const rows = await readTursoTable(turso, "Skill");
  let count = 0;
  for (const r of rows) {
    try {
      await prisma.skill.upsert({
        where: { id: toStrReq(r.id) },
        update: {
          name: toStrReq(r.name),
          description: toStrReq(r.description),
          prompt: toStrReq(r.prompt),
          section: toStrReq(r.section) || "targets",
          model: toStrReq(r.model) || "claude-opus-4-6",
          updatedAt: toDateRequired(r.updatedAt),
        },
        create: {
          id: toStrReq(r.id),
          name: toStrReq(r.name),
          description: toStrReq(r.description),
          prompt: toStrReq(r.prompt),
          section: toStrReq(r.section) || "targets",
          model: toStrReq(r.model) || "claude-opus-4-6",
          createdAt: toDateRequired(r.createdAt),
          updatedAt: toDateRequired(r.updatedAt),
        },
      });
      count++;
    } catch (err: any) {
      console.error(`  [Skill] Failed row id=${r.id}: ${err.message}`);
    }
  }
  return count;
}

async function migrateTodos(turso: LibsqlClient, prisma: PrismaClient): Promise<number> {
  const rows = await readTursoTable(turso, "Todo");
  let count = 0;
  for (const r of rows) {
    try {
      await prisma.todo.upsert({
        where: { id: toStrReq(r.id) },
        update: {
          text: toStrReq(r.text),
          completed: toBool(r.completed),
          sortOrder: toInt(r.sortOrder) ?? 0,
          updatedAt: toDateRequired(r.updatedAt),
        },
        create: {
          id: toStrReq(r.id),
          text: toStrReq(r.text),
          completed: toBool(r.completed),
          sortOrder: toInt(r.sortOrder) ?? 0,
          createdAt: toDateRequired(r.createdAt),
          updatedAt: toDateRequired(r.updatedAt),
        },
      });
      count++;
    } catch (err: any) {
      console.error(`  [Todo] Failed row id=${r.id}: ${err.message}`);
    }
  }
  return count;
}

async function migrateContentFolders(turso: LibsqlClient, prisma: PrismaClient): Promise<number> {
  const rows = await readTursoTable(turso, "ContentFolder");
  let count = 0;
  for (const r of rows) {
    try {
      await prisma.contentFolder.upsert({
        where: { id: toStrReq(r.id) },
        update: {
          name: toStrReq(r.name),
          updatedAt: toDateRequired(r.updatedAt),
        },
        create: {
          id: toStrReq(r.id),
          name: toStrReq(r.name),
          createdAt: toDateRequired(r.createdAt),
          updatedAt: toDateRequired(r.updatedAt),
        },
      });
      count++;
    } catch (err: any) {
      console.error(`  [ContentFolder] Failed row id=${r.id}: ${err.message}`);
    }
  }
  return count;
}

async function migrateContentLinks(turso: LibsqlClient, prisma: PrismaClient): Promise<number> {
  const rows = await readTursoTable(turso, "ContentLink");
  let count = 0;
  for (const r of rows) {
    try {
      await prisma.contentLink.upsert({
        where: { id: toStrReq(r.id) },
        update: {
          title: toStrReq(r.title),
          url: toStrReq(r.url),
          description: toStr(r.description),
          tag: toStr(r.tag),
          folderId: toStr(r.folderId),
          updatedAt: toDateRequired(r.updatedAt),
        },
        create: {
          id: toStrReq(r.id),
          title: toStrReq(r.title),
          url: toStrReq(r.url),
          description: toStr(r.description),
          tag: toStr(r.tag),
          folderId: toStr(r.folderId),
          createdAt: toDateRequired(r.createdAt),
          updatedAt: toDateRequired(r.updatedAt),
        },
      });
      count++;
    } catch (err: any) {
      console.error(`  [ContentLink] Failed row id=${r.id}: ${err.message}`);
    }
  }
  return count;
}

async function migrateTargets(turso: LibsqlClient, prisma: PrismaClient): Promise<number> {
  const rows = await readTursoTable(turso, "Target");
  let count = 0;
  for (const r of rows) {
    try {
      await prisma.target.upsert({
        where: { id: toStrReq(r.id) },
        update: {
          name: toStrReq(r.name),
          company: toStrReq(r.company),
          email: toStr(r.email),
          linkedin: toStr(r.linkedin),
          websiteUrl: toStr(r.websiteUrl),
          founderName: toStr(r.founderName),
          founderFirstName: toStr(r.founderFirstName),
          founderLastName: toStr(r.founderLastName),
          stage: toStrReq(r.stage) || "intro_sent",
          status: toStrReq(r.status) || "yellow",
          lastContacted: toDate(r.lastContacted),
          notes: toStr(r.notes),
          aiNextStep: toStr(r.aiNextStep),
          industry: toStr(r.industry),
          starred: toBool(r.starred),
          starRank: toInt(r.starRank),
          draftEmailSubject: toStr(r.draftEmailSubject),
          draftEmailBody: toStr(r.draftEmailBody),
          draftEmailGeneratedAt: toDate(r.draftEmailGeneratedAt),
          synthesizedBlob: toStr(r.synthesizedBlob),
          score: toFloat(r.score),
          sourceType: toStr(r.sourceType),
          sourceUrl: toStr(r.sourceUrl),
          ingestedAt: toDate(r.ingestedAt),
          onChainAddress: toStr(r.onChainAddress),
          clusterId: toStr(r.clusterId),
          updatedAt: toDateRequired(r.updatedAt),
        },
        create: {
          id: toStrReq(r.id),
          name: toStrReq(r.name),
          company: toStrReq(r.company),
          email: toStr(r.email),
          linkedin: toStr(r.linkedin),
          websiteUrl: toStr(r.websiteUrl),
          founderName: toStr(r.founderName),
          founderFirstName: toStr(r.founderFirstName),
          founderLastName: toStr(r.founderLastName),
          stage: toStrReq(r.stage) || "intro_sent",
          status: toStrReq(r.status) || "yellow",
          lastContacted: toDate(r.lastContacted),
          notes: toStr(r.notes),
          aiNextStep: toStr(r.aiNextStep),
          industry: toStr(r.industry),
          starred: toBool(r.starred),
          starRank: toInt(r.starRank),
          draftEmailSubject: toStr(r.draftEmailSubject),
          draftEmailBody: toStr(r.draftEmailBody),
          draftEmailGeneratedAt: toDate(r.draftEmailGeneratedAt),
          synthesizedBlob: toStr(r.synthesizedBlob),
          score: toFloat(r.score),
          sourceType: toStr(r.sourceType),
          sourceUrl: toStr(r.sourceUrl),
          ingestedAt: toDate(r.ingestedAt),
          onChainAddress: toStr(r.onChainAddress),
          clusterId: toStr(r.clusterId),
          createdAt: toDateRequired(r.createdAt),
          updatedAt: toDateRequired(r.updatedAt),
        },
      });
      count++;
    } catch (err: any) {
      console.error(`  [Target] Failed row id=${r.id} name=${r.name}: ${err.message}`);
    }
  }
  return count;
}

async function migrateActivities(turso: LibsqlClient, prisma: PrismaClient): Promise<number> {
  const rows = await readTursoTable(turso, "Activity");
  let count = 0;
  for (const r of rows) {
    try {
      await prisma.activity.upsert({
        where: { id: toStrReq(r.id) },
        update: {
          targetId: toStrReq(r.targetId),
          type: toStrReq(r.type),
          description: toStrReq(r.description),
          date: toDateRequired(r.date),
          gmailMessageId: toStr(r.gmailMessageId),
        },
        create: {
          id: toStrReq(r.id),
          targetId: toStrReq(r.targetId),
          type: toStrReq(r.type),
          description: toStrReq(r.description),
          date: toDateRequired(r.date),
          gmailMessageId: toStr(r.gmailMessageId),
          createdAt: toDateRequired(r.createdAt),
        },
      });
      count++;
    } catch (err: any) {
      console.error(`  [Activity] Failed row id=${r.id}: ${err.message}`);
    }
  }
  return count;
}

async function migrateNewsItems(turso: LibsqlClient, prisma: PrismaClient): Promise<number> {
  const rows = await readTursoTable(turso, "NewsItem");
  let count = 0;
  for (const r of rows) {
    try {
      await prisma.newsItem.upsert({
        where: { id: toStrReq(r.id) },
        update: {
          targetId: toStrReq(r.targetId),
          headline: toStrReq(r.headline),
          url: toStrReq(r.url),
          source: toStrReq(r.source),
          summary: toStrReq(r.summary),
          publishedAt: toDateRequired(r.publishedAt),
        },
        create: {
          id: toStrReq(r.id),
          targetId: toStrReq(r.targetId),
          headline: toStrReq(r.headline),
          url: toStrReq(r.url),
          source: toStrReq(r.source),
          summary: toStrReq(r.summary),
          publishedAt: toDateRequired(r.publishedAt),
          createdAt: toDateRequired(r.createdAt),
        },
      });
      count++;
    } catch (err: any) {
      console.error(`  [NewsItem] Failed row id=${r.id}: ${err.message}`);
    }
  }
  return count;
}

async function migrateResearchBriefs(turso: LibsqlClient, prisma: PrismaClient): Promise<number> {
  const rows = await readTursoTable(turso, "ResearchBrief");
  let count = 0;
  for (const r of rows) {
    try {
      await prisma.researchBrief.upsert({
        where: { id: toStrReq(r.id) },
        update: {
          targetId: toStrReq(r.targetId),
          content: toStrReq(r.content),
          updatedAt: toDateRequired(r.updatedAt),
        },
        create: {
          id: toStrReq(r.id),
          targetId: toStrReq(r.targetId),
          content: toStrReq(r.content),
          createdAt: toDateRequired(r.createdAt),
          updatedAt: toDateRequired(r.updatedAt),
        },
      });
      count++;
    } catch (err: any) {
      console.error(`  [ResearchBrief] Failed row id=${r.id}: ${err.message}`);
    }
  }
  return count;
}

async function migrateOutreachBriefs(turso: LibsqlClient, prisma: PrismaClient): Promise<number> {
  const rows = await readTursoTable(turso, "OutreachBrief");
  let count = 0;
  for (const r of rows) {
    try {
      await prisma.outreachBrief.upsert({
        where: { id: toStrReq(r.id) },
        update: {
          targetId: toStrReq(r.targetId),
          summary: toStrReq(r.summary),
          founders: toStrReq(r.founders),
          fundingStage: toStrReq(r.fundingStage),
          updatedAt: toDateRequired(r.updatedAt),
        },
        create: {
          id: toStrReq(r.id),
          targetId: toStrReq(r.targetId),
          summary: toStrReq(r.summary),
          founders: toStrReq(r.founders),
          fundingStage: toStrReq(r.fundingStage),
          createdAt: toDateRequired(r.createdAt),
          updatedAt: toDateRequired(r.updatedAt),
        },
      });
      count++;
    } catch (err: any) {
      console.error(`  [OutreachBrief] Failed row id=${r.id}: ${err.message}`);
    }
  }
  return count;
}

async function migrateFounderReviews(turso: LibsqlClient, prisma: PrismaClient): Promise<number> {
  const rows = await readTursoTable(turso, "FounderReview");
  let count = 0;
  for (const r of rows) {
    try {
      await prisma.founderReview.upsert({
        where: { id: toStrReq(r.id) },
        update: {
          targetId: toStrReq(r.targetId),
          candidates: toStrReq(r.candidates),
          status: toStrReq(r.status) || "pending",
        },
        create: {
          id: toStrReq(r.id),
          targetId: toStrReq(r.targetId),
          candidates: toStrReq(r.candidates),
          status: toStrReq(r.status) || "pending",
          createdAt: toDateRequired(r.createdAt),
        },
      });
      count++;
    } catch (err: any) {
      console.error(`  [FounderReview] Failed row id=${r.id}: ${err.message}`);
    }
  }
  return count;
}

async function migrateMonitorThemes(turso: LibsqlClient, prisma: PrismaClient): Promise<number> {
  const rows = await readTursoTable(turso, "MonitorTheme");
  let count = 0;
  for (const r of rows) {
    try {
      await prisma.monitorTheme.upsert({
        where: { id: toStrReq(r.id) },
        update: {
          name: toStrReq(r.name),
          description: toStrReq(r.description),
          keywords: toStr(r.keywords),
          enabled: toBool(r.enabled),
          lastScannedAt: toDate(r.lastScannedAt),
          updatedAt: toDateRequired(r.updatedAt),
        },
        create: {
          id: toStrReq(r.id),
          name: toStrReq(r.name),
          description: toStrReq(r.description),
          keywords: toStr(r.keywords),
          enabled: toBool(r.enabled),
          lastScannedAt: toDate(r.lastScannedAt),
          createdAt: toDateRequired(r.createdAt),
          updatedAt: toDateRequired(r.updatedAt),
        },
      });
      count++;
    } catch (err: any) {
      console.error(`  [MonitorTheme] Failed row id=${r.id}: ${err.message}`);
    }
  }
  return count;
}

async function migrateMonitorHits(turso: LibsqlClient, prisma: PrismaClient): Promise<number> {
  const rows = await readTursoTable(turso, "MonitorHit");
  let count = 0;
  for (const r of rows) {
    try {
      await prisma.monitorHit.upsert({
        where: { id: toStrReq(r.id) },
        update: {
          themeId: toStrReq(r.themeId),
          companyName: toStrReq(r.companyName),
          url: toStr(r.url),
          description: toStrReq(r.description),
          matchReason: toStrReq(r.matchReason),
          source: toStrReq(r.source),
          sourceUrl: toStr(r.sourceUrl),
          status: toStrReq(r.status) || "pending",
          targetId: toStr(r.targetId),
          rawData: toStr(r.rawData),
          autoPromoted: toBool(r.autoPromoted),
          updatedAt: toDateRequired(r.updatedAt),
        },
        create: {
          id: toStrReq(r.id),
          themeId: toStrReq(r.themeId),
          companyName: toStrReq(r.companyName),
          url: toStr(r.url),
          description: toStrReq(r.description),
          matchReason: toStrReq(r.matchReason),
          source: toStrReq(r.source),
          sourceUrl: toStr(r.sourceUrl),
          status: toStrReq(r.status) || "pending",
          targetId: toStr(r.targetId),
          rawData: toStr(r.rawData),
          autoPromoted: toBool(r.autoPromoted),
          createdAt: toDateRequired(r.createdAt),
          updatedAt: toDateRequired(r.updatedAt),
        },
      });
      count++;
    } catch (err: any) {
      console.error(`  [MonitorHit] Failed row id=${r.id}: ${err.message}`);
    }
  }
  return count;
}

async function migrateAgents(turso: LibsqlClient, prisma: PrismaClient): Promise<number> {
  const rows = await readTursoTable(turso, "Agent");
  let count = 0;
  for (const r of rows) {
    try {
      await prisma.agent.upsert({
        where: { id: toStrReq(r.id) },
        update: {
          name: toStrReq(r.name),
          description: toStrReq(r.description),
          prompt: toStrReq(r.prompt),
          triggerType: toStrReq(r.triggerType) || "manual",
          intervalSeconds: toInt(r.intervalSeconds),
          eventType: toStr(r.eventType),
          scope: toStrReq(r.scope) || "global",
          model: toStrReq(r.model) || "claude-opus-4-6",
          enabled: toBool(r.enabled),
          lastRunAt: toDate(r.lastRunAt),
          updatedAt: toDateRequired(r.updatedAt),
        },
        create: {
          id: toStrReq(r.id),
          name: toStrReq(r.name),
          description: toStrReq(r.description),
          prompt: toStrReq(r.prompt),
          triggerType: toStrReq(r.triggerType) || "manual",
          intervalSeconds: toInt(r.intervalSeconds),
          eventType: toStr(r.eventType),
          scope: toStrReq(r.scope) || "global",
          model: toStrReq(r.model) || "claude-opus-4-6",
          enabled: toBool(r.enabled),
          lastRunAt: toDate(r.lastRunAt),
          createdAt: toDateRequired(r.createdAt),
          updatedAt: toDateRequired(r.updatedAt),
        },
      });
      count++;
    } catch (err: any) {
      console.error(`  [Agent] Failed row id=${r.id}: ${err.message}`);
    }
  }
  return count;
}

async function migrateAgentRuns(turso: LibsqlClient, prisma: PrismaClient): Promise<number> {
  const rows = await readTursoTable(turso, "AgentRun");
  let count = 0;
  for (const r of rows) {
    try {
      await prisma.agentRun.upsert({
        where: { id: toStrReq(r.id) },
        update: {
          agentId: toStrReq(r.agentId),
          targetId: toStr(r.targetId),
          status: toStrReq(r.status) || "success",
          output: toStrReq(r.output),
          trigger: toStrReq(r.trigger) || "manual",
        },
        create: {
          id: toStrReq(r.id),
          agentId: toStrReq(r.agentId),
          targetId: toStr(r.targetId),
          status: toStrReq(r.status) || "success",
          output: toStrReq(r.output),
          trigger: toStrReq(r.trigger) || "manual",
          createdAt: toDateRequired(r.createdAt),
        },
      });
      count++;
    } catch (err: any) {
      console.error(`  [AgentRun] Failed row id=${r.id}: ${err.message}`);
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== Turso -> Neon Migration ===\n");

  // Connect to both databases
  console.log("Connecting to Turso...");
  const turso = getTursoClient();

  console.log("Connecting to Neon (via Prisma)...");
  const prisma = getPrismaClient();

  // Verify connectivity
  try {
    const tursoTest = await turso.execute("SELECT 1");
    console.log("  Turso: connected\n");
  } catch (err: any) {
    console.error(`  Turso connection failed: ${err.message}`);
    process.exit(1);
  }

  try {
    await prisma.$connect();
    console.log("  Neon:  connected\n");
  } catch (err: any) {
    console.error(`  Neon connection failed: ${err.message}`);
    process.exit(1);
  }

  const summary: { table: string; count: number }[] = [];

  // Migration order — parents first, children after
  // Tier 0: no FK dependencies
  const tier0: { name: string; fn: (t: LibsqlClient, p: PrismaClient) => Promise<number> }[] = [
    { name: "Setting", fn: migrateSettings },
    { name: "GmailToken", fn: migrateGmailToken },
    { name: "Skill", fn: migrateSkills },
    { name: "Todo", fn: migrateTodos },
    { name: "ContentFolder", fn: migrateContentFolders },
    { name: "Agent", fn: migrateAgents },
    { name: "MonitorTheme", fn: migrateMonitorThemes },
  ];

  // Tier 1: depends on tier 0 parents
  const tier1: { name: string; fn: (t: LibsqlClient, p: PrismaClient) => Promise<number> }[] = [
    { name: "Target", fn: migrateTargets },          // no FK parent in Turso (clusterId is new)
    { name: "ContentLink", fn: migrateContentLinks }, // FK -> ContentFolder
    { name: "AgentRun", fn: migrateAgentRuns },       // FK -> Agent
    { name: "MonitorHit", fn: migrateMonitorHits },   // FK -> MonitorTheme
  ];

  // Tier 2: depends on Target (tier 1)
  const tier2: { name: string; fn: (t: LibsqlClient, p: PrismaClient) => Promise<number> }[] = [
    { name: "Activity", fn: migrateActivities },
    { name: "NewsItem", fn: migrateNewsItems },
    { name: "ResearchBrief", fn: migrateResearchBriefs },
    { name: "OutreachBrief", fn: migrateOutreachBriefs },
    { name: "FounderReview", fn: migrateFounderReviews },
  ];

  for (const tier of [tier0, tier1, tier2]) {
    for (const { name, fn } of tier) {
      process.stdout.write(`Migrating ${name}...`);
      try {
        const count = await fn(turso, prisma);
        summary.push({ table: name, count });
        console.log(` ${count} rows`);
      } catch (err: any) {
        summary.push({ table: name, count: -1 });
        console.log(` FAILED: ${err.message}`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log("\n=== Migration Summary ===");
  console.log("-".repeat(40));
  let totalRows = 0;
  let failedTables = 0;
  for (const { table, count } of summary) {
    if (count < 0) {
      console.log(`  ${table.padEnd(20)} FAILED`);
      failedTables++;
    } else {
      console.log(`  ${table.padEnd(20)} ${count} rows`);
      totalRows += count;
    }
  }
  console.log("-".repeat(40));
  console.log(`  Total rows migrated: ${totalRows}`);
  if (failedTables > 0) {
    console.log(`  Tables with errors:  ${failedTables}`);
  }
  console.log("\nDone.");

  // Cleanup
  turso.close();
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
