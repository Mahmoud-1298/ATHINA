import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  CircleDot,
  Code2,
  ExternalLink,
  Eye,
  GitCommit,
  GitFork,
  Github,
  MapPin,
  Star,
} from 'lucide-react';
import { invokeFunction } from '@/lib/functionApi';
import MapWidget from '@/components/athina/MapWidget';
import ChatPanel from '@/components/athina/ChatPanel';

const formatDate = (value) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Unavailable';
  }

  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const formatNumber = (value) =>
  new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Number(value) || 0);

const formatBytes = (value) => {
  const bytes = Number(value) || 0;

  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function AthinaRepo() {
  const [repo, setRepo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [agentCoords, setAgentCoords] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const fetchRepo = async () => {
      try {
        const response = await invokeFunction('githubRepo', {});

        if (!cancelled) {
          setRepo(response?.data?.repo || null);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError?.response?.data?.error ||
              requestError?.message ||
              'Failed to load repository',
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchRepo();

    return () => {
      cancelled = true;
    };
  }, []);

  const languageEntries = useMemo(
    () => Object.entries(repo?.languages || {}).sort((left, right) => right[1] - left[1]),
    [repo],
  );

  const totalLanguageBytes = useMemo(
    () => languageEntries.reduce((total, [, bytes]) => total + Number(bytes || 0), 0),
    [languageEntries],
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#070816] text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="relative h-12 w-12">
            <div className="absolute inset-0 rounded-full border border-violet-400/20" />
            <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-violet-400 border-r-cyan-300" />
          </div>
          <p className="text-sm font-medium text-slate-400">Loading repository intelligence...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#070816] p-6 text-white">
        <div className="w-full max-w-md rounded-3xl border border-rose-400/15 bg-[#0B0D1D]/92 p-7 text-center shadow-2xl shadow-black/40 backdrop-blur-xl">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-rose-500/10 text-rose-300">
            <CircleDot className="h-5 w-5" />
          </div>
          <h1 className="mt-5 text-xl font-semibold">Repository unavailable</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">{error}</p>
          <Link
            to="/"
            className="mt-6 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:border-violet-400/30 hover:bg-violet-500/15 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to ATHINA
          </Link>
        </div>
      </div>
    );
  }

  if (!repo) return null;

  const statCards = [
    { label: 'Stars', value: repo.stars, icon: Star, tone: 'text-amber-300 bg-amber-400/10' },
    { label: 'Forks', value: repo.forks, icon: GitFork, tone: 'text-violet-300 bg-violet-400/10' },
    { label: 'Watchers', value: repo.watchers, icon: Eye, tone: 'text-cyan-300 bg-cyan-400/10' },
    { label: 'Open issues', value: repo.open_issues, icon: CircleDot, tone: 'text-rose-300 bg-rose-400/10' },
  ];

  const languageColors = ['#8B5CF6', '#22D3EE', '#A78BFA', '#34D399', '#F59E0B', '#F472B6'];

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#070816] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_18%_8%,rgba(139,92,246,0.13),transparent_28%),radial-gradient(circle_at_82%_32%,rgba(34,211,238,0.07),transparent_25%)]" />

      {agentCoords ? <MapWidget coords={agentCoords} /> : null}
      <ChatPanel onLocate={setAgentCoords} />

      <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-[#070816]/80 backdrop-blur-2xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/[0.05] text-slate-300 transition hover:border-violet-400/30 hover:bg-violet-500/15 hover:text-white"
              title="Back to ATHINA"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-cyan-400 shadow-lg shadow-violet-500/20">
              <Github className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-wide">Repository</p>
              <p className="text-[10px] text-slate-500">ATHINA developer context</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/map"
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 text-xs font-medium text-slate-300 transition hover:border-cyan-400/30 hover:bg-cyan-500/10 hover:text-white"
            >
              <MapPin className="h-4 w-4 text-cyan-300" />
              <span className="hidden sm:inline">Open map</span>
            </Link>
            <a
              href={repo.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-2 rounded-xl bg-violet-500 px-3 text-xs font-semibold text-white shadow-lg shadow-violet-950/30 transition hover:bg-violet-400"
            >
              <ExternalLink className="h-4 w-4" />
              <span className="hidden sm:inline">View on GitHub</span>
            </a>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-4 py-8 pb-44 sm:px-6 lg:px-8 lg:pr-[420px]">
        <section className="overflow-hidden rounded-[28px] border border-white/[0.08] bg-[#0B0D1D]/85 shadow-[0_24px_80px_rgba(0,0,0,0.34)] backdrop-blur-xl">
          <div className="border-b border-white/[0.07] p-6 sm:p-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="break-words text-3xl font-semibold tracking-tight sm:text-4xl">{repo.name}</h1>
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                      repo.private
                        ? 'border-slate-400/20 bg-slate-400/10 text-slate-300'
                        : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
                    }`}
                  >
                    {repo.private ? 'Private' : 'Public'}
                  </span>
                </div>
                <p className="mt-2 text-sm text-violet-200/65">{repo.full_name}</p>
                {repo.description ? (
                  <p className="mt-5 max-w-3xl text-base leading-7 text-slate-300">{repo.description}</p>
                ) : null}
              </div>

              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-violet-400/15 bg-violet-500/10 text-violet-300">
                <Code2 className="h-6 w-6" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 divide-x divide-y divide-white/[0.07] sm:grid-cols-4 sm:divide-y-0">
            {statCards.map(({ label, value, icon: Icon, tone }) => (
              <div key={label} className="p-5 sm:p-6">
                <div className={`grid h-9 w-9 place-items-center rounded-xl ${tone}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <p className="mt-4 text-2xl font-semibold">{formatNumber(value)}</p>
                <p className="mt-1 text-xs text-slate-500">{label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-3xl border border-white/[0.08] bg-[#0B0D1D]/78 p-6 shadow-xl shadow-black/20 backdrop-blur-xl">
            <h2 className="text-base font-semibold">Repository details</h2>
            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3.5">
                <span className="text-sm text-slate-400">Default branch</span>
                <span className="truncate font-mono text-xs text-violet-200">{repo.default_branch || 'Unavailable'}</span>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3.5">
                <span className="text-sm text-slate-400">License</span>
                <span className="text-sm font-medium text-slate-200">{repo.license || 'No license'}</span>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3.5">
                <span className="text-sm text-slate-400">Created</span>
                <span className="inline-flex items-center gap-2 text-sm text-slate-200">
                  <Calendar className="h-4 w-4 text-slate-500" />
                  {formatDate(repo.created_at)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3.5">
                <span className="text-sm text-slate-400">Last push</span>
                <span className="inline-flex items-center gap-2 text-sm text-slate-200">
                  <Calendar className="h-4 w-4 text-slate-500" />
                  {formatDate(repo.pushed_at)}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/[0.08] bg-[#0B0D1D]/78 p-6 shadow-xl shadow-black/20 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold">Languages</h2>
                <p className="mt-1 text-xs text-slate-500">Repository composition</p>
              </div>
              <span className="text-xs text-slate-500">{formatBytes(totalLanguageBytes)}</span>
            </div>

            {languageEntries.length > 0 ? (
              <>
                <div className="mt-6 flex h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
                  {languageEntries.map(([language, bytes], index) => {
                    const percentage = totalLanguageBytes
                      ? (Number(bytes) / totalLanguageBytes) * 100
                      : 0;
                    return (
                      <span
                        key={language}
                        style={{
                          width: `${percentage}%`,
                          backgroundColor: languageColors[index % languageColors.length],
                        }}
                        title={`${language}: ${percentage.toFixed(1)}%`}
                      />
                    );
                  })}
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {languageEntries.map(([language, bytes], index) => {
                    const percentage = totalLanguageBytes
                      ? (Number(bytes) / totalLanguageBytes) * 100
                      : 0;
                    return (
                      <div key={language} className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5">
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: languageColors[index % languageColors.length] }}
                          />
                          <span className="truncate text-sm text-slate-300">{language}</span>
                        </div>
                        <span className="text-xs font-medium text-slate-500">{percentage.toFixed(1)}%</span>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="mt-6 text-sm text-slate-500">No language data available.</p>
            )}
          </div>
        </section>

        {repo.topics?.length > 0 ? (
          <section className="mt-6 rounded-3xl border border-white/[0.08] bg-[#0B0D1D]/78 p-6 shadow-xl shadow-black/20 backdrop-blur-xl">
            <h2 className="text-base font-semibold">Topics</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {repo.topics.map((topic) => (
                <span key={topic} className="rounded-full border border-violet-400/15 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-200">
                  {topic}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        {repo.commits?.length > 0 ? (
          <section className="mt-6 rounded-3xl border border-white/[0.08] bg-[#0B0D1D]/78 p-6 shadow-xl shadow-black/20 backdrop-blur-xl">
            <div className="flex items-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-400/10 text-cyan-300">
                <GitCommit className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-base font-semibold">Recent commits</h2>
                <p className="text-xs text-slate-500">Latest repository activity</p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {repo.commits.map((commit) => (
                <div key={commit.sha} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 transition hover:border-violet-400/20 hover:bg-violet-500/[0.04]">
                  <p className="line-clamp-2 text-sm font-medium leading-6 text-slate-200">{commit.message}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                    <span>{commit.author || 'Unknown author'}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatDate(commit.date)}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono text-violet-300/75">{String(commit.sha || '').slice(0, 7)}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
