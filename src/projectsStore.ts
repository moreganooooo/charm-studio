import { supabase } from "./supabaseClient";
import type { IRDoc } from "./types";

export interface StudioProject {
  id: string;
  name: string;
  schemaVersion: 1;
  templateId: string;
  paletteId: string;
  ir: IRDoc;
  isPublic: boolean;
  updatedAt: string;
  source: "local" | "cloud";
}

const LOCAL_PROJECTS_KEY = "charmstudio:v2:projects";

export function listLocalProjects(): StudioProject[] {
  try {
    const raw = localStorage.getItem(LOCAL_PROJECTS_KEY);
    return raw ? (JSON.parse(raw) as StudioProject[]) : [];
  } catch {
    return [];
  }
}

export function saveLocalProject(proj: StudioProject): StudioProject[] {
  const list = listLocalProjects().filter((p) => p.id !== proj.id);
  const next = [{ ...proj, source: "local" as const }, ...list];
  try {
    localStorage.setItem(LOCAL_PROJECTS_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage quota errors
  }
  return next;
}

export function deleteLocalProject(id: string): StudioProject[] {
  const next = listLocalProjects().filter((p) => p.id !== id);
  try {
    localStorage.setItem(LOCAL_PROJECTS_KEY, JSON.stringify(next));
  } catch {
    // Ignore
  }
  return next;
}

interface CloudRow {
  id: string;
  user_id: string;
  name: string;
  schema_version: number;
  template_id: string;
  palette_id: string;
  ir_json: IRDoc;
  is_public: boolean;
  updated_at: string;
}

function rowToProject(row: CloudRow): StudioProject {
  return {
    id: row.id,
    name: row.name,
    schemaVersion: 1,
    templateId: row.template_id,
    paletteId: row.palette_id,
    ir: row.ir_json,
    isPublic: row.is_public,
    updatedAt: row.updated_at,
    source: "cloud",
  };
}

export async function listCloudProjects(userId: string): Promise<StudioProject[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data as CloudRow[]).map(rowToProject);
}

export async function upsertCloudProject(userId: string, proj: StudioProject): Promise<StudioProject> {
  if (!supabase) throw new Error("Supabase not configured");
  const payload = {
    id: proj.id,
    user_id: userId,
    name: proj.name,
    schema_version: 1,
    template_id: proj.templateId,
    palette_id: proj.paletteId,
    ir_json: proj.ir,
    is_public: proj.isPublic,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("projects")
    .upsert(payload, { onConflict: "id" })
    .select()
    .single();
  if (error) throw error;
  return rowToProject(data as CloudRow);
}

export async function deleteCloudProject(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchPublicCloudProject(id: string): Promise<StudioProject | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .eq("is_public", true)
    .maybeSingle();
  if (error || !data) return null;
  return rowToProject(data as CloudRow);
}
