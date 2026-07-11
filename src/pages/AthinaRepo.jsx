import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Star, GitFork, Eye, CircleDot, Calendar, GitCommit, ExternalLink, ArrowLeft, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import MapWidget from '@/components/athina/MapWidget';
import ChatPanel from '@/components/athina/ChatPanel';

export default function AthinaRepo() {
  const [repo, setRepo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [agentCoords, setAgentCoords] = useState(null);

  useEffect(() => {
    const fetchRepo = async () => {
      try {
        const res = await base44.functions.invoke('githubRepo', {});
        setRepo(res.data.repo);
      } catch (e) {
        setError(e.response?.data?.error || e.message || 'Failed to load repo');
      } finally {
        setLoading(false);
      }
    };
    fetchRepo();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen p-6">
        <div className="text-center">
          <p className="text-destructive font-medium mb-2">Error</p>
          <p className="text-muted-foreground text-sm">{error}</p>
          <Link to="/" className="inline-flex items-center gap-2 mt-4 text-sm text-primary hover:underline">
            <ArrowLeft className="w-4 h-4" /> Go back
          </Link>
        </div>
      </div>
    );
  }

  if (!repo) return null;

  const formatDate = (d) => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  const statCards = [
    { label: 'Stars', value: repo.stars, icon: Star },
    { label: 'Forks', value: repo.forks, icon: GitFork },
    { label: 'Watchers', value: repo.watchers, icon: Eye },
    { label: 'Open Issues', value: repo.open_issues, icon: CircleDot },
  ];

  return (
    <div className="min-h-screen bg-background relative">
      <MapWidget coords={agentCoords} />
      <ChatPanel onLocate={setAgentCoords} />
      <div className="max-w-4xl mx-auto px-4 py-8 pb-40 sm:px-6 lg:px-8 lg:pr-[400px]">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-4 h-4" /> Back
            </Link>
            <Link to="/map" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
              <MapPin className="w-4 h-4" /> Map
            </Link>
          </div>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-3xl font-bold font-heading flex items-center gap-3">
                {repo.name}
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${repo.private ? 'bg-muted text-muted-foreground' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'}`}>
                  {repo.private ? 'Private' : 'Public'}
                </span>
              </h1>
              <p className="text-muted-foreground mt-1">{repo.full_name}</p>
            </div>
            <a
              href={repo.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
            >
              <ExternalLink className="w-4 h-4" /> View on GitHub
            </a>
          </div>
          {repo.description && (
            <p className="mt-4 text-lg text-foreground/80">{repo.description}</p>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {statCards.map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Icon className="w-4 h-4" />
                <span className="text-xs uppercase tracking-wide">{label}</span>
              </div>
              <p className="text-2xl font-semibold font-heading">{value}</p>
            </div>
          ))}
        </div>

        {/* Details */}
        <div className="grid sm:grid-cols-2 gap-4 mb-8">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Default Branch</p>
            <p className="font-medium">{repo.default_branch}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">License</p>
            <p className="font-medium">{repo.license || 'No license'}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Created</p>
            <p className="font-medium flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" /> {formatDate(repo.created_at)}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Last Push</p>
            <p className="font-medium flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" /> {formatDate(repo.pushed_at)}
            </p>
          </div>
        </div>

        {/* Languages */}
        {Object.keys(repo.languages || {}).length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold font-heading mb-3">Languages</h2>
            <div className="flex flex-wrap gap-2">
              {Object.entries(repo.languages).map(([lang, bytes]) => (
                <span key={lang} className="px-3 py-1 rounded-full bg-accent text-accent-foreground text-sm font-medium">
                  {lang} <span className="text-muted-foreground ml-1">{bytes.toLocaleString()} bytes</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Topics */}
        {repo.topics?.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold font-heading mb-3">Topics</h2>
            <div className="flex flex-wrap gap-2">
              {repo.topics.map(topic => (
                <span key={topic} className="px-3 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-sm font-medium">
                  {topic}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Recent Commits */}
        {repo.commits?.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold font-heading mb-3 flex items-center gap-2">
              <GitCommit className="w-5 h-5" /> Recent Commits
            </h2>
            <div className="space-y-2">
              {repo.commits.map((c) => (
                <div key={c.sha} className="rounded-lg border border-border bg-card p-3">
                  <p className="text-sm font-medium line-clamp-2">{c.message}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {c.author} · {formatDate(c.date)} · <span className="font-mono">{c.sha.slice(0, 7)}</span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}