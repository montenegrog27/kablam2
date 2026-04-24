-- Crear bucket 'fonts' en Supabase Storage si no existe
-- Ejecutar en el SQL Editor de Supabase

-- 1. Habilitar storage si no está habilitado
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Crear bucket (esto puede requerir permisos de superusuario)
--    Si el bucket ya existe, no hace nada.
INSERT INTO storage.buckets (id, name, public, avif_autodetection, file_size_limit, allowed_mime_types)
VALUES (
  'fonts',
  'fonts',
  true,
  false,
  10485760, -- 10MB límite por archivo
  ARRAY['font/woff', 'font/woff2', 'font/ttf', 'font/otf', 'application/x-font-ttf', 'application/x-font-otf']
)
ON CONFLICT (id) DO NOTHING;

-- 3. Política para permitir uploads autenticados (opcional, si quieres que solo admins suban)
--    Para permitir uploads desde la aplicación, necesitamos políticas que permitan a usuarios autenticados.
--    Asumiendo que usas autenticación Supabase y tienes una tabla 'users' con tenant_id.
--    Esta política permite a cualquier usuario autenticado subir archivos al bucket 'fonts'
DROP POLICY IF EXISTS "Authenticated users can upload fonts" ON storage.objects;
CREATE POLICY "Authenticated users can upload fonts"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'fonts');

-- 4. Política para permitir lectura pública (para que las fuentes sean accesibles desde la web)
DROP POLICY IF EXISTS "Fonts are publicly accessible" ON storage.objects;
CREATE POLICY "Fonts are publicly accessible"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'fonts');