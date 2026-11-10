import { db } from '../config/db.js';
import { AppError } from '../core/errors.js';

export async function listProjects() {
  const result = await db.query('SELECT id, slug, name, description FROM projects ORDER BY name');
  return result.rows;
}

export async function listServices(projectId?: number) {
  const result = await db.query(`
    SELECT s.id, s.project_id, s.code, s.name, s.type, s.enabled,
           p.name AS project_name, p.slug AS project_slug
    FROM services s JOIN projects p ON p.id = s.project_id
    WHERE ($1::int IS NULL OR s.project_id = $1)
    ORDER BY p.name, s.name`, [projectId ?? null]);
  return result.rows;
}

export async function findService(id: number) {
  const result = await db.query(`
    SELECT s.id, s.code, s.name, s.type, s.enabled, p.name AS project_name, p.slug AS project_slug
    FROM services s JOIN projects p ON p.id = s.project_id WHERE s.id = $1`, [id]);
  return result.rows[0] ?? null;
}

export async function createProject(input: {slug:string;name:string;description?:string}) {
  const result = await db.query(`INSERT INTO projects (slug,name,description)
    VALUES ($1,$2,$3) ON CONFLICT (slug) DO NOTHING
    RETURNING id,slug,name,description`,[input.slug,input.name,input.description ?? null]);
  if (!result.rows[0]) throw new AppError('PROJECT_EXISTS',409,'Já existe um projeto com este identificador.');
  return result.rows[0];
}

export async function createService(input: {project_slug:string;code:string;name:string;type:string}) {
  const result = await db.query(`INSERT INTO services (project_id,code,name,type)
    SELECT p.id,$2,$3,$4 FROM projects p WHERE p.slug=$1
    ON CONFLICT (project_id,code) DO NOTHING
    RETURNING id,project_id,code,name,type,enabled`,
    [input.project_slug,input.code,input.name,input.type]);
  if (!result.rows[0]) {
    const exists = await db.query('SELECT 1 FROM projects WHERE slug=$1',[input.project_slug]);
    if (!exists.rowCount) throw new AppError('PROJECT_NOT_FOUND',404,'Projeto não encontrado.');
    throw new AppError('SERVICE_EXISTS',409,'Já existe um serviço com este identificador no projeto.');
  }
  return result.rows[0];
}
