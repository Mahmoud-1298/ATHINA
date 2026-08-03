import { invokeFunction } from "./functionApi";
import { getClientIdentity } from "./clientIdentity";

export interface ValidatorReferenceFile {
  name: string;
  path: string;
  category: string;
  updatedAt?: string | null;
  size?: number | null;
}

export interface ValidatorCategoryScore {
  key: string;
  label: string;
  score: number;
  achieved: string;
  assessment: string;
  strengths: string[];
  issues: string[];
  recommendations: string[];
  referencesUsed: string[];
}

export interface ValidatorResult {
  summary: string;
  overallScore: number;
  decision: string;
  missingItems: string[];
  categories: ValidatorCategoryScore[];
}

export interface ValidatorContextResponse {
  success: boolean;
  bucket: string;
  referencePrefix: string;
  referenceFiles: ValidatorReferenceFile[];
}

export interface ValidatorRunResponse {
  success: boolean;
  reportId?: string | null;
  proposalName: string;
  proposalStoragePath?: string | null;
  referenceFiles: ValidatorReferenceFile[];
  result: ValidatorResult;
}

export type ValidatorReferenceMode = "database" | "uploaded" | "both";

export interface ValidateProposalOptions {
  referenceMode?: ValidatorReferenceMode;
  additionalReferenceFiles?: File[];
}

const fileToBase64 = async (file: File) => {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
};

const serializeFile = async (file: File) => ({
  fileName: file.name,
  mimeType: file.type || "application/octet-stream",
  contentBase64: await fileToBase64(file),
  size: file.size,
});

export const fetchProposalValidatorContext = async (): Promise<ValidatorContextResponse> => {
  const response = await invokeFunction("proposalValidatorContext");
  return response.data as ValidatorContextResponse;
};

export const validateProposalFile = async (
  file: File,
  options: ValidateProposalOptions = {},
): Promise<ValidatorRunResponse> => {
  const { sessionId, userId } = getClientIdentity();
  const proposal = await serializeFile(file);
  const additionalReferenceFiles = await Promise.all(
    (options.additionalReferenceFiles || []).map(serializeFile),
  );

  const response = await invokeFunction("validateProposal", {
    ...proposal,
    sessionId,
    userId,
    referenceMode: options.referenceMode || "database",
    additionalReferenceFiles,
  });

  return response.data as ValidatorRunResponse;
};
