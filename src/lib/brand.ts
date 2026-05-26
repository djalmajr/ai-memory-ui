// Marca configurável em build-time (Vite). Em produção, builde com:
//   VITE_APP_NAME="Knowledge Base" VITE_APP_TAGLINE="..." npm run build
// Sem as envs, cai no padrão "ai-memory / knowledge browser".
export const APP_NAME = import.meta.env.VITE_APP_NAME?.trim() || "ai-memory";
export const APP_TAGLINE = import.meta.env.VITE_APP_TAGLINE?.trim() || "knowledge browser";
