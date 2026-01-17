'use client';

import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Download,
  Filter as FilterIcon,
  ChevronDown,
  Loader2,
  LayoutGrid,
  Trash2,
  RefreshCw,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { KpiCards } from '@/components/dashboard/KpiCards';
import { FilterPanel } from '@/components/dashboard/FilterPanel';
import { ChartContainer } from '@/components/dashboard/ChartContainer';
import { EditableTable } from '@/components/csv/EditableTable';
import { DataCleanerModal } from '@/components/dashboard/DataCleanerModal';
import { useLanguage } from '@/context/LanguageContext';
import { Filter } from '@/types/filter';
import { ColumnInfo, CsvData } from '@/types/csv';
import { calculateKpis, detectKpiColumns } from '@/lib/kpi-calculator';
import { convertToCsv, downloadCsv } from '@/lib/csv-parser';
import { CleaningResult } from '@/types/data-cleaner';
import { toast } from 'sonner';

interface DataRow {
  id: string;
  datasetId: string;
  rowIndex: number;
  data: Record<string, unknown>;
}

interface Dataset {
  id: string;
  name: string;
  fileName: string;
  columns: ColumnInfo[];
  rowCount: number;
  rows: DataRow[];
}

export default function DatasetDashboardPage() {
  const router = useRouter();
  const params = useParams();
  const datasetId = params.id as string;
  const { t } = useLanguage();

  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filter[]>([]);
  const [priorityColumn, setPriorityColumn] = useState<string | null>(null);
  const [showDataCleaner, setShowDataCleaner] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch dataset from Supabase
  useEffect(() => {
    async function fetchDataset() {
      try {
        const response = await fetch(`/api/datasets/${datasetId}`);
        const result = await response.json();

        if (result.success) {
          setDataset(result.dataset);
        } else {
          toast.error('Dataset not found');
          router.push('/dashboard');
        }
      } catch (error) {
        console.error('Error fetching dataset:', error);
        toast.error('Failed to load dataset');
        router.push('/dashboard');
      } finally {
        setLoading(false);
      }
    }

    if (datasetId) {
      fetchDataset();
    }
  }, [datasetId, router]);

  // Refresh data function - called after CRUD operations
  const refreshData = useCallback(async () => {
    try {
      const response = await fetch(`/api/datasets/${datasetId}`);
      const result = await response.json();
      if (result.success) {
        setDataset(result.dataset);
      }
    } catch (error) {
      console.error('Error refreshing data:', error);
    }
  }, [datasetId]);

  // Create a structure that keeps row IDs with their data for efficient filtering
  const rowsWithIds = useMemo(() => {
    if (!dataset) return [];
    return dataset.rows.map(row => ({
      id: row.id,
      data: row.data as Record<string, string | number | Date | null>,
    }));
  }, [dataset]);

  // Convert dataset rows to CSV data format
  const csvData: CsvData | null = useMemo(() => {
    if (!dataset) return null;

    return {
      columns: dataset.columns,
      rows: rowsWithIds.map(r => r.data),
      rawHeaders: dataset.columns.map(c => c.name),
      fileName: dataset.fileName,
      totalRows: dataset.rowCount,
    };
  }, [dataset, rowsWithIds]);

  // Apply filters to get filtered rows (keeping IDs attached) - O(n) complexity
  const filteredRowsWithIds = useMemo(() => {
    if (!rowsWithIds.length) return [];

    const activeFilters = filters.filter(f => f.isActive);
    if (activeFilters.length === 0) return rowsWithIds;

    return rowsWithIds.filter(({ data: row }) => {
      return activeFilters.every(filter => {
        const value = row[filter.columnName];

        switch (filter.columnType) {
          case 'text':
            const textValue = String(value ?? '').toLowerCase();
            const filterValue = filter.value.toLowerCase();
            switch (filter.operator) {
              case 'equals':
                return textValue === filterValue;
              case 'contains':
                return textValue.includes(filterValue);
              case 'startsWith':
                return textValue.startsWith(filterValue);
              case 'endsWith':
                return textValue.endsWith(filterValue);
              default:
                return true;
            }

          case 'number':
            const numValue = Number(value);
            const filterNum = Number(filter.value);
            const filterMax = filter.valueTo ? Number(filter.valueTo) : filterNum;
            switch (filter.operator) {
              case 'equals':
                return numValue === filterNum;
              case 'greaterThan':
                return numValue > filterNum;
              case 'lessThan':
                return numValue < filterNum;
              case 'between':
                return numValue >= filterNum && numValue <= filterMax;
              default:
                return true;
            }

          case 'date':
            const dateValue = value instanceof Date ? value : new Date(String(value));
            const fromDate = filter.from ? new Date(filter.from) : null;
            const toDate = filter.to ? new Date(filter.to) : null;
            if (filter.operator === 'dateRange') {
              if (fromDate && toDate) {
                return dateValue >= fromDate && dateValue <= toDate;
              } else if (fromDate) {
                return dateValue >= fromDate;
              } else if (toDate) {
                return dateValue <= toDate;
              }
            }
            return true;

          case 'category':
            const selectedValues = filter.values || [];
            if (selectedValues.length === 0) return true;
            return selectedValues.includes(String(value));

          default:
            return true;
        }
      });
    });
  }, [rowsWithIds, filters]);

  // Extract just the data for components that need it
  const filteredData = useMemo(() => {
    return filteredRowsWithIds.map(r => r.data);
  }, [filteredRowsWithIds]);

  // Calculate KPIs
  const kpiData = useMemo(() => {
    if (!csvData || filteredData.length === 0) return null;

    const kpiColumns = detectKpiColumns(csvData.columns);
    return calculateKpis(filteredData, kpiColumns);
  }, [csvData, filteredData]);

  // Get filtered row IDs - now O(1) since IDs are already attached!
  const filteredRowIds = useMemo(() => {
    return filteredRowsWithIds.map(r => r.id);
  }, [filteredRowsWithIds]);

  // Export handler
  const handleExport = useCallback(() => {
    if (!csvData) return;

    const csvContent = convertToCsv(filteredData, csvData.columns);
    const fileName = `filtered_${csvData.fileName}`;
    downloadCsv(csvContent, fileName);

    toast.success(t('common.success'), {
      description: `Exported ${filteredData.length} rows to ${fileName}`,
    });
  }, [csvData, filteredData, t]);

  // Delete dataset handler
  const confirmDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/datasets/${datasetId}`, { method: 'DELETE' });
      const result = await response.json();

      if (result.success) {
        toast.success('Dataset deleted');
        router.push('/dashboard');
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Error deleting dataset:', error);
      toast.error('Failed to delete dataset');
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  }, [datasetId, router]);

  // Data cleaning handler
  const handleCleanComplete = useCallback(
    async (
      cleanedData: Record<string, string | number | Date | null>[],
      result: CleaningResult
    ) => {
      setIsCleaning(true);
      try {
        // Update the dataset with cleaned data via API
        const response = await fetch(`/api/datasets/${datasetId}/clean`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cleanedData }),
        });

        const apiResult = await response.json();

        if (apiResult.success) {
          // Show appropriate toast based on whether any changes were made
          if (result.removedRows === 0 && result.modifiedCells === 0) {
            toast.info(t('dataCleaner.noChangesNeeded') || 'No Changes Needed', {
              description:
                t('dataCleaner.noDataModified') ||
                'Your data is already clean! No modifications were necessary.',
            });
          } else {
            toast.success(t('dataCleaner.cleaningComplete') || 'Cleaning Complete!', {
              description: `Removed ${result.removedRows} rows, modified ${result.modifiedCells} cells`,
            });
          }
          // Refresh the data
          refreshData();
        } else {
          throw new Error(apiResult.error);
        }
      } catch (error) {
        console.error('Error saving cleaned data:', error);
        toast.error('Failed to save cleaned data');
      } finally {
        setIsCleaning(false);
      }
    },
    [datasetId, refreshData, t]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!csvData || !dataset) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Dataset not found</p>
        <Button onClick={() => router.push('/dashboard')} className="mt-4">
          Back to Datasets
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">{dataset.name}</h1>
          <p className="text-sm text-muted-foreground">
            {csvData.fileName} • {filteredData.length} {t('common.of')} {csvData.totalRows}{' '}
            {t('common.rows')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push('/dashboard')}
            className="gap-2 border-gray-400 text-gray-600 hover:bg-gray-50 hover:text-gray-700 transition-colors"
          >
            <LayoutGrid className="h-4 w-4" />
            <span className="hidden sm:inline">All Reports</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDataCleaner(true)}
            disabled={isCleaning}
            className="gap-2 border-violet-500 text-violet-600 hover:bg-violet-50 hover:text-violet-700 transition-colors"
          >
            {isCleaning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">{t('dataCleaner.button') || 'Clean Data'}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            className="gap-2 border-blue-500 text-blue-600 hover:bg-blue-50 hover:text-blue-700 transition-colors"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">{t('common.export')}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDeleteModal(true)}
            className="gap-2 border-red-500 text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            <span className="hidden sm:inline">Delete</span>
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      {kpiData && <KpiCards kpiData={kpiData} />}

      {/* Filter Panel - collapsible */}
      <details className="group" open>
        <summary className="flex items-center justify-between p-3 bg-muted/50 rounded-lg cursor-pointer list-none hover:bg-muted/70 transition-colors">
          <span className="font-medium flex items-center gap-2">
            <FilterIcon className="h-4 w-4" />
            {t('filter.title')}
            {filters.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {filters.filter(f => f.isActive).length} active
              </Badge>
            )}
          </span>
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
        </summary>
        <div className="pt-3">
          <FilterPanel
            columns={csvData.columns}
            filters={filters}
            onAddFilter={filter => setFilters(prev => [...prev, filter])}
            onUpdateFilter={(id, updates) =>
              setFilters(prev =>
                prev.map(f => (f.id === id ? ({ ...f, ...updates } as typeof f) : f))
              )
            }
            onRemoveFilter={id => setFilters(prev => prev.filter(f => f.id !== id))}
            onClearAll={() => setFilters([])}
            onSetPriorityColumn={setPriorityColumn}
            priorityColumn={priorityColumn}
          />
        </div>
      </details>

      {/* Charts Section */}
      <ChartContainer data={filteredData} columns={csvData.columns} />

      {/* Data Table Section - Separate section below charts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Data Table</CardTitle>
        </CardHeader>
        <CardContent>
          <EditableTable
            data={filteredData}
            columns={csvData.columns}
            datasetId={datasetId}
            rowIds={filteredRowIds}
            onDataChange={refreshData}
          />
        </CardContent>
      </Card>

      {/* Data Cleaner Modal */}
      <DataCleanerModal
        open={showDataCleaner}
        onOpenChange={setShowDataCleaner}
        data={csvData.rows}
        columns={csvData.columns}
        onCleanComplete={handleCleanComplete}
      />

      {/* Delete Confirmation Modal */}
      <Dialog open={showDeleteModal} onOpenChange={open => !isDeleting && setShowDeleteModal(open)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-2">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
            <DialogTitle className="text-center">Delete Report?</DialogTitle>
            <DialogDescription className="text-center">
              Are you sure you want to delete <span className="font-semibold">{dataset.name}</span>?
              This will permanently remove all {dataset.rowCount.toLocaleString()} rows of data.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:justify-center mt-4">
            <Button
              variant="outline"
              onClick={() => setShowDeleteModal(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={isDeleting}
              className="gap-2"
            >
              {isDeleting ? (
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
