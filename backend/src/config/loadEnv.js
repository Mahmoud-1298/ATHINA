import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const loadEnv = () => {
  const backendEnvPath = path.resolve(__dirname, "../../.env");
  const rootEnvPath = path.resolve(__dirname, "../../../.env");

  dotenv.config({ path: backendEnvPath });
  dotenv.config({ path: rootEnvPath });

  return { backendEnvPath, rootEnvPath };
};

loadEnv();
