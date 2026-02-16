import { supabase } from '../lib/supabase';

export interface DepartmentDocument {
  id: string;
  department_code: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  extracted_text: string | null;
  uploaded_at: string;
}

export const departmentDocumentStorage = {
  async getDocuments(deptCode: string): Promise<DepartmentDocument[]> {
    const { data, error } = await (supabase.from('department_documents') as any)
      .select('*')
      .eq('department_code', deptCode)
      .order('uploaded_at', { ascending: false });

    if (error) {
      console.error('Error fetching department documents:', error);
      return [];
    }
    return data || [];
  },

  async uploadFile(deptCode: string, file: File): Promise<{ success: boolean; document?: DepartmentDocument; error?: string }> {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `departments/${deptCode}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('documents').getPublicUrl(filePath);

      const { data, error: insertError } = await (supabase.from('department_documents') as any)
        .insert({
          department_code: deptCode,
          file_name: file.name,
          file_url: urlData.publicUrl,
          file_type: file.type || null,
          file_size: file.size,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      return { success: true, document: data };
    } catch (err: any) {
      console.error('Upload error:', err);
      return { success: false, error: err.message || 'Upload failed' };
    }
  },

  async updateExtractedText(id: string, extractedText: string): Promise<boolean> {
    try {
      const { error } = await (supabase.from('department_documents') as any)
        .update({ extracted_text: extractedText })
        .eq('id', id);

      if (error) throw error;
      return true;
    } catch (err) {
      console.error('Update extracted text error:', err);
      return false;
    }
  },

  async deleteDocument(doc: DepartmentDocument): Promise<boolean> {
    try {
      const url = new URL(doc.file_url);
      const pathMatch = url.pathname.match(/\/object\/public\/documents\/(.+)/);
      if (pathMatch) {
        await supabase.storage.from('documents').remove([pathMatch[1]]);
      }

      const { error } = await (supabase.from('department_documents') as any)
        .delete()
        .eq('id', doc.id);

      if (error) throw error;
      return true;
    } catch (err) {
      console.error('Delete error:', err);
      return false;
    }
  },
};
