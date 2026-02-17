import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  IconButton,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper
} from '@mui/material';
import { Add, Close, Edit as EditIcon, Delete } from '@mui/icons-material';
import { supabase } from '../lib/supabase';

interface DepartmentDB {
  id: string;
  dept_id: string;
  name: string;
  code: string;
  category: string;
  type: string;
  description: string | null;
  head_of_department: string | null;
  contact_number: string | null;
  nabh_is_active: boolean;
  nabh_last_audit_date: string | null;
  nabh_compliance_status: string;
  services: string[] | null;
  equipment_list: string[] | null;
  staff_count: number | null;
  is_emergency_service: boolean;
  operating_hours: string | null;
  hospital_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const REQUIRED_DEPARTMENTS = [
  'Reception',
  'Pharmacy',
  'Pathology',
  'Radiology',
  'X-ray',
  'Ultrasound',
  'USG',
  'MRO',
  'ICU',
  'General Ward – F/M',
  'Physiotherapy',
  'OT',
  'CSSD',
  'Cath Lab',
  'Maintenance Reg.',
  'Management',
  'Infection Control',
];

const initialFormState = {
  name: '',
  description: '',
  head_of_department: '',
  contact_number: '',
  services: '',
};

const DepartmentsMasterPage: React.FC = () => {
  const [departmentsData, setDepartmentsData] = useState<DepartmentDB[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formData, setFormData] = useState(initialFormState);
  const [openAddDialog, setOpenAddDialog] = useState(false);
  const [openEditDialog, setOpenEditDialog] = useState(false);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<DepartmentDB | null>(null);
  const [deletingDepartment, setDeletingDepartment] = useState<DepartmentDB | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false, message: '', severity: 'success'
  });

  // Fetch departments & auto-seed missing ones
  useEffect(() => {
    const fetchAndSeedDepartments = async () => {
      try {
        const { data, error } = await (supabase.from('departments') as any)
          .select('*')
          .eq('is_active', true)
          .order('name');

        if (error) throw error;
        const existing = (data || []) as DepartmentDB[];
        const existingNames = new Set(existing.map((d: DepartmentDB) => d.name.toLowerCase()));

        // Find missing departments
        const missing = REQUIRED_DEPARTMENTS.filter(
          name => !existingNames.has(name.toLowerCase())
        );

        if (missing.length > 0) {
          const newDepts = missing.map((name, i) => ({
            dept_id: `DEPT${String(existing.length + i + 1).padStart(3, '0')}`,
            name,
            code: name.replace(/[^a-zA-Z]/g, '').substring(0, 4).toUpperCase(),
            category: 'Clinical Speciality',
            type: 'Medical',
            description: null,
            head_of_department: null,
            contact_number: null,
            operating_hours: null,
            is_emergency_service: false,
            services: null,
            nabh_is_active: true,
            nabh_compliance_status: 'Not Assessed',
            hospital_id: 'hope-hospital',
            is_active: true,
          }));

          const { data: inserted, error: insertError } = await (supabase.from('departments') as any)
            .insert(newDepts)
            .select();

          if (insertError) {
            console.error('Error seeding departments:', insertError);
          } else if (inserted) {
            setDepartmentsData([...existing, ...inserted].sort((a: DepartmentDB, b: DepartmentDB) => a.name.localeCompare(b.name)));
            setLoading(false);
            return;
          }
        }

        setDepartmentsData(existing);
      } catch (err) {
        console.error('Error fetching departments:', err);
        setSnackbar({ open: true, message: 'Failed to load departments', severity: 'error' });
      } finally {
        setLoading(false);
      }
    };
    fetchAndSeedDepartments();
  }, []);

  const handleFormChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Add Department
  const handleAddDepartment = async () => {
    if (!formData.name.trim()) {
      setSnackbar({ open: true, message: 'Name is a required field', severity: 'error' });
      return;
    }

    setSaving(true);
    try {
      const deptId = `DEPT${String(departmentsData.length + 1).padStart(3, '0')}`;
      const servicesArray = formData.services
        ? formData.services.split(',').map(s => s.trim()).filter(s => s)
        : [];

      const newDepartment = {
        dept_id: deptId,
        name: formData.name.trim(),
        code: formData.name.trim().substring(0, 4).toUpperCase(),
        category: 'Clinical Speciality',
        type: 'Medical',
        description: formData.description.trim() || null,
        head_of_department: formData.head_of_department.trim() || null,
        contact_number: formData.contact_number.trim() || null,
        operating_hours: null,
        is_emergency_service: false,
        services: servicesArray.length > 0 ? servicesArray : null,
        nabh_is_active: true,
        nabh_compliance_status: 'Not Assessed',
        hospital_id: 'hope-hospital',
        is_active: true,
      };

      const { data, error } = await (supabase.from('departments') as any)
        .insert([newDepartment])
        .select()
        .single();

      if (error) {
        setSnackbar({ open: true, message: `Error: ${error.message}`, severity: 'error' });
      } else {
        setDepartmentsData(prev => [...prev, data as DepartmentDB]);
        setSnackbar({ open: true, message: 'Department added successfully!', severity: 'success' });
        setOpenAddDialog(false);
        setFormData(initialFormState);
      }
    } catch (err) {
      console.error('Error adding department:', err);
      setSnackbar({ open: true, message: 'Failed to add department', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // Edit Department
  const handleOpenEditDialog = (dept: DepartmentDB) => {
    setEditingDepartment(dept);
    setFormData({
      name: dept.name,
      description: dept.description || '',
      head_of_department: dept.head_of_department || '',
      contact_number: dept.contact_number || '',
      services: (dept.services || []).join(', '),
    });
    setOpenEditDialog(true);
  };

  const handleUpdateDepartment = async () => {
    if (!editingDepartment || !formData.name.trim()) {
      setSnackbar({ open: true, message: 'Name is a required field', severity: 'error' });
      return;
    }

    setSaving(true);
    try {
      const servicesArray = formData.services
        ? formData.services.split(',').map(s => s.trim()).filter(s => s)
        : [];

      const updatedData = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        head_of_department: formData.head_of_department.trim() || null,
        contact_number: formData.contact_number.trim() || null,
        services: servicesArray.length > 0 ? servicesArray : null,
      };

      const { error } = await (supabase.from('departments') as any)
        .update(updatedData)
        .eq('id', editingDepartment.id);

      if (error) {
        setSnackbar({ open: true, message: `Error: ${error.message}`, severity: 'error' });
      } else {
        setDepartmentsData(prev =>
          prev.map(d => d.id === editingDepartment.id ? { ...d, ...updatedData } : d)
        );
        setSnackbar({ open: true, message: 'Department updated successfully!', severity: 'success' });
        setOpenEditDialog(false);
        setEditingDepartment(null);
        setFormData(initialFormState);
      }
    } catch (err) {
      console.error('Error updating department:', err);
      setSnackbar({ open: true, message: 'Failed to update department', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // Delete Department
  const handleDeleteDepartment = async () => {
    if (!deletingDepartment) return;

    setDeleting(true);
    try {
      const { error } = await (supabase.from('departments') as any)
        .update({ is_active: false })
        .eq('id', deletingDepartment.id);

      if (error) {
        setSnackbar({ open: true, message: `Error: ${error.message}`, severity: 'error' });
      } else {
        setDepartmentsData(prev => prev.filter(d => d.id !== deletingDepartment.id));
        setSnackbar({ open: true, message: 'Department deleted successfully!', severity: 'success' });
        setOpenDeleteDialog(false);
        setDeletingDepartment(null);
      }
    } catch (err) {
      console.error('Error deleting department:', err);
      setSnackbar({ open: true, message: 'Failed to delete department', severity: 'error' });
    } finally {
      setDeleting(false);
    }
  };

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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" fontWeight="bold">Department Master</Typography>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => { setFormData(initialFormState); setOpenAddDialog(true); }}
        >
          Add Department
        </Button>
      </Box>

      {/* Table */}
      <TableContainer component={Paper} elevation={1}>
        <Table>
          <TableHead>
            <TableRow sx={{ backgroundColor: '#1565c0' }}>
              <TableCell sx={{ color: '#fff', fontWeight: 'bold', width: 60 }}>Sr. No.</TableCell>
              <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Department Name</TableCell>
              <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Head of Department</TableCell>
              <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Contact Number</TableCell>
              <TableCell sx={{ color: '#fff', fontWeight: 'bold' }}>Services</TableCell>
              <TableCell sx={{ color: '#fff', fontWeight: 'bold', width: 100 }} align="center">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {departmentsData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">No departments found. Click "Add Department" to create one.</Typography>
                </TableCell>
              </TableRow>
            ) : (
              departmentsData.map((dept, index) => (
                <TableRow key={dept.id} hover>
                  <TableCell>{index + 1}</TableCell>
                  <TableCell sx={{ fontWeight: 500 }}>{dept.name}</TableCell>
                  <TableCell>{dept.head_of_department || '-'}</TableCell>
                  <TableCell>{dept.contact_number || '-'}</TableCell>
                  <TableCell>{dept.services ? dept.services.join(', ') : '-'}</TableCell>
                  <TableCell align="center">
                    <IconButton size="small" color="primary" onClick={() => handleOpenEditDialog(dept)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => { setDeletingDepartment(dept); setOpenDeleteDialog(true); }}
                    >
                      <Delete fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Add Department Dialog */}
      <Dialog open={openAddDialog} onClose={() => { setOpenAddDialog(false); setFormData(initialFormState); }} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">Add New Department</Typography>
          <IconButton onClick={() => { setOpenAddDialog(false); setFormData(initialFormState); }} size="small">
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              fullWidth
              label="Department Name"
              value={formData.name}
              onChange={(e) => handleFormChange('name', e.target.value)}
              required
              placeholder="e.g., Cardiology"
            />
            <TextField
              fullWidth
              label="Description"
              value={formData.description}
              onChange={(e) => handleFormChange('description', e.target.value)}
              multiline
              rows={2}
              placeholder="Brief description of the department"
            />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                fullWidth
                label="Head of Department"
                value={formData.head_of_department}
                onChange={(e) => handleFormChange('head_of_department', e.target.value)}
                placeholder="e.g., Dr. Sharma"
              />
              <TextField
                fullWidth
                label="Contact Number"
                value={formData.contact_number}
                onChange={(e) => handleFormChange('contact_number', e.target.value)}
                placeholder="e.g., +91-712-XXXXXXX"
              />
            </Box>
            <TextField
              fullWidth
              label="Services (comma-separated)"
              value={formData.services}
              onChange={(e) => handleFormChange('services', e.target.value)}
              multiline
              rows={2}
              placeholder="e.g., OPD Consultation, IPD Care, Emergency Services"
              helperText="Enter services separated by commas"
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => { setOpenAddDialog(false); setFormData(initialFormState); }} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleAddDepartment}
            disabled={saving || !formData.name.trim()}
            startIcon={saving ? <CircularProgress size={20} /> : <Add />}
          >
            {saving ? 'Adding...' : 'Add Department'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Department Dialog */}
      <Dialog open={openEditDialog} onClose={() => { setOpenEditDialog(false); setEditingDepartment(null); setFormData(initialFormState); }} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">Edit Department</Typography>
          <IconButton onClick={() => { setOpenEditDialog(false); setEditingDepartment(null); setFormData(initialFormState); }} size="small">
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              fullWidth
              label="Department Name"
              value={formData.name}
              onChange={(e) => handleFormChange('name', e.target.value)}
              required
            />
            <TextField
              fullWidth
              label="Description"
              value={formData.description}
              onChange={(e) => handleFormChange('description', e.target.value)}
              multiline
              rows={2}
            />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                fullWidth
                label="Head of Department"
                value={formData.head_of_department}
                onChange={(e) => handleFormChange('head_of_department', e.target.value)}
              />
              <TextField
                fullWidth
                label="Contact Number"
                value={formData.contact_number}
                onChange={(e) => handleFormChange('contact_number', e.target.value)}
              />
            </Box>
            <TextField
              fullWidth
              label="Services (comma-separated)"
              value={formData.services}
              onChange={(e) => handleFormChange('services', e.target.value)}
              multiline
              rows={2}
              helperText="Enter services separated by commas"
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => { setOpenEditDialog(false); setEditingDepartment(null); setFormData(initialFormState); }} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleUpdateDepartment}
            disabled={saving || !formData.name.trim()}
            startIcon={saving ? <CircularProgress size={20} /> : <EditIcon />}
          >
            {saving ? 'Updating...' : 'Update Department'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={openDeleteDialog} onClose={() => { setOpenDeleteDialog(false); setDeletingDepartment(null); }} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Department</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete <strong>{deletingDepartment?.name}</strong>?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => { setOpenDeleteDialog(false); setDeletingDepartment(null); }} disabled={deleting}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDeleteDepartment}
            disabled={deleting}
            startIcon={deleting ? <CircularProgress size={20} /> : <Delete />}
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
          severity={snackbar.severity}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default DepartmentsMasterPage;
