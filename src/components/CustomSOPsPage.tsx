import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  CircularProgress,
  Chip,
  IconButton,
  Snackbar,
  Alert,
  Button,
  TextField,
  InputAdornment,
} from '@mui/material';
import {
  PictureAsPdf as PdfIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon,
  ArrowBack as BackIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { deleteGeneratedSOP, type GeneratedSOP } from '../services/sopGeneratedStorage';
import { supabase } from '../lib/supabase';

export default function CustomSOPsPage() {
  const navigate = useNavigate();
  const [sops, setSOPs] = useState<GeneratedSOP[]>([]);
  const [filteredSOPs, setFilteredSOPs] = useState<GeneratedSOP[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSOP, setSelectedSOP] = useState<GeneratedSOP | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const showSnackbar = (message: string, severity: 'success' | 'error') => {
    setSnackbar({ open: true, message, severity });
  };

  const getRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    const diffWeeks = Math.floor(diffDays / 7);
    const diffMonths = Math.floor(diffDays / 30);

    if (diffSecs < 60) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    if (diffWeeks < 4) return `${diffWeeks} week${diffWeeks > 1 ? 's' : ''} ago`;
    if (diffMonths < 12) return `${diffMonths} month${diffMonths > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
  };

  useEffect(() => {
    fetchCustomSOPs();
  }, []);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredSOPs(sops);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredSOPs(
        sops.filter(
          (sop) =>
            sop.objective_title?.toLowerCase().includes(query) ||
            sop.objective_code?.toLowerCase().includes(query) ||
            sop.chapter_name?.toLowerCase().includes(query) ||
            sop.document_number?.toLowerCase().includes(query)
        )
      );
    }
  }, [searchQuery, sops]);

  const fetchCustomSOPs = async () => {
    setLoading(true);
    try {
      // Fetch SOPs where chapter_code is 'CUSTOM' or chapter_id is null
      const { data, error } = await supabase
        .from('nabh_generated_sops')
        .select('*')
        .or('chapter_code.eq.CUSTOM,chapter_id.is.null')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching custom SOPs:', error);
        showSnackbar('Failed to load custom SOPs', 'error');
      } else {
        setSOPs(data || []);
      }
    } catch (error) {
      console.error('Error fetching custom SOPs:', error);
      showSnackbar('Failed to load custom SOPs', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSOP = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this custom SOP? This will also delete the PDF file.')) {
      return;
    }

    try {
      const result = await deleteGeneratedSOP(id);
      if (result.success) {
        showSnackbar('Custom SOP deleted successfully', 'success');
        fetchCustomSOPs();
        if (selectedSOP?.id === id) {
          setSelectedSOP(null);
        }
      } else {
        showSnackbar(result.error || 'Failed to delete SOP', 'error');
      }
    } catch (error) {
      console.error('Error deleting SOP:', error);
      showSnackbar('Failed to delete SOP', 'error');
    }
  };

  const handleCardClick = (sop: GeneratedSOP) => {
    if (sop.pdf_url) {
      window.open(sop.pdf_url, '_blank');
    } else {
      setSelectedSOP(sop);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Active': return 'success';
      case 'Draft': return 'warning';
      case 'Under Review': return 'info';
      case 'Archived': return 'default';
      default: return 'default';
    }
  };

  return (
    <Box sx={{ p: 2, bgcolor: '#f5f5f5', minHeight: '100vh' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <IconButton onClick={() => navigate('/recent-sops')} color="primary">
            <BackIcon />
          </IconButton>
          <Typography variant="h5" fontWeight="bold">
            Custom SOPs
          </Typography>
          <Chip
            label={`${filteredSOPs.length} SOPs`}
            color="secondary"
            variant="outlined"
          />
        </Box>

        {/* Search */}
        <TextField
          size="small"
          placeholder="Search custom SOPs..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          sx={{ minWidth: 280, bgcolor: 'white' }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon color="action" />
              </InputAdornment>
            ),
          }}
        />
      </Box>

      {/* Content */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
          <Typography sx={{ ml: 2 }}>Loading custom SOPs...</Typography>
        </Box>
      ) : selectedSOP ? (
        /* SOP Detail View */
        <Paper elevation={2} sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 2 }}>
            <Box>
              <Typography variant="h6" fontWeight="bold">
                {selectedSOP.objective_code} - {selectedSOP.objective_title}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {selectedSOP.chapter_name}
              </Typography>
            </Box>
            <Button
              variant="outlined"
              startIcon={<BackIcon />}
              onClick={() => setSelectedSOP(null)}
            >
              Back to List
            </Button>
          </Box>

          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <Chip label="CUSTOM" color="secondary" size="small" />
            <Chip label={`v${selectedSOP.version}`} color="info" size="small" />
            <Chip label={selectedSOP.status} color={getStatusColor(selectedSOP.status) as any} size="small" />
            {selectedSOP.document_number && (
              <Chip label={selectedSOP.document_number} variant="outlined" size="small" />
            )}
          </Box>

          <Box
            sx={{
              bgcolor: '#fff',
              border: '1px solid #ddd',
              borderRadius: 1,
              p: 2,
              minHeight: 400,
              '& iframe': {
                width: '100%',
                minHeight: 500,
                border: 'none'
              }
            }}
            dangerouslySetInnerHTML={{ __html: selectedSOP.sop_html_content }}
          />
        </Paper>
      ) : filteredSOPs.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography variant="h6" color="text.secondary">
            {searchQuery ? 'No matching custom SOPs found' : 'No custom SOPs found'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {searchQuery
              ? 'Try a different search term.'
              : 'Custom SOPs will appear here when you generate SOPs using a custom chapter in Recent SOPs.'
            }
          </Typography>
          <Button
            variant="contained"
            sx={{ mt: 2 }}
            onClick={() => navigate('/recent-sops')}
          >
            Go to SOP Generator
          </Button>
        </Box>
      ) : (
        /* SOP Grid */
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: 2 }}>
          {filteredSOPs.map((sop) => (
            <Paper
              key={sop.id}
              elevation={2}
              sx={{
                p: 2,
                cursor: 'pointer',
                transition: 'all 0.2s',
                '&:hover': {
                  boxShadow: 4,
                  transform: 'translateY(-2px)'
                },
                border: '1px solid',
                borderColor: 'divider',
              }}
              onClick={() => handleCardClick(sop)}
            >
              {/* Header Row */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 1 }}>
                <Typography variant="subtitle1" fontWeight="bold" sx={{ lineHeight: 1.3 }}>
                  {sop.objective_code}
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  {sop.pdf_url && (
                    <Chip
                      icon={<PdfIcon sx={{ fontSize: 16 }} />}
                      label="PDF"
                      size="small"
                      color="error"
                      sx={{ height: 24, '& .MuiChip-label': { px: 0.5 } }}
                    />
                  )}
                  <IconButton
                    size="small"
                    onClick={(e) => handleDeleteSOP(sop.id, e)}
                    sx={{ color: 'error.light', p: 0.5 }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Box>

              {/* Title */}
              <Typography
                variant="body2"
                sx={{
                  mb: 1.5,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  lineHeight: 1.4,
                  minHeight: '2.8em'
                }}
              >
                {sop.objective_title}
              </Typography>

              {/* Chips Row */}
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1.5 }}>
                <Chip
                  label="CUSTOM"
                  size="small"
                  color="secondary"
                  variant="outlined"
                  sx={{ height: 22 }}
                />
                <Chip
                  label={`v${sop.version}`}
                  size="small"
                  color="info"
                  sx={{ height: 22 }}
                />
                <Chip
                  label={sop.status}
                  size="small"
                  color={getStatusColor(sop.status) as any}
                  sx={{ height: 22 }}
                />
              </Box>

              {/* Footer */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="caption" color="text.secondary">
                  {new Date(sop.created_at).toLocaleDateString()} • {getRelativeTime(sop.created_at)}
                </Typography>
                {sop.created_by && (
                  <Typography variant="caption" color="text.secondary">
                    by {sop.created_by}
                  </Typography>
                )}
              </Box>

              {/* View Action Hint */}
              <Box sx={{ mt: 1, pt: 1, borderTop: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <ViewIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                <Typography variant="caption" color="text.secondary">
                  {sop.pdf_url ? 'Click to open PDF' : 'Click to view content'}
                </Typography>
              </Box>
            </Paper>
          ))}
        </Box>
      )}

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity={snackbar.severity} variant="filled">{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
