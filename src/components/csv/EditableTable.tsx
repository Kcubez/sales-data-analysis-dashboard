'use client';

import React, { useState, useCallback } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  ColumnDef,
  SortingState,
} from '@tanstack/react-table';
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Search,
  Plus,
  Trash2,
  Save,
  X,
  Loader2,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ColumnInfo } from '@/types/csv';
import { useLanguage } from '@/context/LanguageContext';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';

interface EditableTableProps {
  data: Record<string, string | number | Date | null>[];
  columns: ColumnInfo[];
  datasetId: string;
  rowIds: string[]; // Array of row IDs matching data array
  onDataChange: () => void; // Callback to refresh data after changes
}

export function EditableTable({
  data,
  columns,
  datasetId,
  rowIds,
  onDataChange,
}: EditableTableProps) {
  const { t } = useLanguage();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [pageIndex, setPageIndex] = useState(0);

  // Edit state
  const [editingCell, setEditingCell] = useState<{ rowIndex: number; colName: string } | null>(
    null
  );
  const [editValue, setEditValue] = useState<string>('');
  const [saving, setSaving] = useState(false);

  // Add row state
  const [isAddingRow, setIsAddingRow] = useState(false);
  const [newRowData, setNewRowData] = useState<Record<string, string>>({});

  // Delete modal state
  const [deleteModal, setDeleteModal] = useState<{ open: boolean; rowIndex: number | null }>({
    open: false,
    rowIndex: null,
  });
  const [deleting, setDeleting] = useState(false);

  // Start editing a cell
  const startEdit = useCallback((rowIndex: number, colName: string, currentValue: unknown) => {
    setEditingCell({ rowIndex, colName });
    setEditValue(currentValue != null ? String(currentValue) : '');
  }, []);

  // Cancel editing
  const cancelEdit = useCallback(() => {
    setEditingCell(null);
    setEditValue('');
  }, []);

  // Save cell edit
  const saveEdit = useCallback(async () => {
    if (!editingCell) return;

    setSaving(true);
    try {
      const rowId = rowIds[editingCell.rowIndex];
      const currentRow = data[editingCell.rowIndex];

      // Parse value based on column type
      const col = columns.find(c => c.name === editingCell.colName);
      let parsedValue: unknown = editValue;
      if (col?.type === 'number') {
        parsedValue = parseFloat(editValue) || 0;
      } else if (col?.type === 'date') {
        parsedValue = editValue;
      }

      const updatedData = { ...currentRow, [editingCell.colName]: parsedValue };

      const response = await fetch(`/api/rows/${rowId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: updatedData }),
      });

      if ((await response.json()).success) {
        toast.success('Updated');
        onDataChange();
      } else {
        toast.error('Failed to update');
      }
    } catch (error) {
      toast.error('Failed to update');
    } finally {
      setSaving(false);
      setEditingCell(null);
      setEditValue('');
    }
  }, [editingCell, editValue, rowIds, data, columns, onDataChange]);

  // Delete row
  const confirmDeleteRow = useCallback(async () => {
    if (deleteModal.rowIndex === null) return;

    const rowId = rowIds[deleteModal.rowIndex];
    setDeleting(true);

    try {
      const response = await fetch(`/api/rows/${rowId}?datasetId=${datasetId}`, {
        method: 'DELETE',
      });

      if ((await response.json()).success) {
        toast.success('Row deleted');
        onDataChange();
        setDeleteModal({ open: false, rowIndex: null });
      } else {
        toast.error('Failed to delete');
      }
    } catch (error) {
      toast.error('Failed to delete');
    } finally {
      setDeleting(false);
    }
  }, [deleteModal.rowIndex, rowIds, datasetId, onDataChange]);

  // Add new row
  const addNewRow = useCallback(async () => {
    setSaving(true);
    try {
      // Build row data with proper types
      const rowData: Record<string, unknown> = {};
      columns.forEach(col => {
        const val = newRowData[col.name] || '';
        if (col.type === 'number') {
          rowData[col.name] = parseFloat(val) || 0;
        } else if (col.type === 'date') {
          rowData[col.name] = val || new Date().toISOString();
        } else {
          rowData[col.name] = val;
        }
      });

      const response = await fetch('/api/rows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datasetId, data: rowData }),
      });

      if ((await response.json()).success) {
        toast.success('Row added');
        setIsAddingRow(false);
        setNewRowData({});
        onDataChange();
      } else {
        toast.error('Failed to add row');
      }
    } catch (error) {
      toast.error('Failed to add row');
    } finally {
      setSaving(false);
    }
  }, [columns, newRowData, datasetId, onDataChange]);

  // Format date for display
  const formatDate = (value: unknown): string => {
    try {
      const date = value instanceof Date ? value : new Date(String(value));
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        });
      }
    } catch {
      // ignore
    }
    return String(value);
  };

  // Generate table columns
  const tableColumns = React.useMemo<
    ColumnDef<Record<string, string | number | Date | null>>[]
  >(() => {
    const cols: ColumnDef<Record<string, string | number | Date | null>>[] = columns.map(col => ({
      accessorKey: col.name,
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="flex items-center gap-1 font-semibold -ml-4"
        >
          {col.name}
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const value = row.getValue(col.name);
        const rowIndex = row.index;
        const isEditing = editingCell?.rowIndex === rowIndex && editingCell?.colName === col.name;

        if (isEditing) {
          return (
            <div className="flex items-center gap-1">
              <Input
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                className="h-8 w-full min-w-25"
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter') saveEdit();
                  if (e.key === 'Escape') cancelEdit();
                }}
                type={col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text'}
              />
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={saveEdit}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Save className="h-3 w-3 text-green-600" />
                )}
              </Button>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={cancelEdit}>
                <X className="h-3 w-3 text-red-500" />
              </Button>
            </div>
          );
        }

        if (value === null || value === undefined) {
          return (
            <span
              className="text-muted-foreground cursor-pointer hover:bg-muted/50 px-2 py-1 rounded"
              onClick={() => startEdit(rowIndex, col.name, value)}
            >
              —
            </span>
          );
        }

        if (col.type === 'date') {
          return (
            <span
              className="cursor-pointer hover:bg-violet-50 px-2 py-1 rounded transition-colors"
              onClick={() => startEdit(rowIndex, col.name, value)}
            >
              {formatDate(value)}
            </span>
          );
        }

        if (col.type === 'number' && typeof value === 'number') {
          return (
            <span
              className="cursor-pointer hover:bg-violet-50 px-2 py-1 rounded transition-colors"
              onClick={() => startEdit(rowIndex, col.name, value)}
            >
              {new Intl.NumberFormat('en-US', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2,
              }).format(value)}
            </span>
          );
        }

        return (
          <span
            className="cursor-pointer hover:bg-violet-50 px-2 py-1 rounded transition-colors"
            onClick={() => startEdit(rowIndex, col.name, value)}
          >
            {String(value)}
          </span>
        );
      },
    }));

    // Add actions column
    cols.push({
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50"
          onClick={() => setDeleteModal({ open: true, rowIndex: row.index })}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      ),
    });

    return cols;
  }, [columns, editingCell, editValue, saving, saveEdit, cancelEdit, startEdit]);

  const table = useReactTable({
    data,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: 'includesString',
    state: {
      sorting,
      globalFilter,
      pagination: { pageIndex, pageSize },
    },
    onPaginationChange: updater => {
      const newState = typeof updater === 'function' ? updater({ pageIndex, pageSize }) : updater;
      setPageIndex(newState.pageIndex);
      setPageSize(newState.pageSize);
    },
  });

  const currentPage = pageIndex + 1;
  const totalPages = table.getPageCount();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-3 justify-between">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('table.search')}
            value={globalFilter}
            onChange={e => setGlobalFilter(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-green-500 text-green-600 hover:bg-green-50"
            onClick={() => setIsAddingRow(true)}
          >
            <Plus className="h-4 w-4" />
            Add Row
          </Button>
          <Select value={String(pageSize)} onValueChange={v => setPageSize(Number(v))}>
            <SelectTrigger className="w-25">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 25, 50, 100].map(size => (
                <SelectItem key={size} value={String(size)}>
                  {size} rows
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Add Row Form */}
      {isAddingRow && (
        <div className="border rounded-lg p-4 bg-green-50/50 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-medium text-green-700">Add New Row</div>
            <span className="text-xs text-muted-foreground">All fields are required</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {columns.map(col => (
              <div key={col.name} className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  {col.name} <span className="text-red-500">*</span>
                </label>
                <Input
                  placeholder={col.name}
                  value={newRowData[col.name] || ''}
                  onChange={e => setNewRowData(prev => ({ ...prev, [col.name]: e.target.value }))}
                  type={col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text'}
                  className="h-9"
                  required
                />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={addNewRow}
              disabled={saving || columns.some(col => !newRowData[col.name]?.trim())}
              className="gap-2 bg-green-600 hover:bg-green-700"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Row
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setIsAddingRow(false);
                setNewRowData({});
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map(headerGroup => (
                <TableRow key={headerGroup.id} className="bg-muted/50">
                  {headerGroup.headers.map(header => (
                    <TableHead key={header.id} className="whitespace-nowrap">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map(row => (
                  <TableRow key={row.id} className="hover:bg-muted/30">
                    {row.getVisibleCells().map(cell => (
                      <TableCell key={cell.id} className="py-2">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={tableColumns.length}
                    className="h-24 text-center text-muted-foreground"
                  >
                    {t('common.noData')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Showing {table.getRowModel().rows.length} of {data.length} rows
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="gap-1"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <span className="text-sm px-2">
            Page {currentPage} of {totalPages || 1}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="gap-1"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <Dialog
        open={deleteModal.open}
        onOpenChange={open =>
          !deleting && setDeleteModal({ open, rowIndex: open ? deleteModal.rowIndex : null })
        }
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-2">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
            <DialogTitle className="text-center">Delete Row?</DialogTitle>
            <DialogDescription className="text-center">
              Are you sure you want to delete this row? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:justify-center mt-4">
            <Button
              variant="outline"
              onClick={() => setDeleteModal({ open: false, rowIndex: null })}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteRow}
              disabled={deleting}
              className="gap-2"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  Delete
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
