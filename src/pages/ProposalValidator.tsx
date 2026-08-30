import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Database,
  FileCheck2,
  FileText,
  FolderOpen,
  ListChecks,
  Loader2,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  ShieldCheck,
  Upload,
  WandSparkles,
  MessageCircle,
  Send,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import AgentConsole from "@/components/athina/AgentConsole";
import {
  fetchProposalValidatorContext,
  validateProposalFile,
  type ValidatorContextResponse,
  type ValidatorResult,
  type ValidatorReferenceMode,
} from "@/lib/proposalValidatorApi";

const getDecisionTone = (decision: string) => {
  const normalized = String(decision || "").toLowerCase();
  if (normalized === "approved") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (normalized === "conditional") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-rose-200 bg-rose-50 text-rose-700";
};

const getScoreTone = (score: number) => {
  if (score >= 80) return "text-emerald-700";
  if (score >= 60) return "text-amber-700";
  return "text-rose-700";
};

const formatFileSize = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

type ResultTab = "overview" | "gaps" | "recommendations" | "references";

const ProposalValidator = () => {
  const [context, setContext] = useState<ValidatorContextResponse | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<ValidatorResult | null>(null);
  const [proposalName, setProposalName] = useState("");
  const [loadingContext, setLoadingContext] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [referenceDrawerOpen, setReferenceDrawerOpen] = useState(false);
  const [referenceSearch, setReferenceSearch] = useState("");
  const [additionalReferenceFiles, setAdditionalReferenceFiles] = useState<File[]>([]);
  const [referenceMode, setReferenceMode] = useState<ValidatorReferenceMode>("database");
  const [resultTab, setResultTab] = useState<ResultTab>("overview");
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadContext = async () => {
      try {
        const data = await fetchProposalValidatorContext();
        if (!cancelled) setContext(data);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load validator references.");
        }
      } finally {
        if (!cancelled) setLoadingContext(false);
      }
    };

    loadContext();
    return () => {
      cancelled = true;
    };
  }, []);

  const sortedCategories = useMemo(() => {
    const counts = (context?.referenceFiles || []).reduce<Record<string, number>>((acc, file) => {
      acc[file.category] = (acc[file.category] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts).sort((left, right) => right[1] - left[1]);
  }, [context]);

  const filteredReferences = useMemo(() => {
    const query = referenceSearch.trim().toLowerCase();
    if (!query) return context?.referenceFiles || [];
    return (context?.referenceFiles || []).filter(
      (file) => file.name.toLowerCase().includes(query) || file.category.toLowerCase().includes(query),
    );
  }, [context, referenceSearch]);

  const totalIssues = result?.categories.reduce((sum, category) => sum + category.issues.length, 0) || 0;
  const totalRecommendations =
    result?.categories.reduce((sum, category) => sum + category.recommendations.length, 0) || 0;

  const handleValidate = async () => {
    if (!selectedFile || submitting) return;
    setSubmitting(true);
    setError("");

    try {
      const response = await validateProposalFile(selectedFile, {
        referenceMode,
        additionalReferenceFiles,
      });
      setProposalName(response.proposalName);
      setResult(response.result);
      setResultTab("overview");
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : "Proposal validation failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleFile = (file: File | null) => {
    setSelectedFile(file);
    setResult(null);
    setError("");
    if (file) setProposalName(file.name);
  };

  const addReferenceFiles = (files: FileList | null) => {
    if (!files?.length) return;
    setAdditionalReferenceFiles((current) => {
      const existing = new Set(current.map((file) => `${file.name}-${file.size}-${file.lastModified}`));
      const next = Array.from(files).filter(
        (file) => !existing.has(`${file.name}-${file.size}-${file.lastModified}`),
      );
      return [...current, ...next];
    });
    setReferenceMode((mode) => (mode === "database" ? "both" : mode));
  };

  const removeReferenceFile = (index: number) => {
    setAdditionalReferenceFiles((current) => current.filter((_, fileIndex) => fileIndex !== index));
  };



  return (
    <div className="min-h-screen bg-[#F4F8F6] text-[#17211D]">
      {sidebarOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-slate-950/35 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-[#000000] text-white shadow-2xl transition-[width,transform] duration-300 lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } ${sidebarCollapsed ? "lg:w-20" : "lg:w-72"}`}
      >
        <div className={`flex h-20 items-center border-b border-white/10 ${sidebarCollapsed ? "justify-center px-3 lg:px-2" : "justify-between px-6"}`}>
          <div className="flex min-w-0 items-center gap-2">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#84BD00] shadow-lg shadow-black/15">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className={sidebarCollapsed ? "lg:hidden" : ""}>
              <p className="whitespace-nowrap text-base font-bold tracking-[0.16em]">MORO HUB</p>
              <p className="text-[10px] uppercase tracking-[0.24em] text-emerald-100/65">ATHINA</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close navigation"
            className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-2 px-4 py-6" aria-label="Primary navigation">
          <p className={`mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-100/45 ${sidebarCollapsed ? "lg:hidden" : ""}`}>
            Workspace
          </p>

          <Link
            to="/"
            onClick={() => setSidebarOpen(false)}
            className={`flex w-full items-center rounded-xl px-3 py-3 text-sm font-medium text-emerald-50/75 transition hover:bg-white/10 hover:text-white ${sidebarCollapsed ? "lg:justify-center" : "gap-3"}`}
            title={sidebarCollapsed ? "Back to home" : undefined}
          >
            <ArrowLeft className="h-5 w-5 shrink-0" />
            <span className={sidebarCollapsed ? "lg:hidden" : ""}>Back to home</span>
          </Link>

          <div
            className={`flex w-full items-center rounded-xl bg-white px-3 py-3 text-sm font-medium text-[#535559] shadow-lg shadow-black/10 ${sidebarCollapsed ? "lg:justify-center" : "gap-3"}`}
            aria-current="page"
          >
            <ShieldCheck className="h-5 w-5 text-[#84BD00]" />
            <span className={sidebarCollapsed ? "lg:hidden" : ""}>Proposal Validator</span>
            <span className={`h-2 w-2 rounded-full bg-[#84BD00] ${sidebarCollapsed ? "hidden" : "ml-auto"}`} />
          </div>

          <button
            type="button"
            onClick={() => {
              setReferenceDrawerOpen(true);
              setSidebarOpen(false);
            }}
            className={`flex w-full items-center rounded-xl px-3 py-3 text-sm font-medium text-emerald-50/75 transition hover:bg-white/10 hover:text-white ${sidebarCollapsed ? "lg:justify-center" : "gap-3"}`}
            title={sidebarCollapsed ? "Ask ATHINA" : undefined}
          >
            <MessageCircle className="h-5 w-5 shrink-0" />
            <span className={sidebarCollapsed ? "lg:hidden" : ""}>Ask ATHINA</span>
          </button>
        </nav>

        <div className="border-t border-white/10 p-4">
          <button
            type="button"
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            className={`mb-3 hidden w-full items-center rounded-xl px-3 py-3 text-sm font-medium text-emerald-50/75 transition hover:bg-white/10 hover:text-white lg:flex ${sidebarCollapsed ? "justify-center" : "gap-3"}`}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
            <span className={sidebarCollapsed ? "hidden" : ""}>Collapse sidebar</span>
          </button>

          <div className={`rounded-2xl bg-white/[0.07] ${sidebarCollapsed ? "p-3 lg:flex lg:justify-center" : "p-4"}`}>
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-50" title="Validator operational">
              <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
              <span className={sidebarCollapsed ? "lg:hidden" : ""}>Validator operational</span>
            </div>
            <p className={`mt-2 text-[11px] leading-5 text-emerald-100/55 ${sidebarCollapsed ? "lg:hidden" : ""}`}>
              Reference intelligence is available for proposal scoring.
            </p>
          </div>
        </div>
      </aside>

      <div className={`min-h-screen transition-[padding] duration-300 ${sidebarCollapsed ? "lg:pl-20" : "lg:pl-72"}`}>
        <header className="sticky top-0 z-30 border-b border-[#DDE8E2] bg-white/90 backdrop-blur-xl">
          <div className="flex h-20 items-center justify-between px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="Open navigation"
                className="rounded-xl border border-[#DDE8E2] bg-white p-2.5 text-[#535559] lg:hidden"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </button>
              <Link
                to="/"
                className="hidden h-10 w-10 items-center justify-center rounded-xl border border-[#DDE8E2] bg-white text-[#535559] transition hover:border-[#84BD00] hover:text-[#84BD00] sm:inline-flex"
                aria-label="Back to home"
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <div>
                <p className="text-sm font-semibold text-[#17211D]">Proposal Validator</p>
                <p className="text-xs text-[#64746C]">Commercial intelligence workspace</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 sm:flex">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Secure workspace
              </div>
              <div className="grid h-10 w-10 place-items-center rounded-full bg-[#535559] text-sm font-semibold text-white">MH</div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1500px] px-4 py-8 sm:px-6 lg:px-8">
          <section className="mb-8 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#72A600]">
                <WandSparkles className="h-4 w-4" />
                ATHINA intelligence
              </div>
              <h1 className="max-w-3xl text-3xl font-bold tracking-tight text-[#17211D] sm:text-4xl">
                Commercial proposal review
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[#64746C] sm:text-base">
                Validate commercial proposals against approved references, identify gaps, and turn findings into clear actions.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-[#64746C]">
              <ShieldCheck className="h-4 w-4 text-[#84BD00]" />
              Files are securely processed and archived
            </div>
          </section>

          <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-[#DDE8E2] bg-white p-5 shadow-[0_8px_30px_rgba(24,61,45,0.06)]">
              <div className="flex items-center justify-between">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#F3F9E6] text-[#84BD00]">
                  <Database className="h-5 w-5" />
                </div>
                {loadingContext ? <Loader2 className="h-4 w-4 animate-spin text-[#64746C]" /> : null}
              </div>
              <p className="mt-5 text-2xl font-bold text-[#17211D]">{context?.referenceFiles.length || 0}</p>
              <p className="mt-1 text-sm text-[#64746C]">Approved references</p>
            </div>

            <div className="rounded-2xl border border-[#DDE8E2] bg-white p-5 shadow-[0_8px_30px_rgba(24,61,45,0.06)]">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#F3F9E6] text-[#84BD00]">
                <FolderOpen className="h-5 w-5" />
              </div>
              <p className="mt-5 text-2xl font-bold text-[#17211D]">{sortedCategories.length}</p>
              <p className="mt-1 text-sm text-[#64746C]">Reference categories</p>
            </div>

            <div className="rounded-2xl border border-[#DDE8E2] bg-white p-5 shadow-[0_8px_30px_rgba(24,61,45,0.06)]">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#F3F9E6] text-[#84BD00]">
                <FileCheck2 className="h-5 w-5" />
              </div>
              <p className="mt-5 truncate text-base font-bold text-[#17211D]">{proposalName || "No proposal"}</p>
              <p className="mt-1 text-sm text-[#64746C]">Current proposal</p>
            </div>

            <div className="rounded-2xl border border-[#DDE8E2] bg-white p-5 shadow-[0_8px_30px_rgba(24,61,45,0.06)]">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#F3F9E6] text-[#84BD00]">
                <ListChecks className="h-5 w-5" />
              </div>
              <p className={`mt-5 text-2xl font-bold ${result ? getScoreTone(result.overallScore) : "text-[#17211D]"}`}>
                {result ? `${result.overallScore}%` : "Ready"}
              </p>
              <p className="mt-1 text-sm text-[#64746C]">Validation status</p>
            </div>
          </section>

          {!result ? (
            <section className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]">
              <div className="rounded-3xl border border-[#DDE8E2] bg-white p-5 shadow-[0_14px_50px_rgba(24,61,45,0.07)] sm:p-7">
                <div className="mb-6">
                  <p className="text-lg font-bold text-[#17211D]">Upload proposal</p>
                  <p className="mt-1 text-sm text-[#64746C]">Start a review using PDF, DOCX, TXT, MD, or JSON.</p>
                </div>

                <label
                  className="group flex min-h-[300px] cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-[#DCEAB8] bg-[#F8FBF9] px-6 py-12 text-center transition hover:border-[#84BD00] hover:bg-[#F7FBEF]"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    handleFile(event.dataTransfer.files?.[0] || null);
                  }}
                >
                  <div className="grid h-16 w-16 place-items-center rounded-2xl bg-[#F3F9E6] text-[#84BD00] transition group-hover:scale-105">
                    <Upload className="h-7 w-7" />
                  </div>
                  <span className="mt-5 text-base font-semibold text-[#17211D]">Drop your commercial proposal here</span>
                  <span className="mt-2 max-w-md text-sm leading-6 text-[#64746C]">
                    Or browse to select a file from your device. The proposal will be evaluated against the approved reference corpus.
                  </span>
                  <span className="mt-5 rounded-xl bg-[#535559] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-950/10">
                    Browse files
                  </span>
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.docx,.txt,.md,.json"
                    onChange={(event) => handleFile(event.target.files?.[0] || null)}
                  />
                </label>

                {selectedFile ? (
                  <div className="mt-5 flex flex-col gap-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-[#84BD00] shadow-sm">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#17211D]">{selectedFile.name}</p>
                        <p className="mt-0.5 text-xs text-[#64746C]">{formatFileSize(selectedFile.size)} · Ready to validate</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="rounded-lg p-2 text-[#64746C] hover:bg-white hover:text-rose-600"
                      onClick={() => handleFile(null)}
                      aria-label="Remove selected file"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : null}

                <div className="mt-5 rounded-2xl border border-[#DCEAB8] bg-[#F7FBEF] px-4 py-3 text-sm text-[#527600]">
                  Validation source: {referenceMode === "database" ? "approved database references" : referenceMode === "uploaded" ? `${additionalReferenceFiles.length} uploaded reference files` : `database plus ${additionalReferenceFiles.length} uploaded reference files`}.
                </div>

                {error ? (
                  <div className="mt-5 flex gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    {error}
                  </div>
                ) : null}

                <Button
                  type="button"
                  onClick={handleValidate}
                  disabled={!selectedFile || submitting || loadingContext}
                  className="mt-5 h-12 w-full rounded-xl bg-[#84BD00] font-semibold text-white shadow-lg shadow-emerald-700/15 hover:bg-[#72A600] disabled:bg-slate-200 disabled:text-slate-500"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  {submitting ? "Validating proposal..." : "Validate proposal"}
                </Button>
              </div>

              <div className="rounded-3xl border border-[#DDE8E2] bg-white p-5 shadow-[0_14px_50px_rgba(24,61,45,0.07)] sm:p-7">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-bold text-[#17211D]">Reference intelligence</p>
                    <p className="mt-1 text-sm leading-6 text-[#64746C]">Approved sources ATHINA uses during scoring.</p>
                  </div>
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#F3F9E6] text-[#84BD00]">
                    <Database className="h-5 w-5" />
                  </div>
                </div>

                {loadingContext ? (
                  <div className="mt-6 flex items-center gap-3 rounded-2xl bg-[#F4F8F6] p-4 text-sm text-[#64746C]">
                    <Loader2 className="h-4 w-4 animate-spin text-[#84BD00]" />
                    Loading references...
                  </div>
                ) : (
                  <div className="mt-6 space-y-3">
                    {sortedCategories.slice(0, 6).map(([category, count]) => (
                      <div key={category} className="flex items-center justify-between rounded-2xl border border-[#E5EEE9] px-4 py-3.5">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#84BD00]" />
                          <span className="truncate text-sm font-medium text-[#3F4540]">{category}</span>
                        </div>
                        <span className="rounded-full bg-[#F3F9E6] px-2.5 py-1 text-xs font-bold text-[#72A600]">{count}</span>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setReferenceDrawerOpen(true)}
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-[#DCEAB8] px-4 py-3 text-sm font-semibold text-[#535559] transition hover:border-[#84BD00] hover:bg-[#F7FBEF]"
                >
                  <FolderOpen className="h-4 w-4" />
                  View all reference files
                </button>

                <div className="mt-6 rounded-2xl bg-[#535559] p-5 text-white">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                    Reference corpus ready
                  </div>
                  <p className="mt-2 text-xs leading-5 text-emerald-50/65">
                    Validation will compare the proposal with {context?.referenceFiles.length || 0} approved files across {sortedCategories.length} categories.
                  </p>
                </div>
              </div>
            </section>
          ) : (
            <section className="space-y-6">
              <div className="overflow-hidden rounded-3xl border border-[#DDE8E2] bg-white shadow-[0_14px_50px_rgba(24,61,45,0.07)]">
                <div className="bg-[#535559] px-5 py-6 text-white sm:px-7">
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200/75">Validation complete</p>
                      <h2 className="mt-2 text-2xl font-bold">{proposalName || "Uploaded proposal"}</h2>
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-50/65">{result.summary}</p>
                    </div>
                    <div className="flex items-center gap-4 rounded-2xl bg-white/10 p-4 backdrop-blur-sm">
                      <div>
                        <p className="text-xs text-emerald-100/65">Overall score</p>
                        <p className="mt-1 text-4xl font-bold">{result.overallScore}%</p>
                      </div>
                      <span className={`rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] ${getDecisionTone(result.decision)}`}>
                        {result.decision}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid divide-y divide-[#E5EEE9] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                  <div className="p-5">
                    <p className="text-xs font-medium text-[#64746C]">Categories reviewed</p>
                    <p className="mt-2 text-2xl font-bold text-[#17211D]">{result.categories.length}</p>
                  </div>
                  <div className="p-5">
                    <p className="text-xs font-medium text-[#64746C]">Identified gaps</p>
                    <p className="mt-2 text-2xl font-bold text-rose-700">{totalIssues}</p>
                  </div>
                  <div className="p-5">
                    <p className="text-xs font-medium text-[#64746C]">Recommendations</p>
                    <p className="mt-2 text-2xl font-bold text-amber-700">{totalRecommendations}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-[#DDE8E2] bg-white shadow-[0_14px_50px_rgba(24,61,45,0.07)]">
                <div className="flex gap-1 overflow-x-auto border-b border-[#E5EEE9] px-4 pt-4 sm:px-6">
                  {([
                    ["overview", "Overview"],
                    ["gaps", `Gaps (${totalIssues})`],
                    ["recommendations", `Recommendations (${totalRecommendations})`],
                    ["references", "References used"],
                  ] as [ResultTab, string][]).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setResultTab(key)}
                      className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold transition ${
                        resultTab === key
                          ? "border-[#84BD00] text-[#72A600]"
                          : "border-transparent text-[#64746C] hover:text-[#17211D]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="p-5 sm:p-7">
                  {resultTab === "overview" ? (
                    <div className="space-y-3">
                      {result.categories.map((category) => {
                        const expanded = expandedCategory === category.key;
                        return (
                          <div key={category.key} className="overflow-hidden rounded-2xl border border-[#DDE8E2]">
                            <button
                              type="button"
                              onClick={() => setExpandedCategory(expanded ? null : category.key)}
                              className="flex w-full items-center gap-4 p-4 text-left transition hover:bg-[#F8FBF9] sm:p-5"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="mb-2 flex items-center justify-between gap-3">
                                  <p className="truncate text-sm font-bold text-[#17211D]">{category.label}</p>
                                  <span className={`text-sm font-bold ${getScoreTone(category.score)}`}>{category.score}%</span>
                                </div>
                                <Progress value={category.score} className="h-2 bg-[#EAF1ED] [&>div]:bg-[#84BD00]" />
                              </div>
                              <ChevronDown className={`h-5 w-5 shrink-0 text-[#64746C] transition ${expanded ? "rotate-180" : ""}`} />
                            </button>
                            {expanded ? (
                              <div className="border-t border-[#E5EEE9] bg-[#F8FBF9] p-5">
                                <p className="text-sm leading-6 text-[#52675E]">{category.assessment || category.achieved}</p>
                                <div className="mt-5 grid gap-5 lg:grid-cols-2">
                                  <div>
                                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-rose-700">Gaps</p>
                                    <div className="mt-3 space-y-2">
                                      {category.issues.length ? category.issues.map((issue, index) => (
                                        <div key={`${category.key}-issue-${index}`} className="flex gap-2 text-sm text-[#52675E]">
                                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                                          <span>{issue}</span>
                                        </div>
                                      )) : <p className="text-sm text-[#64746C]">No gaps identified.</p>}
                                    </div>
                                  </div>
                                  <div>
                                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-amber-700">Recommendations</p>
                                    <div className="mt-3 space-y-2">
                                      {category.recommendations.length ? category.recommendations.map((recommendation, index) => (
                                        <div key={`${category.key}-rec-${index}`} className="flex gap-2 text-sm text-[#52675E]">
                                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#84BD00]" />
                                          <span>{recommendation}</span>
                                        </div>
                                      )) : <p className="text-sm text-[#64746C]">No recommendations required.</p>}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}

                  {resultTab === "gaps" ? (
                    <div className="space-y-4">
                      {result.missingItems.length ? (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
                          <p className="text-sm font-bold text-amber-800">Missing or weak items</p>
                          <div className="mt-3 space-y-2">
                            {result.missingItems.map((item, index) => (
                              <p key={`missing-${index}`} className="flex gap-2 text-sm text-amber-900/80">
                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                {item}
                              </p>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {result.categories.flatMap((category) =>
                        category.issues.map((issue, index) => (
                          <div key={`${category.key}-${index}`} className="rounded-2xl border border-[#DDE8E2] p-5">
                            <p className="text-xs font-bold uppercase tracking-[0.12em] text-rose-700">{category.label}</p>
                            <p className="mt-2 text-sm leading-6 text-[#52675E]">{issue}</p>
                          </div>
                        )),
                      )}
                      {!totalIssues && !result.missingItems.length ? (
                        <div className="rounded-2xl bg-emerald-50 p-6 text-center text-sm text-emerald-800">No material gaps identified.</div>
                      ) : null}
                    </div>
                  ) : null}

                  {resultTab === "recommendations" ? (
                    <div className="space-y-4">
                      {result.categories.flatMap((category) =>
                        category.recommendations.map((recommendation, index) => (
                          <div key={`${category.key}-${index}`} className="flex gap-4 rounded-2xl border border-[#DDE8E2] p-5">
                            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#F3F9E6] text-[#84BD00]">
                              <CheckCircle2 className="h-4 w-4" />
                            </div>
                            <div>
                              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#72A600]">{category.label}</p>
                              <p className="mt-2 text-sm leading-6 text-[#52675E]">{recommendation}</p>
                            </div>
                          </div>
                        )),
                      )}
                      {!totalRecommendations ? (
                        <div className="rounded-2xl bg-emerald-50 p-6 text-center text-sm text-emerald-800">No additional recommendations.</div>
                      ) : null}
                    </div>
                  ) : null}

                  {resultTab === "references" ? (
                    <div>
                      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-bold text-[#17211D]">Approved reference corpus</p>
                          <p className="mt-1 text-sm text-[#64746C]">{context?.referenceFiles.length || 0} source files available.</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setReferenceDrawerOpen(true)}
                          className="rounded-xl border border-[#DCEAB8] px-4 py-2.5 text-sm font-semibold text-[#535559] hover:border-[#84BD00] hover:bg-[#F7FBEF]"
                        >
                          Browse references
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {sortedCategories.map(([category, count]) => (
                          <span key={category} className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800">
                            {category} · {count}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setReferenceDrawerOpen(true)}
                  className="h-11 rounded-xl border-[#DCEAB8] text-[#535559] hover:bg-[#F7FBEF]"
                >
                  <Database className="h-4 w-4" />
                  View references
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setResult(null);
                    setSelectedFile(null);
                    setProposalName("");
                    setExpandedCategory(null);
                  }}
                  className="h-11 rounded-xl bg-[#84BD00] text-white hover:bg-[#72A600]"
                >
                  <Upload className="h-4 w-4" />
                  Validate another proposal
                </Button>
              </div>
            </section>
          )}
        </main>
      </div>

      {referenceDrawerOpen ? (
        <div className="fixed inset-0 z-[60] flex justify-end">
          <button
            type="button"
            aria-label="Close ATHINA assistant"
            className="absolute inset-0 bg-slate-950/35 backdrop-blur-[2px]"
            onClick={() => setReferenceDrawerOpen(false)}
          />

          <aside className="relative flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-[#DDE8E2] px-5 py-4 sm:px-6">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#84BD00] text-white shadow-lg shadow-lime-700/15">
                  <WandSparkles className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-lg font-bold text-[#17211D]">Ask ATHINA</p>
                  <p className="mt-0.5 text-sm text-[#64746C]">Proposal validation assistant</p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close ATHINA assistant"
                onClick={() => setReferenceDrawerOpen(false)}
                className="rounded-xl border border-[#DDE8E2] p-2 text-[#64746C] hover:bg-[#F4F8F6] hover:text-[#17211D]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-[#F7F9F5] p-4 sm:p-6">
              <div className="overflow-hidden rounded-3xl border border-[#DCEAB8] bg-white shadow-[0_12px_40px_rgba(83,85,89,0.08)]">
                <style>{`
                  #proposal-athina-chat {
                    --blue-bright: #527600;
                    --blue: #6b9e00;
                    --blue-deep: #3a5400;
                    --line: #DCEAB8;
                    --text: #17211D;
                    --text-dim: #64746C;
                    --panel: #ffffff;
                    --bubble: #F3F9E6;
                  }
                  #proposal-athina-chat { background: #ffffff; }
                  #proposal-athina-chat input { background: #F7F9F5 !important; color: #17211D !important; border-color: #DCEAB8 !important; }
                  #proposal-athina-chat input:focus { border-color: #84BD00 !important; }
                  #proposal-athina-chat { scrollbar-color: #84BD00 #F3F9E6; }
                  #proposal-athina-chat *::-webkit-scrollbar { width: 8px; }
                  #proposal-athina-chat *::-webkit-scrollbar-track { background: #F3F9E6; }
                  #proposal-athina-chat *::-webkit-scrollbar-thumb { background: #84BD00; border-radius: 999px; }
                `}</style>
                <div id="proposal-athina-chat" className="h-[360px] sm:h-[420px]">
                  <AgentConsole />
                </div>
              </div>

              <div className="mt-5 rounded-3xl border border-[#DCEAB8] bg-white p-5 shadow-[0_12px_40px_rgba(83,85,89,0.06)]">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-bold text-[#17211D]">Additional validation references</p>
                    <p className="mt-1 text-sm leading-6 text-[#64746C]">
                      Upload temporary reference files when the proposal should be checked against content outside the approved database.
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#F3F9E6] px-3 py-1.5 text-xs font-bold text-[#527600]">
                    {additionalReferenceFiles.length} files
                  </span>
                </div>

                <div className="mt-5 grid gap-2 sm:grid-cols-3">
                  {([
                    ["database", "Database only"],
                    ["uploaded", "Uploaded only"],
                    ["both", "Use both"],
                  ] as [ValidatorReferenceMode, string][]).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setReferenceMode(mode)}
                      disabled={mode !== "database" && additionalReferenceFiles.length === 0}
                      className={`rounded-xl border px-3 py-2.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                        referenceMode === mode
                          ? "border-[#84BD00] bg-[#F3F9E6] text-[#527600]"
                          : "border-[#DDE8E2] bg-white text-[#64746C] hover:border-[#84BD00]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <label className="mt-5 flex cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#DCEAB8] bg-[#F7FBEF] px-5 py-5 text-sm font-semibold text-[#527600] transition hover:border-[#84BD00] hover:bg-[#F3F9E6]">
                  <Upload className="h-4 w-4" />
                  Upload reference files
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    accept=".pdf,.docx,.txt,.md,.json"
                    onChange={(event) => {
                      addReferenceFiles(event.target.files);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>

                {additionalReferenceFiles.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    {additionalReferenceFiles.map((file, index) => (
                      <div key={`${file.name}-${file.size}-${file.lastModified}`} className="flex items-center gap-3 rounded-2xl border border-[#DDE8E2] bg-[#F9FBF7] p-3">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#F3F9E6] text-[#84BD00]">
                          <FileText className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-[#17211D]">{file.name}</p>
                          <p className="mt-0.5 text-xs text-[#64746C]">{formatFileSize(file.size)}</p>
                        </div>
                        <button
                          type="button"
                          aria-label={`Remove ${file.name}`}
                          onClick={() => removeReferenceFile(index)}
                          className="rounded-lg p-2 text-[#64746C] hover:bg-rose-50 hover:text-rose-600"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        setAdditionalReferenceFiles([]);
                        setReferenceMode("database");
                      }}
                      className="text-xs font-semibold text-[#64746C] hover:text-rose-600"
                    >
                      Clear all uploaded references
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
};

export default ProposalValidator;
