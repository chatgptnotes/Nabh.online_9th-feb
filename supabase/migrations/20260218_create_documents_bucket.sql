-- Migration: Create 'documents' storage bucket for license PDFs and general documents
-- This bucket stores license certificates, PDFs, and other document uploads

-- Create the storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  true,
  52428800, -- 50MB limit
  ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 52428800;

-- Allow public read access
CREATE POLICY "Public read access for documents" ON storage.objects
  FOR SELECT USING (bucket_id = 'documents');

-- Allow uploads
CREATE POLICY "Allow uploads to documents" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'documents');

-- Allow updates/overwrites
CREATE POLICY "Allow updates to documents" ON storage.objects
  FOR UPDATE USING (bucket_id = 'documents');

-- Allow deletes
CREATE POLICY "Allow deletes from documents" ON storage.objects
  FOR DELETE USING (bucket_id = 'documents');
