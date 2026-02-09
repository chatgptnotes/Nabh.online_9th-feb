/**
 * Shared SOP Page
 * Public view of a single SOP document via shareable URL
 * Route: /sop/:sopId
 */

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box,
  Container,
  Typography,
  Button,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  Print as PrintIcon,
  Download as DownloadIcon,
  Share as ShareIcon,
  ArrowBack as ArrowBackIcon,
} from '@mui/icons-material';
import type { SOPDocument } from '../types/sop';
import { loadSOPById } from '../services/sopStorage';
import { getHospitalInfo } from '../config/hospitalConfig';

export default function SharedSOPPage() {
  const { sopId } = useParams<{ sopId: string }>();
  const [sop, setSOP] = useState<SOPDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (sopId) {
      loadSOPData(sopId);
    }
  }, [sopId]);

  const loadSOPData = async (id: string) => {
    setLoading(true);
    const result = await loadSOPById(id);

    if (result.success && result.data) {
      setSOP(result.data);
    } else {
      setError('This SOP is not yet saved.');
    }

    setLoading(false);
  };

  // Check if extracted_content is a full HTML document
  const isFullHTML = (content: string) => {
    return content.trim().toLowerCase().startsWith('<!doctype') || content.trim().toLowerCase().startsWith('<html');
  };

  const handlePrint = () => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.print();
    } else {
      window.print();
    }
  };

  const handleShare = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    alert('URL copied to clipboard!');
  };

  const handleDownload = () => {
    if (!sop) return;

    const htmlContent = isFullHTML(sop.extracted_content)
      ? sop.extracted_content
      : `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${sop.title}</title>
<style>body{font-family:'Segoe UI',sans-serif;margin:40px;line-height:1.6}</style>
</head><body>${sop.extracted_content}</body></html>`;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sop.title.replace(/[^a-z0-9]/gi, '_')}_${sop.version}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <Container maxWidth="md" sx={{ py: 8, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <Box textAlign="center">
          <CircularProgress size={40} />
          <Typography variant="h6" sx={{ mt: 2 }}>
            Loading SOP...
          </Typography>
        </Box>
      </Container>
    );
  }

  if (error || !sop) {
    return (
      <Container maxWidth="md" sx={{ py: 8 }}>
        <Alert severity="warning" sx={{ mb: 3 }}>
          {error || 'SOP not found'}
        </Alert>
        <Button variant="contained" href="/">
          Return to Home
        </Button>
      </Container>
    );
  }

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Action Bar */}
      <Box
        sx={{
          bgcolor: 'primary.main',
          color: 'white',
          py: 1.5,
          px: 3,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          '@media print': { display: 'none' },
        }}
      >
        <Box display="flex" alignItems="center" gap={2}>
          <Button
            color="inherit"
            startIcon={<ArrowBackIcon />}
            onClick={() => window.history.back()}
            size="small"
          >
            Back
          </Button>
          <Typography variant="subtitle1" fontWeight="bold">
            {sop.title}
          </Typography>
        </Box>
        <Box display="flex" gap={1}>
          <Button color="inherit" startIcon={<ShareIcon />} onClick={handleShare} size="small">
            Share
          </Button>
          <Button color="inherit" startIcon={<DownloadIcon />} onClick={handleDownload} size="small">
            Download
          </Button>
          <Button color="inherit" startIcon={<PrintIcon />} onClick={handlePrint} size="small">
            Print
          </Button>
        </Box>
      </Box>

      {/* SOP Content rendered in iframe for proper styling */}
      {isFullHTML(sop.extracted_content) ? (
        <iframe
          ref={iframeRef}
          srcDoc={sop.extracted_content}
          title={sop.title}
          style={{
            flex: 1,
            width: '100%',
            border: 'none',
            backgroundColor: 'white',
          }}
        />
      ) : (
        <Box sx={{ flex: 1, overflow: 'auto', p: 4, maxWidth: 800, mx: 'auto' }}>
          <Box dangerouslySetInnerHTML={{ __html: sop.extracted_content }} />
        </Box>
      )}
    </Box>
  );
}
