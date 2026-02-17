import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Icon from '@mui/material/Icon';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import Divider from '@mui/material/Divider';
import LinearProgress from '@mui/material/LinearProgress';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import { supabase } from '../lib/supabase';
import { departmentDocumentStorage } from '../services/departmentDocumentStorage';
import { extractFromDocument } from '../services/documentExtractor';
import StructuredDataView from './StructuredDataView';

interface DeptEntry {
  id: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  extracted_text: string | null;
  uploaded_at: string;
}

// Helper: encode parent ID into file_name for child documents
const encodeParent = (parentId: string, fileName: string) => `[parent:${parentId}]${fileName}`;
const decodeParent = (fileName: string): { parentId: string | null; displayName: string } => {
  const match = fileName.match(/^\[parent:([^\]]+)\](.+)$/);
  if (match) return { parentId: match[1], displayName: match[2] };
  return { parentId: null, displayName: fileName };
};

export default function DepartmentDetailPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [deptName, setDeptName] = useState('');
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<DeptEntry[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingParentId, setUploadingParentId] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState('');
  const [selectedTitleId, setSelectedTitleId] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Fetch department name and entries
  useEffect(() => {
    if (!code) return;

    const fetchData = async () => {
      const { data: dept } = await (supabase.from('departments') as any)
        .select('name')
        .eq('code', code)
        .single();
      if (dept) setDeptName(dept.name);

      const { data: docs } = await (supabase.from('department_documents') as any)
        .select('id, file_name, file_url, file_type, extracted_text, uploaded_at')
        .eq('department_code', code)
        .order('uploaded_at', { ascending: true });
      setEntries(docs || []);
      setLoading(false);
    };
    fetchData();
  }, [code]);

  const handleSave = async () => {
    if (!code || !title.trim()) return;
    setSaving(true);
    try {
      const { data, error } = await (supabase.from('department_documents') as any)
        .insert([{
          department_code: code,
          file_name: title.trim(),
          file_url: 'manual-entry',
          file_type: 'text',
          extracted_text: description.trim() || null,
        }])
        .select('id, file_name, file_url, file_type, extracted_text, uploaded_at')
        .single();
      if (error) throw error;
      setEntries(prev => [...prev, data]);
      setTitle('');
      setDescription('');
    } catch (err) {
      console.error('Error saving entry:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleUploadClick = (parentId: string) => {
    setUploadingParentId(parentId);
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !code || !uploadingParentId) return;

    if (fileInputRef.current) fileInputRef.current.value = '';

    const parentId = uploadingParentId;
    setUploadStatus('Uploading file...');

    try {
      // 1. Upload to Supabase storage
      const uploadResult = await departmentDocumentStorage.uploadFile(code, file);
      if (!uploadResult.success || !uploadResult.document) {
        throw new Error(uploadResult.error || 'Upload failed');
      }

      const doc = uploadResult.document;

      // 2. Update file_name to include parent reference
      const encodedName = encodeParent(parentId, doc.file_name);
      await (supabase.from('department_documents') as any)
        .update({ file_name: encodedName })
        .eq('id', doc.id);

      setUploadStatus('Extracting text from document...');

      // 3. Auto-extract text using Gemini Vision
      let extractedText = '';
      const extraction = await extractFromDocument(file, 'department');
      if (extraction.success && extraction.text) {
        extractedText = extraction.text;
        await departmentDocumentStorage.updateExtractedText(doc.id, extractedText);
      }

      // 4. Add to entries list
      const newEntry: DeptEntry = {
        id: doc.id,
        file_name: encodedName,
        file_url: doc.file_url,
        file_type: doc.file_type,
        extracted_text: extractedText || null,
        uploaded_at: doc.uploaded_at,
      };
      setEntries(prev => [...prev, newEntry]);
    } catch (err) {
      console.error('Error uploading document:', err);
    } finally {
      setUploadingParentId(null);
      setUploadStatus('');
    }
  };

  const handleDelete = async (entry: DeptEntry) => {
    const { parentId } = decodeParent(entry.file_name);
    const isTitle = entry.file_url === 'manual-entry';

    if (isTitle) {
      // Delete title + all its children
      const childIds = entries
        .filter(e => decodeParent(e.file_name).parentId === entry.id)
        .map(e => e.id);

      // Delete children from storage + DB
      for (const child of entries.filter(e => childIds.includes(e.id))) {
        if (child.file_url !== 'manual-entry') {
          await departmentDocumentStorage.deleteDocument(child as any);
        }
      }
      // Delete the title itself
      await (supabase.from('department_documents') as any).delete().eq('id', entry.id);
      setEntries(prev => prev.filter(e => e.id !== entry.id && !childIds.includes(e.id)));
    } else if (entry.file_url !== 'manual-entry') {
      const success = await departmentDocumentStorage.deleteDocument(entry as any);
      if (success) setEntries(prev => prev.filter(e => e.id !== entry.id));
    } else {
      const { error } = await (supabase.from('department_documents') as any).delete().eq('id', entry.id);
      if (!error) setEntries(prev => prev.filter(e => e.id !== entry.id));
    }
  };

  // Group: titles (manual entries without parent) and their children
  const titles = entries.filter(e => e.file_url === 'manual-entry' && !decodeParent(e.file_name).parentId);
  const getChildren = (titleId: string) =>
    entries.filter(e => decodeParent(e.file_name).parentId === titleId);
  // Orphan uploaded docs (no parent) - show at the end
  const orphanDocs = entries.filter(e => e.file_url !== 'manual-entry' && !decodeParent(e.file_name).parentId);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
        <IconButton onClick={() => navigate(-1)}>
          <Icon>arrow_back</Icon>
        </IconButton>
        <Typography variant="h5" fontWeight="bold">{deptName || code}</Typography>
      </Box>

      {/* Add Entry Form */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 3 }}>
        <TextField
          fullWidth
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Enter title"
        />
        <TextField
          fullWidth
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Enter description"
          multiline
          rows={3}
        />
        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving || !title.trim()}
            startIcon={saving ? <CircularProgress size={20} /> : <Icon>save</Icon>}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </Box>

        {/* Title dropdown + Upload */}
        {titles.length > 0 && (
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <FormControl size="small" sx={{ flex: 1 }}>
              <InputLabel>Select Title</InputLabel>
              <Select
                value={selectedTitleId}
                label="Select Title"
                onChange={(e) => {
                  const id = e.target.value as string;
                  setSelectedTitleId(id);
                  setTimeout(() => {
                    titleRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }, 100);
                }}
              >
                {titles.map((t) => (
                  <MenuItem key={t.id} value={t.id}>{t.file_name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button
              variant="outlined"
              onClick={() => {
                if (selectedTitleId) handleUploadClick(selectedTitleId);
              }}
              disabled={!selectedTitleId || !!uploadingParentId}
              startIcon={uploadingParentId === selectedTitleId ? <CircularProgress size={16} /> : <Icon>upload_file</Icon>}
            >
              {uploadingParentId === selectedTitleId ? uploadStatus : 'Upload'}
            </Button>
          </Box>
        )}
      </Box>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg"
        style={{ display: 'none' }}
        onChange={handleFileUpload}
      />

      {/* Entries List */}
      <Divider sx={{ mb: 2 }} />
      <Typography variant="h6" sx={{ mb: 2 }}>
        Entries ({titles.length})
      </Typography>

      {titles.length === 0 && orphanDocs.length === 0 ? (
        <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
          No entries yet. Add one above.
        </Typography>
      ) : (
        <>
          {titles.map((titleEntry) => {
            const children = getChildren(titleEntry.id);
            const isUploading = uploadingParentId === titleEntry.id;
            return (
              <Paper
                key={titleEntry.id}
                ref={(el: HTMLDivElement | null) => { titleRefs.current[titleEntry.id] = el; }}
                elevation={0}
                sx={{
                  mb: 2,
                  border: '1px solid #e0e0e0',
                  borderRadius: 1,
                  overflow: 'hidden',
                }}
              >
                {/* Title Header */}
                <Box
                  sx={{
                    p: 2,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    '&:hover .title-actions': { opacity: 1 },
                  }}
                >
                  <Box sx={{ flex: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Icon sx={{ color: '#1565C0', fontSize: 20 }}>folder</Icon>
                      <Typography variant="subtitle1" fontWeight={700}>{titleEntry.file_name}</Typography>
                    </Box>
                    {titleEntry.extracted_text && (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, ml: 3.5 }}>
                        {titleEntry.extracted_text}
                      </Typography>
                    )}
                    <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: 'block', ml: 3.5 }}>
                      {new Date(titleEntry.uploaded_at).toLocaleDateString()}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => handleUploadClick(titleEntry.id)}
                      disabled={isUploading}
                      startIcon={isUploading ? <CircularProgress size={16} /> : <Icon>upload_file</Icon>}
                    >
                      {isUploading ? uploadStatus : 'Upload'}
                    </Button>
                    <IconButton
                      className="title-actions"
                      size="small"
                      color="error"
                      onClick={() => handleDelete(titleEntry)}
                      sx={{ opacity: 0, transition: 'opacity 0.2s' }}
                      title="Delete title & its documents"
                    >
                      <Icon>delete</Icon>
                    </IconButton>
                  </Box>
                </Box>

                {isUploading && <LinearProgress />}

                {/* Child Documents */}
                {children.length > 0 && (
                  <Box sx={{ borderTop: '1px solid #f0f0f0' }}>
                    {children.map((child) => {
                      const { displayName } = decodeParent(child.file_name);
                      const isPdf = child.file_type?.includes('pdf');
                      const isImage = child.file_type?.startsWith('image/');
                      return (
                        <Box
                          key={child.id}
                          sx={{
                            p: 2,
                            pl: 5,
                            borderTop: '1px solid #f5f5f5',
                            '&:hover .child-actions': { opacity: 1 },
                          }}
                        >
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Icon sx={{ color: isPdf ? '#d32f2f' : isImage ? '#1976d2' : '#666', fontSize: 18 }}>
                                  {isPdf ? 'picture_as_pdf' : isImage ? 'image' : 'attach_file'}
                                </Icon>
                                <Typography variant="body2" fontWeight={600}>{displayName}</Typography>
                              </Box>
                              {child.extracted_text && (
                                <Box sx={{ mt: 1 }}>
                                  <StructuredDataView extractedText={child.extracted_text} fileName={displayName} />
                                </Box>
                              )}
                              <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: 'block' }}>
                                {new Date(child.uploaded_at).toLocaleDateString()}
                              </Typography>
                            </Box>
                            <Box className="child-actions" sx={{ display: 'flex', gap: 0.5, opacity: 0, transition: 'opacity 0.2s' }}>
                              <IconButton
                                size="small"
                                color="primary"
                                onClick={() => window.open(child.file_url, '_blank')}
                                title="Download"
                              >
                                <Icon>download</Icon>
                              </IconButton>
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => handleDelete(child)}
                                title="Delete"
                              >
                                <Icon>delete</Icon>
                              </IconButton>
                            </Box>
                          </Box>
                        </Box>
                      );
                    })}
                  </Box>
                )}
              </Paper>
            );
          })}

          {/* Orphan docs (uploaded before this feature) */}
          {orphanDocs.map((entry) => (
            <Paper
              key={entry.id}
              elevation={0}
              sx={{
                p: 2,
                mb: 1.5,
                border: '1px solid #e0e0e0',
                borderRadius: 1,
                '&:hover .entry-actions': { opacity: 1 },
              }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Icon sx={{ color: entry.file_type?.includes('pdf') ? '#d32f2f' : '#1976d2', fontSize: 20 }}>
                      {entry.file_type?.includes('pdf') ? 'picture_as_pdf' : 'image'}
                    </Icon>
                    <Typography variant="subtitle1" fontWeight={600}>{entry.file_name}</Typography>
                  </Box>
                  {entry.extracted_text && (
                    <Box sx={{ mt: 1 }}>
                      <StructuredDataView extractedText={entry.extracted_text} fileName={entry.file_name} />
                    </Box>
                  )}
                  <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: 'block' }}>
                    {new Date(entry.uploaded_at).toLocaleDateString()}
                  </Typography>
                </Box>
                <Box className="entry-actions" sx={{ display: 'flex', gap: 0.5, opacity: 0, transition: 'opacity 0.2s' }}>
                  <IconButton
                    size="small"
                    color="primary"
                    onClick={() => window.open(entry.file_url, '_blank')}
                    title="Download"
                  >
                    <Icon>download</Icon>
                  </IconButton>
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => handleDelete(entry)}
                    title="Delete"
                  >
                    <Icon>delete</Icon>
                  </IconButton>
                </Box>
              </Box>
            </Paper>
          ))}
        </>
      )}
    </Box>
  );
}
