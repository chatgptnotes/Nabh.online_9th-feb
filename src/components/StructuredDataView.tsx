import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import Icon from '@mui/material/Icon';
import { parseExtractedText } from '../utils/parseExtractedText';
import { exportToExcel } from '../utils/excelExport';
import { exportToPdf } from '../utils/pdfExport';

interface StructuredDataViewProps {
  extractedText: string;
  fileName: string;
}

export default function StructuredDataView({ extractedText, fileName }: StructuredDataViewProps) {
  const data = parseExtractedText(extractedText);

  const hasStructuredData = data.keyValuePairs.length > 0 || data.sections.length > 0 || data.tables.length > 0;

  // If nothing was parsed, show raw text
  if (!hasStructuredData && !data.rawText) {
    return (
      <Box sx={{ bgcolor: 'grey.50', borderRadius: 1, p: 2 }}>
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem', lineHeight: 1.6 }}>
          {extractedText}
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      {/* Header: Title, Type & Download Button */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {data.title && (
            <Typography variant="subtitle1" fontWeight={700} sx={{ color: '#1565C0' }}>
              {data.title}
            </Typography>
          )}
          {data.documentType && (
            <Chip label={data.documentType} size="small" variant="outlined" sx={{ fontSize: '0.7rem', textTransform: 'capitalize' }} />
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<Icon sx={{ fontSize: '16px !important' }}>picture_as_pdf</Icon>}
            onClick={() => exportToPdf(data, fileName)}
            sx={{ fontSize: '0.75rem', textTransform: 'none', borderColor: '#d32f2f', color: '#d32f2f', '&:hover': { borderColor: '#b71c1c', bgcolor: '#ffebee' } }}
          >
            Download PDF
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<Icon sx={{ fontSize: '16px !important' }}>download</Icon>}
            onClick={() => exportToExcel(data, fileName)}
            sx={{ fontSize: '0.75rem', textTransform: 'none' }}
          >
            Download Excel
          </Button>
        </Box>
      </Box>

      {/* Key-Value Pairs Table */}
      {data.keyValuePairs.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Icon sx={{ fontSize: 16, color: '#1565C0' }}>list_alt</Icon>
            Document Fields
          </Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ bgcolor: '#1565C0', color: 'white', fontWeight: 700, fontSize: '0.8rem', width: '35%' }}>
                    Field
                  </TableCell>
                  <TableCell sx={{ bgcolor: '#1565C0', color: 'white', fontWeight: 700, fontSize: '0.8rem' }}>
                    Value
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.keyValuePairs.map((kv, i) => (
                  <TableRow key={i} hover sx={{ '&:nth-of-type(even)': { bgcolor: 'grey.50' } }}>
                    <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>
                      {kv.key}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>{kv.value}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* Sections */}
      {data.sections.length > 0 && (
        <Box sx={{ mb: 2 }}>
          {data.sections.map((section, i) => (
            <Box key={i} sx={{ mb: 1.5 }}>
              <Typography variant="subtitle2" fontWeight={700} sx={{
                bgcolor: '#e3f2fd', px: 1.5, py: 0.75, borderLeft: '3px solid #1565C0', mb: 0.5, fontSize: '0.85rem',
              }}>
                {section.heading}
              </Typography>
              <Typography variant="body2" sx={{ px: 1.5, py: 0.5, whiteSpace: 'pre-wrap', lineHeight: 1.6, fontSize: '0.8rem' }}>
                {section.content}
              </Typography>
            </Box>
          ))}
        </Box>
      )}

      {/* Tables from document */}
      {data.tables.length > 0 && data.tables.map((table, i) => (
        <Box key={i} sx={{ mb: 2 }}>
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Icon sx={{ fontSize: 16, color: '#1565C0' }}>table_chart</Icon>
            {table.caption || 'Table Data'}
          </Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  {table.headers.map((h, j) => (
                    <TableCell key={j} sx={{ bgcolor: '#1565C0 !important', color: 'white', fontWeight: 700, fontSize: '0.85rem', py: 1.5, whiteSpace: 'nowrap' }}>
                      {h}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {table.rows.map((row, ri) => (
                  <TableRow key={ri} hover sx={{ '&:nth-of-type(even)': { bgcolor: 'grey.50' } }}>
                    {row.map((cell, ci) => (
                      <TableCell key={ci} sx={{ fontSize: '0.8rem' }}>{cell}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      ))}

      {/* Raw text fallback */}
      {data.rawText && (
        <Box sx={{ bgcolor: 'grey.50', borderRadius: 1, p: 2 }}>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem', lineHeight: 1.6 }}>
            {data.rawText}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
