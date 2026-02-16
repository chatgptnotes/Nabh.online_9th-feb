import { useState, useEffect } from 'react';
import Drawer from '@mui/material/Drawer';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Toolbar from '@mui/material/Toolbar';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';
import Chip from '@mui/material/Chip';
import Icon from '@mui/material/Icon';
import Tooltip from '@mui/material/Tooltip';
import Divider from '@mui/material/Divider';
import Collapse from '@mui/material/Collapse';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import { useNavigate, useLocation } from 'react-router-dom';
import { useNABHStore } from '../store/nabhStore';
import { getChapterStats } from '../data/nabhData';
import { departmentsMaster } from '../data/departmentsMaster';
import { supabase } from '../lib/supabase';

const DOCUMENT_LEVELS = [
  { id: 'level-1', label: 'Level 1: Mission & Vision', icon: 'flag', path: '/document-levels?level=1', color: '#1565C0' },
  {
    id: 'level-2',
    label: 'Level 2: Policies & Procedures',
    icon: 'policy',
    path: '/document-levels?level=2',
    color: '#2E7D32',
    children: [
      { id: 'sops', label: 'SOPs', icon: 'description', path: '/sops' },
      { id: 'recent-sops', label: 'Recent SOPs', icon: 'schedule', path: '/recent-sops' },
      { id: 'sop-database', label: 'SOP Database', icon: 'storage', path: '/sop-database' },
      { id: 'custom-sops', label: 'Custom SOPs', icon: 'build', path: '/custom-sops' }
    ]
  },
  { id: 'level-3', label: 'Level 3: Work Instructions', icon: 'assignment', path: '/document-levels?level=3', color: '#ED6C02' },
  {
    id: 'level-4',
    label: 'Level 4: Forms & Records',
    icon: 'description',
    path: '/document-levels?level=4',
    color: '#9C27B0',
    children: [
      { id: 'stationery', label: 'Stationery', icon: 'inventory_2', path: '/stationery' }
    ]
  },
  {
    id: 'level-5',
    label: 'Level 5: External Documents',
    icon: 'cloud_download',
    path: '/document-levels?level=5',
    color: '#D32F2F',
    children: [
      { id: 'licenses', label: 'Licenses & Statutory', icon: 'gavel', path: '/licenses' }
    ]
  },
];

const MANAGEMENT_SECTIONS = [
  { id: 'stationery', label: 'Stationery', icon: 'inventory_2', path: '/stationery', description: 'Hospital forms & documents' },
  { id: 'committees', label: 'Committees', icon: 'groups', path: '/committees', description: 'Manage hospital committees' },
  { id: 'departments', label: 'Departments', icon: 'apartment', path: '/departments', description: 'Hospital departments master' },
  { id: 'equipment', label: 'Equipment', icon: 'medical_services', path: '/equipment', description: 'Medical equipment inventory' },
  { id: 'sops', label: 'SOPs', icon: 'description', path: '/sops', description: 'Standard Operating Procedures linked to NABH chapters with shareable URLs' },
  { id: 'signage-generator', label: 'Signage Generator', icon: 'signpost', path: '/signage-generator', description: 'Generate professional hospital signages, posters & infographics with AI' },
  { id: 'image-generator', label: '🎨 AI Image Generator', icon: 'photo_camera', path: '/image-generator', description: 'Generate NABH evidence photos, training materials & facility visuals using Gemini 3 Pro' },
  { id: 'call-center', label: '📞 Call Center', icon: 'phone', path: '/call-center', description: 'Voice calling system for NABH team coordination & audit reminders via Twilio' },
  { id: 'emergency-codes', label: 'Emergency Codes', icon: 'emergency', path: '/emergency-codes', description: 'Code Blue, Code Red & Code Pink protocols and documentation' },
  { id: 'manuals', label: 'Hospital Manuals', icon: 'menu_book', path: '/manuals', description: 'Manage hospital policies, procedures & operational manuals' },
  { id: 'licenses', label: 'Licenses & Statutory', icon: 'gavel', path: '/licenses', description: 'Track hospital licenses, certificates & statutory requirements with expiry monitoring' },
  { id: 'mous', label: 'MOUs & Partnerships', icon: 'handshake', path: '/mous', description: 'Manage Memoranda of Understanding and strategic partnerships with multiple document support' },
  { id: 'programs', label: 'Hospital Programs', icon: 'local_hospital', path: '/programs', description: 'Manage hospital programs and initiatives' },
  { id: 'clinical-audits', label: 'Clinical Audits', icon: 'fact_check', path: '/clinical-audits', description: 'Manage clinical audits and quality assessments' },
  { id: 'surveys', label: 'Surveys', icon: 'poll', path: '/surveys', description: 'Manage patient & staff satisfaction surveys and quality assessments' },
  { id: 'evidence-prompt', label: 'Evidence Prompt Master', icon: 'assignment', path: '/evidence-prompt', description: 'NABH evidence generation prompts & templates' },
  { id: 'sop-prompt', label: 'SOP Prompt Master', icon: 'description', path: '/sop-prompt', description: 'SOP generation prompts & templates' },
  { id: 'cheat-sheets', label: 'Chapter Cheat Sheets', icon: 'quiz', path: '/cheat-sheets', description: 'Quick reference sheets for each NABH chapter with Google Docs links' },
  { id: 'search', label: 'Global Search', icon: 'search', path: '/search', description: 'Search across all evidences, objectives, committees, and masters by keywords' },
  { id: 'kpis', label: 'KPIs', icon: 'analytics', path: '/kpis', description: 'Quality indicators' },
  { id: 'presentations', label: 'Slide Decks', icon: 'slideshow', path: '/presentations', description: 'Auditor presentations' },
  { id: 'patients', label: 'Patients', icon: 'personal_injury', path: '/patients', description: 'Manage patient records' },
  { id: 'employees', label: 'Employees', icon: 'badge', path: '/employees', description: 'Manage hospital staff' },
  { id: 'consultants', label: 'Visiting Consultants', icon: 'medical_information', path: '/consultants', description: 'Manage visiting doctors' },
  { id: 'doctors', label: 'Resident Doctors', icon: 'medication_liquid', path: '/doctors', description: 'Manage RMOs and full-time doctors' },
  { id: 'nabh-master', label: 'NABH Master', icon: 'edit_note', path: '/nabh-master', description: 'Manage chapters, standards & elements' },
  { id: 'migration', label: 'Data Migration', icon: 'upload_file', path: '/migration', description: 'Import NABH standards data' },
  { id: 'old-extracted-sops', label: "Old Extracted SOP's", icon: 'history', path: '/old-extracted-sops', description: 'View extracted SOP data from nabh_chapter_data table' },
];

const drawerWidth = 280;

const chapterIcons: Record<string, string> = {
  AAC: 'accessible',
  COP: 'medical_services',
  MOM: 'medication',
  PRE: 'person',
  HIC: 'sanitizer',
  CQI: 'verified',
  PSQ: 'verified',
  ROM: 'business',
  FMS: 'apartment',
  HRM: 'groups',
  IMS: 'storage',
};

interface SidebarProps {
  mobileOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  const { chapters, selectedChapter, setSelectedChapter, sidebarDepartments, addSidebarDepartment, removeSidebarDepartment, customDepartments, addCustomDepartment } = useNABHStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [expandedLevel, setExpandedLevel] = useState<string | null>('level-2');
  const [showAddDept, setShowAddDept] = useState(false);
  const [openAddDeptDialog, setOpenAddDeptDialog] = useState(false);
  const [deptForm, setDeptForm] = useState({ name: '', code: '', category: 'Clinical Speciality', type: 'Medical', operating_hours: '', is_emergency_service: false });
  const [savingDept, setSavingDept] = useState(false);

  useEffect(() => {
    const missingCodes = sidebarDepartments.filter(
      code => !departmentsMaster.find(d => d.code === code) && !customDepartments[code]
    );
    if (missingCodes.length === 0) return;

    supabase.from('departments').select('code, name')
      .in('code', missingCodes)
      .then(({ data }) => {
        if (data) {
          data.forEach((d: any) => addCustomDepartment(d.code, d.name));
        }
      });
  }, [sidebarDepartments]);

  const handleAddDepartment = async () => {
    if (!deptForm.name.trim() || !deptForm.code.trim()) return;
    setSavingDept(true);
    try {
      const newDept = {
        dept_id: `DEPT${Date.now().toString().slice(-5)}`,
        name: deptForm.name.trim(),
        code: deptForm.code.trim().toUpperCase(),
        category: deptForm.category,
        type: deptForm.type,
        operating_hours: deptForm.operating_hours.trim() || null,
        is_emergency_service: deptForm.is_emergency_service,
        nabh_compliance_status: 'Not Assessed',
        hospital_id: 'hope-hospital',
        is_active: true,
      };
      const { error } = await (supabase.from('departments') as any).insert([newDept]);
      if (error) throw error;
      addSidebarDepartment(newDept.code);
      addCustomDepartment(newDept.code, newDept.name);
      setOpenAddDeptDialog(false);
      setDeptForm({ name: '', code: '', category: 'Clinical Speciality', type: 'Medical', operating_hours: '', is_emergency_service: false });
      navigate(`/department/${newDept.code}`);
      onClose();
    } catch (err) {
      console.error('Error adding department:', err);
    } finally {
      setSavingDept(false);
    }
  };

  const handleChapterClick = (chapterId: string) => {
    setSelectedChapter(chapterId);
    navigate('/');
    onClose();
  };

  const handleSectionClick = (path: string) => {
    setSelectedChapter('');
    navigate(path);
    onClose();
  };

  const drawerContent = (
    <Box>
      <Toolbar />
      
      {/* Prominent Search Button */}
      <Box sx={{ p: 2, pb: 1 }}>
        <ListItemButton
          selected={location.pathname === '/search'}
          onClick={() => handleSectionClick('/search')}
          sx={{
            borderRadius: 2,
            border: '2px solid',
            borderColor: location.pathname === '/search' ? 'primary.main' : 'primary.light',
            backgroundColor: location.pathname === '/search' ? 'primary.main' : 'rgba(25, 118, 210, 0.12)',
            color: location.pathname === '/search' ? 'white' : 'primary.main',
            fontWeight: 'bold',
            py: 1.5,
            '&:hover': {
              backgroundColor: 'primary.main',
              color: 'white',
              transform: 'scale(1.02)',
              '& .MuiListItemText-primary': {
                color: 'white !important',
              },
              '& .MuiListItemText-secondary': {
                color: 'rgba(255,255,255,0.8) !important',
              },
              '& .MuiIcon-root': {
                color: 'white !important',
              }
            },
            transition: 'all 0.2s ease-in-out',
            boxShadow: location.pathname === '/search' ? 3 : 1
          }}
        >
          <ListItemIcon sx={{ minWidth: 40 }}>
            <Icon
              sx={{
                color: location.pathname === '/search' ? 'white' : 'primary.main',
                fontSize: 28
              }}
            >
              search
            </Icon>
          </ListItemIcon>
          <ListItemText
            primary="🔍 GLOBAL SEARCH"
            secondary="Find anything in NABH system"
            slotProps={{
              primary: {
                sx: {
                  fontWeight: 'bold',
                  fontSize: '1rem',
                  color: location.pathname === '/search' ? 'white' : 'primary.dark'
                }
              },
              secondary: {
                sx: {
                  fontSize: '0.75rem',
                  color: location.pathname === '/search' ? 'rgba(255,255,255,0.8)' : 'text.secondary'
                }
              }
            }}
          />
        </ListItemButton>
      </Box>
      
      <Divider sx={{ my: 1 }} />

      {/* Document Levels Section */}
      <Box sx={{ p: 2, pb: 1 }}>
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
          DOCUMENT LEVELS
        </Typography>
        <List disablePadding>
          {DOCUMENT_LEVELS.map((level: any) => (
            <Box key={level.id}>
              <ListItem disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  selected={location.search === `?level=${level.id.split('-')[1]}` && location.pathname === '/document-levels'}
                  onClick={() => {
                    if (level.children) {
                      setExpandedLevel(expandedLevel === level.id ? null : level.id);
                    } else {
                      handleSectionClick(level.path);
                    }
                  }}
                  sx={{
                    borderRadius: 1,
                    py: 0.75,
                    '&.Mui-selected': {
                      bgcolor: `${level.color}15`,
                      borderLeft: `3px solid ${level.color}`,
                    },
                    '&:hover': {
                      bgcolor: `${level.color}10`,
                    },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <Icon sx={{ color: level.color, fontSize: 20 }}>{level.icon}</Icon>
                  </ListItemIcon>
                  <ListItemText
                    primary={level.label}
                    slotProps={{
                      primary: {
                        sx: { fontSize: '0.85rem', fontWeight: 500 }
                      }
                    }}
                  />
                  {level.children && (
                    <Icon sx={{ fontSize: 20, color: 'text.secondary' }}>
                      {expandedLevel === level.id ? 'expand_less' : 'expand_more'}
                    </Icon>
                  )}
                </ListItemButton>
              </ListItem>
              {level.children && (
                <Collapse in={expandedLevel === level.id} timeout="auto" unmountOnExit>
                  <List disablePadding sx={{ pl: 2 }}>
                    {level.children.map((child: any) => (
                      <ListItem key={child.id} disablePadding sx={{ mb: 0.5 }}>
                        <ListItemButton
                          selected={location.pathname === child.path}
                          onClick={() => handleSectionClick(child.path)}
                          sx={{
                            borderRadius: 1,
                            py: 0.5,
                            '&.Mui-selected': {
                              bgcolor: `${level.color}15`,
                              borderLeft: `3px solid ${level.color}`,
                            },
                            '&:hover': {
                              bgcolor: `${level.color}10`,
                            },
                          }}
                        >
                          <ListItemIcon sx={{ minWidth: 32 }}>
                            <Icon sx={{ color: level.color, fontSize: 18 }}>{child.icon}</Icon>
                          </ListItemIcon>
                          <ListItemText
                            primary={child.label}
                            slotProps={{
                              primary: {
                                sx: { fontSize: '0.8rem', fontWeight: 500 }
                              }
                            }}
                          />
                        </ListItemButton>
                      </ListItem>
                    ))}
                  </List>
                </Collapse>
              )}
            </Box>
          ))}
        </List>
      </Box>

      <Divider sx={{ my: 1 }} />

      {/* Departments Section */}
      <Box sx={{ p: 2, pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="subtitle2" color="text.secondary">
            DEPARTMENTS
          </Typography>
          <IconButton
            size="small"
            color="primary"
            onClick={() => setOpenAddDeptDialog(true)}
            sx={{ p: 0.5 }}
          >
            <Icon sx={{ fontSize: 20 }}>add_circle</Icon>
          </IconButton>
        </Box>

        {showAddDept && (
          <Autocomplete
            size="small"
            options={departmentsMaster.filter((d) => !sidebarDepartments.includes(d.code))}
            getOptionLabel={(option) => option.name}
            groupBy={(option) => option.category}
            onChange={(_e, value) => {
              if (value) {
                addSidebarDepartment(value.code);
                setShowAddDept(false);
              }
            }}
            renderInput={(params) => (
              <TextField {...params} placeholder="Search departments..." autoFocus />
            )}
            sx={{ mb: 1 }}
          />
        )}

        {sidebarDepartments.length === 0 && !showAddDept && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', py: 1 }}>
            Click + to add departments
          </Typography>
        )}

        <List disablePadding>
          {sidebarDepartments.map((deptCode) => {
            const dept = departmentsMaster.find((d) => d.code === deptCode);
            const deptName = dept?.name || customDepartments[deptCode];
            if (!deptName) return null;
            return (
              <ListItem
                key={deptCode}
                disablePadding
                sx={{
                  mb: 0.3,
                  '&:hover .dept-delete': { opacity: 1 },
                }}
              >
                <ListItemButton
                  selected={location.pathname === `/department/${deptCode}`}
                  onClick={() => handleSectionClick(`/department/${deptCode}`)}
                  sx={{
                    borderRadius: 1,
                    py: 0.5,
                    '&.Mui-selected': {
                      bgcolor: '#1565C015',
                      borderLeft: '3px solid #1565C0',
                    },
                    '&:hover': { bgcolor: '#1565C008' },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 28 }}>
                    <Icon sx={{ color: '#1565C0', fontSize: 18 }}>apartment</Icon>
                  </ListItemIcon>
                  <ListItemText
                    primary={deptName}
                    slotProps={{
                      primary: { sx: { fontSize: '0.8rem', fontWeight: 500 } },
                    }}
                  />
                  <IconButton
                    className="dept-delete"
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeSidebarDepartment(deptCode);
                    }}
                    sx={{ p: 0.3, opacity: 0, transition: 'opacity 0.2s' }}
                  >
                    <Icon sx={{ fontSize: 14, color: 'text.secondary' }}>close</Icon>
                  </IconButton>
                </ListItemButton>
              </ListItem>
            );
          })}
        </List>
      </Box>

      <Divider sx={{ my: 1 }} />

      {/* Management Sections */}
      <Box sx={{ p: 2, pb: 1 }}>
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
          MANAGEMENT
        </Typography>
      </Box>
      <List dense>
        {MANAGEMENT_SECTIONS.map((section) => (
          <ListItem key={section.id} disablePadding>
            <ListItemButton
              selected={location.pathname === section.path}
              onClick={() => handleSectionClick(section.path)}
              sx={{ py: 1 }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>
                <Icon color={location.pathname === section.path ? 'primary' : 'inherit'}>
                  {section.icon}
                </Icon>
              </ListItemIcon>
              <Tooltip title={section.description} placement="right" arrow>
                <ListItemText
                  primary={section.label}
                  slotProps={{
                    primary: { fontWeight: location.pathname === section.path ? 600 : 400, fontSize: '0.875rem' },
                  }}
                />
              </Tooltip>
            </ListItemButton>
          </ListItem>
        ))}
      </List>
      <Divider sx={{ my: 1 }} />
      {/* Chapters Section */}
      <Box sx={{ p: 2, pb: 1 }}>
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
          CHAPTERS
        </Typography>
      </Box>
      <List>
        {chapters.map((chapter) => {
          const stats = getChapterStats(chapter);
          const progress = stats.total > 0 ? (stats.completed / stats.total) * 100 : 0;

          return (
            <ListItem key={chapter.id} disablePadding>
              <ListItemButton
                selected={selectedChapter === chapter.id}
                onClick={() => handleChapterClick(chapter.id)}
                sx={{ flexDirection: 'column', alignItems: 'flex-start', py: 1.5 }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', mb: 0.5 }}>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <Icon color={selectedChapter === chapter.id ? 'primary' : 'inherit'}>
                      {chapterIcons[chapter.code] || 'folder'}
                    </Icon>
                  </ListItemIcon>
                  <Tooltip
                    title={chapter.fullName}
                    arrow
                    placement="right"
                    enterDelay={300}
                    slotProps={{
                      tooltip: {
                        sx: {
                          maxWidth: 300,
                          fontSize: '0.75rem',
                        },
                      },
                    }}
                  >
                    <ListItemText
                      primary={chapter.code}
                      secondary={chapter.fullName}
                      slotProps={{
                        primary: { fontWeight: 600 },
                        secondary: { variant: 'caption', noWrap: true },
                      }}
                    />
                  </Tooltip>
                </Box>
                <Box sx={{ width: '100%', px: 1 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      {stats.completed}/{stats.total} completed
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {Math.round(progress)}%
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={progress}
                    sx={{ height: 4, borderRadius: 2 }}
                  />
                  <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                    {stats.core > 0 && (
                      <Chip label={`${stats.core} Core`} size="small" color="error" sx={{ height: 18, fontSize: 10 }} />
                    )}
                    {stats.prevNC > 0 && (
                      <Chip label={`${stats.prevNC} Prev NC`} size="small" color="warning" sx={{ height: 18, fontSize: 10 }} />
                    )}
                  </Box>
                </Box>
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>
    </Box>
  );

  return (
    <Box
      component="nav"
      sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
    >
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onClose}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', sm: 'none' },
          '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
        }}
      >
        {drawerContent}
      </Drawer>
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', sm: 'block' },
          '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
        }}
        open
      >
        {drawerContent}
      </Drawer>

      {/* Add Department Dialog */}
      <Dialog open={openAddDeptDialog} onClose={() => setOpenAddDeptDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">Add New Department</Typography>
          <IconButton onClick={() => setOpenAddDeptDialog(false)} size="small">
            <Icon>close</Icon>
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2} sx={{ mt: 0 }}>
            <Grid size={{ xs: 12, md: 8 }}>
              <TextField fullWidth label="Department Name" value={deptForm.name} onChange={(e) => setDeptForm(f => ({ ...f, name: e.target.value }))} required placeholder="e.g., Cardiology" size="small" />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField fullWidth label="Code" value={deptForm.code} onChange={(e) => setDeptForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} required placeholder="e.g., CARD" inputProps={{ maxLength: 10 }} size="small" />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Category</InputLabel>
                <Select value={deptForm.category} label="Category" onChange={(e) => setDeptForm(f => ({ ...f, category: e.target.value }))}>
                  <MenuItem value="Clinical Speciality">Clinical Speciality</MenuItem>
                  <MenuItem value="Super Speciality">Super Speciality</MenuItem>
                  <MenuItem value="Support Services">Support Services</MenuItem>
                  <MenuItem value="Administration">Administration</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Type</InputLabel>
                <Select value={deptForm.type} label="Type" onChange={(e) => setDeptForm(f => ({ ...f, type: e.target.value }))}>
                  <MenuItem value="Medical">Medical</MenuItem>
                  <MenuItem value="Surgical">Surgical</MenuItem>
                  <MenuItem value="Diagnostic">Diagnostic</MenuItem>
                  <MenuItem value="Support">Support</MenuItem>
                  <MenuItem value="Administrative">Administrative</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth label="Operating Hours" value={deptForm.operating_hours} onChange={(e) => setDeptForm(f => ({ ...f, operating_hours: e.target.value }))} placeholder="e.g., 24/7" size="small" />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <FormControlLabel control={<Checkbox checked={deptForm.is_emergency_service} onChange={(e) => setDeptForm(f => ({ ...f, is_emergency_service: e.target.checked }))} />} label="24/7 Emergency Service" />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setOpenAddDeptDialog(false)} disabled={savingDept}>Cancel</Button>
          <Button variant="contained" onClick={handleAddDepartment} disabled={savingDept || !deptForm.name.trim() || !deptForm.code.trim()} startIcon={savingDept ? <CircularProgress size={20} /> : <Icon>add</Icon>}>
            {savingDept ? 'Adding...' : 'Add Department'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
