/**
 * Shared SOP Page
 * Public view of a single SOP document via shareable URL
 * Route: /sop/:sopId
 * Loads from nabh_sop_documents first, then falls back to nabh_generated_sops
 * Detects template/placeholder content and tries to find real generated version
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box,
  Container,
  Typography,
  Button,
  CircularProgress,
  Alert,
  Paper,
} from '@mui/material';
import {
  Print as PrintIcon,
  Download as DownloadIcon,
  Share as ShareIcon,
  ArrowBack as ArrowBackIcon,
  PictureAsPdf as PdfIcon,
  Build as BuildIcon,
} from '@mui/icons-material';
import { loadSOPById } from '../services/sopStorage';
import { getGeneratedSOPById, getGeneratedSOPByObjectiveCode } from '../services/sopGeneratedStorage';
import { highlightSearchTerms } from '../utils/highlightHtml';

// Unified SOP data for display
interface SOPDisplayData {
  title: string;
  htmlContent: string;
  pdfUrl?: string;
  version?: string;
  source: 'uploaded' | 'generated';
  isTemplate?: boolean;
  objectiveCode?: string;
}

// Convert numeric element to letter: 1→a, 2→b, ..., 26→z
const numToLetter = (num: string): string => {
  const n = parseInt(num, 10);
  if (isNaN(n) || n < 1 || n > 26) return num;
  return String.fromCharCode(96 + n);
};

// Format objective code: "HIC.1.5" → "HIC.1.e"
const formatCode = (code: string): string => {
  if (!code) return code;
  const parts = code.split('.');
  if (parts.length === 3 && /^\d+$/.test(parts[2])) {
    parts[2] = numToLetter(parts[2]);
  }
  return parts.join('.');
};

// Format title: convert numeric codes in parentheses to alphabetic
const formatTitle = (title: string): string => {
  return title.replace(/\(([A-Z]{2,4})\.(\d+)\.(\d+)\)/g, (_match, chapter, std, elem) => {
    return `(${chapter}.${std}.${numToLetter(elem)})`;
  });
};

// Detect if HTML content is a template with unfilled placeholders
const isTemplateContent = (html: string): boolean => {
  const placeholderPatterns = [
    /\[State the/i,
    /\[Define the/i,
    /\[Generate\s/i,
    /\[Specify\s/i,
    /\[Describe\s/i,
    /\[List\s+responsible/i,
    /\[Any prerequisites/i,
    /\[Equipment, supplies/i,
    /\[Who performs/i,
    /\[Expected timeframe/i,
    /\[Role responsible/i,
  ];
  let matchCount = 0;
  for (const pattern of placeholderPatterns) {
    if (pattern.test(html)) matchCount++;
    if (matchCount >= 3) return true;
  }
  return false;
};

// Extract objective code from SOP title like "Hand hygiene documentation (HIC.2.6)"
const extractObjectiveCodeFromTitle = (title: string): string | null => {
  const match = title.match(/\(([A-Z]{2,4}\.\d+\.\d+)\)/);
  return match ? match[1] : null;
};

export default function SharedSOPPage() {
  const { sopId } = useParams<{ sopId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const searchQuery = searchParams.get('q') || '';
  const [sopData, setSOPData] = useState<SOPDisplayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Apply search highlighting to HTML content
  const highlightedHtml = useMemo(() => {
    if (!sopData?.htmlContent) return '';
    if (!searchQuery) return sopData.htmlContent;
    return highlightSearchTerms(sopData.htmlContent, searchQuery);
  }, [sopData?.htmlContent, searchQuery]);

  useEffect(() => {
    if (sopId) {
      loadSOPData(sopId);
    }
  }, [sopId]);

  const loadSOPData = async (id: string) => {
    setLoading(true);
    setError(null);

    // Try nabh_sop_documents first (uploaded SOPs)
    const uploadedResult = await loadSOPById(id);
    if (uploadedResult.success && uploadedResult.data) {
      const sop = uploadedResult.data;
      const objectiveCode = extractObjectiveCodeFromTitle(sop.title);

      // Check if this is template content with placeholders
      if (isTemplateContent(sop.extracted_content)) {
        console.log('[SharedSOPPage] Template content detected for:', sop.title);
        console.log('[SharedSOPPage] Extracted objective code:', objectiveCode);
        // Try to find the real generated SOP by objective code
        if (objectiveCode) {
          const genResult = await getGeneratedSOPByObjectiveCode(objectiveCode);
          console.log('[SharedSOPPage] Generated SOP lookup result:', genResult.success, genResult.error, genResult.data?.id);
          if (genResult.success && genResult.data && genResult.data.sop_html_content && !isTemplateContent(genResult.data.sop_html_content)) {
            // Found a real generated SOP - use it instead
            setSOPData({
              title: formatTitle(sop.title),
              htmlContent: genResult.data.sop_html_content,
              pdfUrl: genResult.data.pdf_url || sop.pdf_url,
              version: genResult.data.version || sop.version,
              source: 'generated',
              objectiveCode: objectiveCode,
            });
            setLoading(false);
            return;
          }
        }

        // No generated version found - mark as template so we show a helpful message
        setSOPData({
          title: formatTitle(sop.title),
          htmlContent: sop.extracted_content,
          pdfUrl: sop.pdf_url,
          version: sop.version,
          source: 'uploaded',
          isTemplate: true,
          objectiveCode: objectiveCode || undefined,
        });
        setLoading(false);
        return;
      }

      // Real content from nabh_sop_documents
      setSOPData({
        title: formatTitle(sop.title),
        htmlContent: sop.extracted_content,
        pdfUrl: sop.pdf_url,
        version: sop.version,
        source: 'uploaded',
        objectiveCode: objectiveCode || undefined,
      });
      setLoading(false);
      return;
    }

    // Fallback: try nabh_generated_sops by ID (AI-generated SOPs)
    const generatedResult = await getGeneratedSOPById(id);
    if (generatedResult.success && generatedResult.data) {
      const sop = generatedResult.data;
      setSOPData({
        title: sop.objective_title || `SOP - ${formatCode(sop.objective_code)}`,
        htmlContent: sop.sop_html_content,
        pdfUrl: sop.pdf_url,
        version: sop.version,
        source: 'generated',
        objectiveCode: sop.objective_code,
      });
      setLoading(false);
      return;
    }

    setError('SOP not found. It may have been removed or the link is invalid.');
    setLoading(false);
  };

  // Check if content is a full HTML document
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
    if (!sopData) return;

    // If PDF exists, download it directly
    if (sopData.pdfUrl) {
      window.open(sopData.pdfUrl, '_blank');
      return;
    }

    const htmlContent = isFullHTML(sopData.htmlContent)
      ? sopData.htmlContent
      : `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${sopData.title}</title>
<style>body{font-family:'Segoe UI',sans-serif;margin:40px;line-height:1.6}</style>
</head><body>${sopData.htmlContent}</body></html>`;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sopData.title.replace(/[^a-z0-9]/gi, '_')}_${sopData.version || '1.0'}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleOpenPdf = () => {
    if (sopData?.pdfUrl) {
      window.open(sopData.pdfUrl, '_blank');
    }
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

  if (error || !sopData) {
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

  // Template content - show helpful message instead of raw placeholders
  if (sopData.isTemplate) {
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
              {sopData.title}
            </Typography>
          </Box>
        </Box>

        <Container maxWidth="sm" sx={{ py: 8 }}>
          <Paper elevation={3} sx={{ p: 4, textAlign: 'center' }}>
            <BuildIcon sx={{ fontSize: 64, color: 'warning.main', mb: 2 }} />
            <Typography variant="h5" fontWeight="bold" gutterBottom>
              SOP Not Yet Generated
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 1 }}>
              This SOP for <strong>{sopData.objectiveCode ? formatCode(sopData.objectiveCode) : 'this objective'}</strong> contains only a blank template.
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              The actual content needs to be generated using the SOP Generator. Go to Recent SOPs, select the chapter and objective, and generate the formatted SOP.
            </Typography>
            <Box display="flex" gap={2} justifyContent="center">
              <Button
                variant="contained"
                color="primary"
                startIcon={<BuildIcon />}
                onClick={() => navigate('/recent-sops')}
              >
                Generate SOP
              </Button>
              <Button
                variant="outlined"
                onClick={() => window.history.back()}
              >
                Go Back
              </Button>
            </Box>
          </Paper>
        </Container>
      </Box>
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
            {sopData.title}
          </Typography>
        </Box>
        <Box display="flex" gap={1}>
          {sopData.pdfUrl && (
            <Button color="inherit" startIcon={<PdfIcon />} onClick={handleOpenPdf} size="small">
              Open PDF
            </Button>
          )}
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
      {isFullHTML(highlightedHtml) ? (
        <iframe
          ref={iframeRef}
          srcDoc={highlightedHtml}
          title={sopData.title}
          sandbox="allow-same-origin allow-scripts"
          style={{
            flex: 1,
            width: '100%',
            border: 'none',
            backgroundColor: 'white',
          }}
        />
      ) : (
        <Box sx={{ flex: 1, overflow: 'auto', p: 4, maxWidth: 800, mx: 'auto', width: '100%' }}>
          <Box dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
        </Box>
      )}
    </Box>
  );
}
