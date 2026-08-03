import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Database, FileCheck2, Loader2, ShieldCheck, Upload, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  fetchProposalValidatorContext,
  validateProposalFile,
  type ValidatorContextResponse,
  type ValidatorResult,
} from "@/lib/proposalValidatorApi";

const getDecisionTone = (decision: string) => {
  const normalized = String(decision || "").toLowerCase();
  if (normalized === "approved") return "text-emerald-300 border-emerald-400/30 bg-emerald-500/10";
  if (normalized === "conditional") return "text-amber-200 border-amber-300/30 bg-amber-500/10";
  return "text-rose-200 border-rose-300/30 bg-rose-500/10";
};

const ProposalValidator = () => {
  const [context, setContext] = useState<ValidatorContextResponse | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<ValidatorResult | null>(null);
  const [proposalName, setProposalName] = useState("");
  const [loadingContext, setLoadingContext] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadContext = async () => {
      try {
        const data = await fetchProposalValidatorContext();
        if (!cancelled) {
          setContext(data);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load validator references.");
        }
      } finally {
        if (!cancelled) {
          setLoadingContext(false);
        }
      }
    };

    loadContext();

    return () => {
      cancelled = true;
    };
  }, []);

  const categoryCount = context?.referenceFiles.reduce((acc, file) => {
    acc[file.category] = (acc[file.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  const sortedCategories = useMemo(
    () => Object.entries(categoryCount).sort((left, right) => right[1] - left[1]),
    [categoryCount],
  );

  const handleValidate = async () => {
    if (!selectedFile || submitting) return;

    setSubmitting(true);
    setError("");

    try {
      const response = await validateProposalFile(selectedFile);
      setProposalName(response.proposalName);
      setResult(response.result);
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : "Proposal validation failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.18),_transparent_32%),linear-gradient(180deg,#020303_0%,#04110d_38%,#020303_100%)] text-white">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-col gap-4 rounded-3xl border border-emerald-400/15 bg-black/40 p-5 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-3">
              <Link
                to="/"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-500/10 text-emerald-200 transition hover:bg-emerald-500/20"
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <span className="font-mono text-[11px] uppercase tracking-[0.34em] text-emerald-200/75">Athina Validator</span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Commercial proposal review</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-emerald-50/72">
              Upload a proposal and ATHINA will evaluate it.
            </p>
          </div>
          <div className="grid gap-3 sm:min-w-[18rem]">
            <div className="rounded-2xl border border-emerald-400/15 bg-emerald-500/10 px-4 py-3">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.25em] text-emerald-200/70">
                <Database className="h-4 w-4" />
                Reference corpus
              </div>
              <p className="mt-2 text-2xl font-semibold text-white">{context?.referenceFiles.length || 0}</p>
              <p className="text-xs text-emerald-100/85">Reference files available for scoring</p>
            </div>
          </div>
        </header>

        <div className="grid flex-1 gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <Card className="border-emerald-400/15 bg-black/40 shadow-[0_18px_70px_rgba(0,0,0,0.28)]">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <ShieldCheck className="h-5 w-5 text-emerald-300" />
                  Reference intelligence
                </CardTitle>
                <CardDescription className="text-emerald-50/85">
                  These are the source files ATHINA checks before scoring the uploaded proposal.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {loadingContext ? (
                  <div className="flex items-center gap-3 rounded-2xl border border-emerald-400/10 bg-emerald-500/5 px-4 py-4 text-sm text-emerald-100/70">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading reference documents...
                  </div>
                ) : null}

                {!loadingContext && sortedCategories.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {sortedCategories.map(([category, count]) => (
                      <span
                        key={category}
                        className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-emerald-100"
                      >
                        {category} · {count}
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="grid gap-3 md:grid-cols-2">
                  {(context?.referenceFiles || []).map((file) => (
                    <div key={file.path} className="rounded-2xl border border-emerald-400/12 bg-emerald-500/[0.06] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-white">{file.name}</p>
                          <p className="mt-1 text-[11px] uppercase tracking-[0.22em] text-emerald-200/85">{file.category}</p>
                        </div>
                        <FileCheck2 className="mt-0.5 h-4 w-4 text-emerald-300/80" />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {result ? (
              <Card className="border-emerald-400/15 bg-black/40 shadow-[0_18px_70px_rgba(0,0,0,0.28)]">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-white">
                    <WandSparkles className="h-5 w-5 text-emerald-300" />
                    Validation outcome
                  </CardTitle>
                  <CardDescription className="text-white">
                    {proposalName || "Uploaded proposal"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="flex flex-col gap-4 rounded-3xl border border-emerald-400/15 bg-emerald-500/[0.07] p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.24em] text-white">Overall score</p>
                      <p className="mt-2 text-4xl font-semibold text-white">{result.overallScore}%</p>
                    </div>
                    <div className={`inline-flex items-center rounded-full border px-4 py-2 text-xs uppercase tracking-[0.22em] ${getDecisionTone(result.decision)}`}>
                      {result.decision}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-emerald-400/12 bg-black/20 p-4">
                    <p className="text-sm leading-7 text-white">{result.summary}</p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {result.categories.map((category) => (
                      <div key={category.key} className="rounded-2xl border border-emerald-400/12 bg-emerald-500/[0.04] p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-white">{category.label}</p>
                            <p className="text-[11px] uppercase tracking-[0.2em] text-white">{category.score}% achieved</p>
                          </div>
                          <span className="text-xl font-semibold text-white">{category.score}%</span>
                        </div>
                        <Progress value={category.score} className="h-2 bg-emerald-500/10 [&>div]:bg-emerald-400" />
                        <p className="mt-4 text-sm leading-6 text-white">{category.assessment || category.achieved}</p>
                        {category.issues.length > 0 ? (
                          <div className="mt-4">
                            <p className="text-[11px] uppercase tracking-[0.22em] text-red-300">Gaps</p>
                            <div className="mt-2 space-y-2 text-sm text-red-200">
                              {category.issues.map((issue, index) => (
                                <p key={`${category.key}-issue-${index}`}>{issue}</p>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {category.recommendations.length > 0 ? (
                          <div className="mt-4">
                            <p className="text-[11px] uppercase tracking-[0.22em] text-yellow-300">Recommendations</p>
                            <div className="mt-2 space-y-2 text-sm text-yellow-200">
                              {category.recommendations.map((recommendation, index) => (
                                <p key={`${category.key}-rec-${index}`}>{recommendation}</p>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>

                  {result.missingItems.length > 0 ? (
                    <div className="rounded-2xl border border-amber-300/20 bg-amber-500/8 p-4">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-white">Missing or weak items</p>
                      <div className="mt-3 space-y-2 text-sm text-white">
                        {result.missingItems.map((item, index) => (
                          <p key={`missing-${index}`}>{item}</p>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}
          </div>

          <div className="space-y-6">
            <Card className="border-emerald-400/15 bg-black/40 shadow-[0_18px_70px_rgba(0,0,0,0.28)]">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <Upload className="h-5 w-5 text-emerald-300" />
                  Upload proposal
                </CardTitle>
                <CardDescription className="text-emerald-50/85">
                  Supported formats: PDF, DOCX, TXT, MD, and JSON.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <label className="flex cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed border-emerald-400/25 bg-emerald-500/[0.05] px-6 py-12 text-center transition hover:border-emerald-300/40 hover:bg-emerald-500/[0.08]">
                  <Upload className="mb-4 h-8 w-8 text-emerald-300" />
                  <span className="text-sm font-medium text-white">Choose a commercial proposal file</span>
                  <span className="mt-2 text-xs text-emerald-100/85">The file is sent to ATHINA for review and archived in storage.</span>
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.docx,.txt,.md,.json"
                    onChange={(event) => {
                      const nextFile = event.target.files?.[0] || null;
                      setSelectedFile(nextFile);
                      if (nextFile) {
                        setProposalName(nextFile.name);
                      }
                    }}
                  />
                </label>

                {selectedFile ? (
                  <div className="rounded-2xl border border-emerald-400/12 bg-emerald-500/[0.06] p-4">
                    <p className="text-sm font-medium text-white">{selectedFile.name}</p>
                    <p className="mt-1 text-xs text-emerald-100/85">{Math.max(1, Math.round(selectedFile.size / 1024))} KB</p>
                  </div>
                ) : null}

                {error ? (
                  <div className="rounded-2xl border border-rose-300/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                    {error}
                  </div>
                ) : null}

                <Button
                  type="button"
                  onClick={handleValidate}
                  disabled={!selectedFile || submitting || loadingContext}
                  className="h-11 w-full bg-emerald-400 text-black hover:bg-emerald-300"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  Validate proposal
                </Button>
              </CardContent>
            </Card>

            </div>
        </div>
      </div>
    </div>
  );
};

export default ProposalValidator;
