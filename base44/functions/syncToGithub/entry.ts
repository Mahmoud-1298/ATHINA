import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { files } = body;
    if (!files || !Array.isArray(files) || files.length === 0) {
      return Response.json({ error: 'Missing files array' }, { status: 400 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('github');
    const owner = 'Mahmoud-1298';
    const repo = 'ATHINA';
    const branch = 'main';
    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'Base44-App',
    };

    const toBase64 = (str) => {
      const bytes = new TextEncoder().encode(str);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      return btoa(binary);
    };

    const results = [];
    for (const file of files) {
      const { path: filePath, content, message } = file;
      try {
        // Get current SHA if file exists
        const checkRes = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`,
          { headers }
        );
        let sha = null;
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          sha = checkData.sha;
        }

        // Push the file
        const pushRes = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
          {
            method: 'PUT',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: message || `Sync ${filePath}`,
              content: toBase64(content),
              branch,
              ...(sha ? { sha } : {}),
            }),
          }
        );

        if (pushRes.ok) {
          const pushData = await pushRes.json();
          results.push({ path: filePath, success: true, sha: pushData.commit?.sha, action: sha ? 'updated' : 'created' });
        } else {
          const errData = await pushRes.json().catch(() => ({}));
          results.push({ path: filePath, success: false, error: errData.message || `HTTP ${pushRes.status}` });
        }
      } catch (fileError) {
        results.push({ path: filePath, success: false, error: fileError.message });
      }
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return Response.json({
      success: failed === 0,
      summary: `${succeeded} synced, ${failed} failed`,
      results,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});