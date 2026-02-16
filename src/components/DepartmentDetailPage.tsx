import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Grid from '@mui/material/Grid';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import Icon from '@mui/material/Icon';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Divider from '@mui/material/Divider';
import { supabase } from '../lib/supabase';
import { departmentsMaster } from '../data/departmentsMaster';
import { departmentDocumentStorage, type DepartmentDocument } from '../services/departmentDocumentStorage';
import { extractFromDocument } from '../services/documentExtractor';
import StructuredDataView from './StructuredDataView';

interface DepartmentData {
  name: string;
  code: string;
  category: string;
  type: string;
  description: string | null;
  head_of_department: string | null;
  contact_number: string | null;
  nabh_compliance_status: string;
  nabh_last_audit_date: string | null;
  services: string[] | null;
  equipment_list: string[] | null;
  staff_count: number | null;
  is_emergency_service: boolean;
  operating_hours: string | null;
}

const getComplianceColor = (status: string) => {
  switch (status) {
    case 'Compliant': return 'success';
    case 'Non-Compliant': return 'error';
    case 'Under Review': return 'warning';
    default: return 'default';
  }
};

const getCategoryColor = (category: string) => {
  switch (category) {
    case 'Clinical Speciality': return '#1565C0';
    case 'Super Speciality': return '#7B1FA2';
    case 'Support Services': return '#ED6C02';
    case 'Administration': return '#2E7D32';
    default: return '#757575';
  }
};

const getFileIcon = (fileType: string | null) => {
  if (!fileType) return 'insert_drive_file';
  if (fileType.includes('pdf')) return 'picture_as_pdf';
  if (fileType.includes('image')) return 'image';
  if (fileType.includes('word') || fileType.includes('document')) return 'description';
  if (fileType.includes('sheet') || fileType.includes('excel')) return 'table_chart';
  return 'insert_drive_file';
};

const formatFileSize = (bytes: number | null) => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function DepartmentDetailPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dept, setDept] = useState<DepartmentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<DepartmentDocument[]>([]);
  const [uploading, setUploading] = useState(false);
  const [extractingId, setExtractingId] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });

  useEffect(() => {
    async function fetchDepartment() {
      setLoading(true);

      const { data } = await (supabase.from('departments') as any)
        .select('*')
        .eq('code', code)
        .eq('is_active', true)
        .single();

      if (data) {
        setDept({
          name: data.name,
          code: data.code,
          category: data.category,
          type: data.type,
          description: data.description,
          head_of_department: data.head_of_department,
          contact_number: data.contact_number,
          nabh_compliance_status: data.nabh_compliance_status || 'Not Assessed',
          nabh_last_audit_date: data.nabh_last_audit_date,
          services: data.services,
          equipment_list: data.equipment_list,
          staff_count: data.staff_count,
          is_emergency_service: data.is_emergency_service || false,
          operating_hours: data.operating_hours,
        });
      } else {
        const staticDept = departmentsMaster.find((d) => d.code === code);
        if (staticDept) {
          setDept({
            name: staticDept.name,
            code: staticDept.code,
            category: staticDept.category,
            type: staticDept.type,
            description: staticDept.description,
            head_of_department: staticDept.headOfDepartment || null,
            contact_number: staticDept.contactNumber || null,
            nabh_compliance_status: staticDept.nabhCompliance.complianceStatus,
            nabh_last_audit_date: staticDept.nabhCompliance.lastAuditDate || null,
            services: staticDept.services,
            equipment_list: staticDept.equipmentList || null,
            staff_count: staticDept.staffCount || null,
            is_emergency_service: staticDept.isEmergencyService,
            operating_hours: staticDept.operatingHours,
          });
        }
      }
      setLoading(false);
    }

    async function fetchDocuments() {
      if (code) {
        const docs = await departmentDocumentStorage.getDocuments(code);
        setDocuments(docs);
      }
    }

    if (code) {
      fetchDepartment();
      fetchDocuments();
    }
  }, [code]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !code) return;

    setUploading(true);
    const result = await departmentDocumentStorage.uploadFile(code, file);
    setUploading(false);

    if (result.success && result.document) {
      setDocuments((prev) => [result.document!, ...prev]);
      setSnackbar({ open: true, message: 'Document uploaded. Extracting text...', severity: 'success' });

      // Auto-extract text from uploaded document
      const docId = result.document!.id;
      setExtractingId(docId);
      try {
        const extraction = await extractFromDocument(file, 'department');
        if (extraction.success && extraction.text) {
          await departmentDocumentStorage.updateExtractedText(docId, extraction.text);
          setDocuments((prev) =>
            prev.map((d) => (d.id === docId ? { ...d, extracted_text: extraction.text } : d))
          );
          setSnackbar({ open: true, message: 'Text extracted successfully', severity: 'success' });
        }
      } catch (err) {
        console.error('Extraction error:', err);
      }
      setExtractingId(null);
    } else {
      setSnackbar({ open: true, message: result.error || 'Upload failed', severity: 'error' });
    }

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSave = async (doc: DepartmentDocument) => {
    setExtractingId(doc.id);
    try {
      const response = await fetch(doc.file_url);
      const blob = await response.blob();
      const file = new File([blob], doc.file_name, { type: doc.file_type || 'application/octet-stream' });

      const extraction = await extractFromDocument(file, 'department');
      if (extraction.success && extraction.text) {
        await departmentDocumentStorage.updateExtractedText(doc.id, extraction.text);
        setDocuments((prev) =>
          prev.map((d) => (d.id === doc.id ? { ...d, extracted_text: extraction.text } : d))
        );
        setSnackbar({ open: true, message: 'Text extracted & saved successfully', severity: 'success' });
      } else {
        setSnackbar({ open: true, message: extraction.error || 'Extraction failed', severity: 'error' });
      }
    } catch (err) {
      console.error('Save/extraction error:', err);
      setSnackbar({ open: true, message: 'Failed to extract text', severity: 'error' });
    }
    setExtractingId(null);
  };

  const handleDelete = async (doc: DepartmentDocument) => {
    const success = await departmentDocumentStorage.deleteDocument(doc);
    if (success) {
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
      setSnackbar({ open: true, message: 'Document deleted', severity: 'success' });
    } else {
      setSnackbar({ open: true, message: 'Delete failed', severity: 'error' });
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!dept) {
    return (
      <Box sx={{ p: 3 }}>
        <Button startIcon={<Icon>arrow_back</Icon>} onClick={() => navigate(-1)} sx={{ mb: 2 }}>
          Back
        </Button>
        <Typography variant="h6" color="text.secondary">Department not found</Typography>
      </Box>
    );
  }

  const catColor = getCategoryColor(dept.category);

  return (
    <Box sx={{ p: 3, maxWidth: 1200 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Button startIcon={<Icon>arrow_back</Icon>} onClick={() => navigate(-1)} variant="outlined" size="small">
          Back
        </Button>
        <Box sx={{ flex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
            <Icon sx={{ color: catColor, fontSize: 28 }}>apartment</Icon>
            <Typography variant="h5" fontWeight={700}>{dept.name}</Typography>
            <Chip label={dept.code} size="small" sx={{ fontWeight: 600 }} />
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Chip label={dept.category} size="small" sx={{ bgcolor: catColor, color: 'white', fontSize: '0.75rem' }} />
            <Chip label={dept.type} size="small" variant="outlined" sx={{ fontSize: '0.75rem' }} />
            {dept.is_emergency_service && (
              <Chip icon={<Icon sx={{ fontSize: '16px !important' }}>emergency</Icon>} label="24/7 Emergency" size="small" color="error" sx={{ fontSize: '0.75rem' }} />
            )}
          </Box>
        </Box>
      </Box>

      {/* Stats Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, md: 3 }}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Icon sx={{ fontSize: 32, color: catColor, mb: 0.5 }}>verified</Icon>
            <Typography variant="body2" color="text.secondary">Compliance</Typography>
            <Chip
              label={dept.nabh_compliance_status}
              size="small"
              color={getComplianceColor(dept.nabh_compliance_status) as any}
              sx={{ mt: 0.5 }}
            />
          </Paper>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Icon sx={{ fontSize: 32, color: '#1565C0', mb: 0.5 }}>groups</Icon>
            <Typography variant="body2" color="text.secondary">Staff</Typography>
            <Typography variant="h6" fontWeight={600}>{dept.staff_count || '-'}</Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Icon sx={{ fontSize: 32, color: '#ED6C02', mb: 0.5 }}>medical_services</Icon>
            <Typography variant="body2" color="text.secondary">Services</Typography>
            <Typography variant="h6" fontWeight={600}>{dept.services?.length || 0}</Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Icon sx={{ fontSize: 32, color: '#2E7D32', mb: 0.5 }}>schedule</Icon>
            <Typography variant="body2" color="text.secondary">Hours</Typography>
            <Typography variant="body1" fontWeight={600}>{dept.operating_hours || '-'}</Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Section 1: Uploaded Documents */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h6" fontWeight={600}>
            <Icon sx={{ verticalAlign: 'middle', mr: 1 }}>folder</Icon>
            Uploaded Documents ({documents.length})
          </Typography>
          <Button
            variant="contained"
            startIcon={uploading ? <CircularProgress size={18} color="inherit" /> : <Icon>upload_file</Icon>}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            size="small"
          >
            {uploading ? 'Uploading...' : 'Upload Document'}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            hidden
            accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
            onChange={handleUpload}
          />
        </Box>
        <Divider sx={{ mb: 2 }} />

        {documents.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Icon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }}>cloud_upload</Icon>
            <Typography color="text.secondary">No documents uploaded yet</Typography>
            <Typography variant="caption" color="text.disabled">Click "Upload Document" to add files</Typography>
          </Box>
        ) : (
          <List disablePadding>
            {documents.map((doc, idx) => (
              <Box key={doc.id}>
                {idx > 0 && <Divider />}
                <ListItem
                  secondaryAction={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {extractingId === doc.id && (
                        <Chip
                          icon={<CircularProgress size={14} />}
                          label="Extracting..."
                          size="small"
                          color="info"
                          sx={{ fontSize: '0.7rem' }}
                        />
                      )}
                      {!doc.extracted_text && extractingId !== doc.id && (
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => handleSave(doc)}
                          title="Extract & Save"
                        >
                          <Icon sx={{ fontSize: 18 }}>save</Icon>
                        </IconButton>
                      )}
                      {doc.extracted_text && extractingId !== doc.id && (
                        <Chip label="Extracted" size="small" color="success" sx={{ fontSize: '0.7rem' }} />
                      )}
                      <IconButton size="small" onClick={() => window.open(doc.file_url, '_blank')}>
                        <Icon sx={{ fontSize: 18 }}>open_in_new</Icon>
                      </IconButton>
                      <IconButton size="small" color="error" onClick={() => handleDelete(doc)}>
                        <Icon sx={{ fontSize: 18 }}>delete</Icon>
                      </IconButton>
                    </Box>
                  }
                >
                  <ListItemIcon sx={{ minWidth: 40 }}>
                    <Icon sx={{ color: doc.file_type?.includes('pdf') ? '#D32F2F' : '#1565C0' }}>
                      {getFileIcon(doc.file_type)}
                    </Icon>
                  </ListItemIcon>
                  <ListItemText
                    primary={doc.file_name}
                    secondary={`${formatFileSize(doc.file_size)} ${doc.uploaded_at ? '· ' + new Date(doc.uploaded_at).toLocaleDateString() : ''}`}
                    slotProps={{
                      primary: { sx: { fontSize: '0.875rem', fontWeight: 500 } },
                      secondary: { sx: { fontSize: '0.75rem' } },
                    }}
                  />
                </ListItem>
              </Box>
            ))}
          </List>
        )}
      </Paper>

      {/* Section 2: Extracted Data */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
          <Icon sx={{ verticalAlign: 'middle', mr: 1 }}>auto_awesome</Icon>
          Extracted Data
        </Typography>
        <Divider sx={{ mb: 2 }} />

        {extractingId && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <CircularProgress size={18} />
            <Typography variant="body2" color="text.secondary">Extracting text from document...</Typography>
          </Box>
        )}

        {documents.filter((d) => d.extracted_text).length === 0 && !extractingId ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Icon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }}>text_snippet</Icon>
            <Typography color="text.secondary">No extracted data yet</Typography>
            <Typography variant="caption" color="text.disabled">Upload documents and click Save to extract text using Gemini AI</Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {documents.filter((d) => d.extracted_text).map((doc) => (
              <Paper key={doc.id} variant="outlined" sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                  <Icon sx={{ fontSize: 18, color: doc.file_type?.includes('pdf') ? '#D32F2F' : '#1565C0' }}>
                    {getFileIcon(doc.file_type)}
                  </Icon>
                  <Typography variant="subtitle2" fontWeight={600}>{doc.file_name}</Typography>
                </Box>
                <Box sx={{ maxHeight: 500, overflow: 'auto' }}>
                  <StructuredDataView extractedText={doc.extracted_text!} fileName={doc.file_name} />
                </Box>
              </Paper>
            ))}
          </Box>
        )}
      </Paper>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} variant="filled" onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
