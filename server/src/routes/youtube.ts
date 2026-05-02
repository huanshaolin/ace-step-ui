import { Router, Request, Response } from 'express';
import {
  getAuthUrl,
  exchangeCodeForTokens,
  getValidAccessToken,
  isConnected,
  disconnect,
} from '../services/youtube.js';

const router = Router();

// Check connection status
router.get('/status', (_req: Request, res: Response) => {
  res.json({ connected: isConnected() });
});

// Start OAuth flow — opens Google consent screen
router.get('/auth', (_req: Request, res: Response) => {
  const url = getAuthUrl();
  res.redirect(url);
});

// OAuth callback from Google
router.get('/callback', async (req: Request, res: Response) => {
  const code = req.query.code as string;
  if (!code) {
    res.status(400).send('Missing authorization code');
    return;
  }
  try {
    await exchangeCodeForTokens(code);
    res.send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#0a0a0a;color:#fff">
        <h2>✅ YouTube connected!</h2>
        <p>You can close this tab and return to ACE-Step UI.</p>
        <script>setTimeout(()=>window.close(),2000)</script>
      </body></html>
    `);
  } catch (err: any) {
    res.status(500).send(`OAuth error: ${err.message}`);
  }
});

// Return a valid access token for client-side upload
router.get('/token', async (_req: Request, res: Response) => {
  try {
    const access_token = await getValidAccessToken();
    res.json({ access_token });
  } catch (err: any) {
    res.status(401).json({ error: err.message });
  }
});

// Disconnect
router.delete('/disconnect', (_req: Request, res: Response) => {
  disconnect();
  res.json({ ok: true });
});

export default router;
