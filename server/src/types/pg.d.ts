// Minimal TypeScript declarations for "pg".
// We keep this lightweight to avoid relying on @types/pg in environments
// where devDependencies might be omitted during installation.

declare module "pg" {
  export type QueryResultRow = Record<string, any>;

  export interface QueryResult<T extends QueryResultRow = any> {
    rows: T[];
  }

  export interface PoolClient {
    query<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<T>>;
    release(): void;
  }

  export class Pool {
    constructor(config?: any);
    query<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<T>>;
    connect(): Promise<PoolClient>;
    end(): Promise<void>;
  }

  const pgDefault: {
    Pool: typeof Pool;
  };
  export default pgDefault;
}
