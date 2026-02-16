-- Department Documents table for storing uploaded files per department
CREATE TABLE IF NOT EXISTS department_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_code VARCHAR(20) NOT NULL,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type VARCHAR(50),
  file_size BIGINT,
  extracted_text TEXT,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_department_documents_code ON department_documents(department_code);

-- Enable RLS
ALTER TABLE department_documents ENABLE ROW LEVEL SECURITY;

-- Allow all operations for anon users (same pattern as other tables)
CREATE POLICY "Allow all operations on department_documents" ON department_documents
  FOR ALL
  USING (true)
  WITH CHECK (true);
