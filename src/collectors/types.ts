import Database from "better-sqlite3";
import { Repository } from "@/lib/db/repo";

export interface CollectContext {
  db: Database.Database;
  repo: Repository;
  operatorContact: string;
}

export interface CollectResult {
  status: "SUCCESS" | "NO_CHANGE" | "FAILED" | "SKIPPED";
  httpStatus?: number;
  serverDateHeader?: string;
  clockSkewMs?: number;
  recordsSeen?: number;
  recordsInserted?: number;
  recordsRejected?: number;
  errorCode?: string;
  errorMessage?: string;
  sourceUpdatedAt?: string;
  rawBodySha256?: string;
}

export interface Collector {
  key: string;                       // matches data_sources.key
  scopes(): string[];                // e.g. ['us/top-free/100']
  collect(scope: string, ctx: CollectContext): Promise<CollectResult>;
}
