import { google } from 'googleapis';
import { db } from '../db/pool.js';

const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET || '';
const REDIRECT_URI = process.env.YOUTUBE_REDIRECT_URI || 'http://localhost:3001/api/youtube/callback';

export function createOAuthClient() {
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
}

export function getAuthUrl(): string {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/youtube.upload'],
  });
}

export async function exchangeCodeForTokens(code: string) {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  saveTokens(tokens);
  return tokens;
}

function saveTokens(tokens: any) {
  db.prepare(`
    INSERT INTO oauth_tokens (provider, access_token, refresh_token, expiry_date, updated_at)
    VALUES ('youtube', ?, ?, ?, datetime('now'))
    ON CONFLICT(provider) DO UPDATE SET
      access_token = excluded.access_token,
      refresh_token = COALESCE(excluded.refresh_token, refresh_token),
      expiry_date = excluded.expiry_date,
      updated_at = excluded.updated_at
  `).run(tokens.access_token, tokens.refresh_token ?? null, tokens.expiry_date ?? null);
}

function loadTokens(): any | null {
  return db.prepare('SELECT * FROM oauth_tokens WHERE provider = ?').get('youtube') as any ?? null;
}

export function isConnected(): boolean {
  const row = loadTokens();
  return !!(row?.access_token || row?.refresh_token);
}

export async function getValidAccessToken(): Promise<string> {
  const row = loadTokens();
  if (!row) throw new Error('YouTube not connected');

  const client = createOAuthClient();
  client.setCredentials({
    access_token: row.access_token,
    refresh_token: row.refresh_token,
    expiry_date: row.expiry_date,
  });

  const { token } = await client.getAccessToken();
  if (!token) throw new Error('Failed to get access token');

  // Persist refreshed token if changed
  const creds = client.credentials;
  if (creds.access_token !== row.access_token) {
    saveTokens(creds);
  }

  return token;
}

export function disconnect() {
  db.prepare('DELETE FROM oauth_tokens WHERE provider = ?').run('youtube');
}
