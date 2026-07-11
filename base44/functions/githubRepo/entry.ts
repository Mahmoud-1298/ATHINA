import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { accessToken } = await base44.asServiceRole.connectors.getConnection("github");
    const owner = 'Mahmoud-1298';
    const repo = 'ATHINA';
    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'Base44-App',
    };

    // Fetch repo details
    const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
    if (!repoRes.ok) {
      const errText = await repoRes.text();
      return Response.json({ error: `GitHub API error: ${repoRes.status} ${errText}` }, { status: repoRes.status });
    }
    const repoData = await repoRes.json();

    // Fetch recent commits
    const commitsRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=5`, { headers });
    const commitsData = commitsRes.ok ? await commitsRes.json() : [];

    // Fetch languages
    const langsRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/languages`, { headers });
    const langsData = langsRes.ok ? await langsRes.json() : {};

    const details = {
      id: repoData.id,
      name: repoData.name,
      full_name: repoData.full_name,
      owner: repoData.owner?.login,
      description: repoData.description,
      url: repoData.html_url,
      default_branch: repoData.default_branch,
      language: repoData.language,
      stars: repoData.stargazers_count,
      forks: repoData.forks_count,
      watchers: repoData.watchers_count,
      open_issues: repoData.open_issues_count,
      private: repoData.private,
      created_at: repoData.created_at,
      updated_at: repoData.updated_at,
      pushed_at: repoData.pushed_at,
      size: repoData.size,
      topics: repoData.topics || [],
      license: repoData.license?.name || null,
      homepage: repoData.homepage,
      languages: langsData,
      commits: (commitsData || []).map(c => ({
        sha: c.sha,
        message: c.commit?.message,
        author: c.commit?.author?.name,
        date: c.commit?.author?.date,
      })),
    };

    return Response.json({ repo: details });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});