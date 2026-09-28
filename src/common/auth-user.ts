/** What authentication attaches to each request: just the user's id. Load more from the database when needed. */
export interface AuthUser {
  id: string;
}

export interface AuthenticatedRequest {
  user?: AuthUser;
}
